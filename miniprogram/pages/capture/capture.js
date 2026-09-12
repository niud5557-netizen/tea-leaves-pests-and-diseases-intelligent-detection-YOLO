const api = require('../../utils/api');

function percentage(value) {
  const number = Number(value || 0);
  return (number > 1 ? number : number * 100).toFixed(1) + '%';
}

function normalizeKnowledge(item) {
  item = item || {};
  return Object.assign({}, item, {
    agricultural: item.agriculturalControl || item.agricultural_control || [],
    chemical: item.chemicalControl || item.chemical_control || [],
    notes: item.precautions || item.notes || ''
  });
}

function plainList(value, chemical) {
  if (!Array.isArray(value)) return value ? [String(value)] : ['暂无'];
  return value.map((item) => {
    if (item && typeof item === 'object') {
      return [item.pesticide, item.dilution, item.timing, item.safety_interval].filter(Boolean).join('；');
    }
    return String(item);
  });
}

Page({
  data: {
    fields: [],
    fieldIndex: 0,
    fieldName: '',
    fieldsLoading: true,
    fieldError: '',
    image: '',
    uploading: false,
    result: null,
    confidenceText: '',
    screeningText: '',
    knowledge: [],
    cameraVisible: false,
    cameraBusy: false,
    disclaimer: '治理建议仅供初步参考。涉及用药时必须遵守当地登记范围、标签剂量和安全间隔；大面积或快速扩散的病虫害请咨询农技人员。'
  },

  onLoad() {
    this.loadFields();
    this.loadKnowledge();
  },

  onShow() {
    if (!this.data.fields.length && !this.data.fieldsLoading) {
      this.setData({ fieldsLoading: true, fieldError: '' });
      this.loadFields();
    }
  },

  async loadFields() {
    try {
      const fields = await api.request('/api/fields');
      this.setData({
        fields,
        fieldIndex: 0,
        fieldName: fields[0] ? fields[0].name : '',
        fieldsLoading: false,
        fieldError: fields.length ? '' : '服务端暂无茶园地块，请先在管理网页添加地块。'
      });
    } catch (error) {
      this.setData({ fieldsLoading: false, fieldError: '无法连接电脑服务，请确认手机与电脑在同一 Wi-Fi，并检查服务地址。' });
      wx.showToast({ title: '地块加载失败', icon: 'none' });
    }
  },

  async loadKnowledge() {
    try {
      const items = await api.request('/api/knowledge');
      this.knowledgeMap = new Map((items || []).map((item) => [item.code, normalizeKnowledge(item)]));
    } catch (error) {
      this.knowledgeMap = new Map();
    }
  },

  fieldChange(event) {
    const fieldIndex = Number(event.detail.value);
    this.setData({ fieldIndex, fieldName: this.data.fields[fieldIndex] ? this.data.fields[fieldIndex].name : '' });
  },

  choose() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: (response) => this.setData({ image: response.tempFiles[0].tempFilePath, result: null, knowledge: [] })
    });
  },

  openCamera() {
    this.setData({ cameraVisible: true });
  },

  closeCamera() {
    this.setData({ cameraVisible: false, cameraBusy: false });
  },

  async takeCameraPhoto() {
    if (this.data.cameraBusy) return;
    const now = Date.now();
    if (this.lastCameraShotAt && now - this.lastCameraShotAt < 1500) {
      wx.showToast({ title: '请间隔1.5秒再拍', icon: 'none' });
      return;
    }
    this.lastCameraShotAt = now;
    this.setData({ cameraBusy: true });
    try {
      const camera = wx.createCameraContext();
      const photo = await new Promise((resolve, reject) => {
        camera.takePhoto({ quality: 'normal', success: resolve, fail: reject });
      });
      this.setData({ image: photo.tempImagePath, result: null, knowledge: [], cameraVisible: false });
      wx.showToast({ title: '照片已采集' });
    } catch (error) {
      wx.showToast({ title: '相机采集失败', icon: 'none' });
    } finally {
      this.setData({ cameraBusy: false });
    }
  },

  resultKnowledge(result) {
    const source = result.result || {};
    const raw = Array.isArray(source.detections) && source.detections.length
      ? source.detections
      : [{ classCode: source.classCode, confidence: source.confidence }];
    const unique = new Map();

    raw.forEach((detection) => {
      const code = detection.classCode || detection.code || source.classCode || 'unknown';
      const confidence = Number(detection.confidence == null ? source.confidence || 0 : detection.confidence);
      const previous = unique.get(code);
      if (!previous || confidence > previous.confidence) unique.set(code, { code, confidence });
    });

    let detections = Array.from(unique.values());
    if (detections.some((item) => item.code !== 'healthy')) detections = detections.filter((item) => item.code !== 'healthy');

    return detections.map((detection) => {
      const item = this.knowledgeMap && this.knowledgeMap.get(detection.code) || normalizeKnowledge({
        code: 'unknown', name: '疑似未知症状', category: 'unknown', symptoms: '当前类别暂无匹配的植保知识。',
        conditions: '请结合现场环境和专家意见判断。', agricultural_control: ['补拍叶片正反面、嫩梢和周边环境后提交复核。'],
        chemical_control: ['未完成专家确认前，不建议自行施药。'], notes: '治理建议仅供参考。'
      });
      return {
        name: item.name,
        categoryText: item.category === 'pest' ? '虫害' : item.category === 'disease' ? '病害' : item.category === 'health' ? '健康' : '待确认',
        confidence: percentage(detection.confidence),
        symptoms: item.symptoms || '暂无',
        conditions: item.conditions || '暂无',
        agricultural: plainList(item.agricultural),
        chemical: plainList(item.chemical, true),
        notes: item.notes || '暂无'
      };
    });
  },

  async predict() {
    if (!this.data.image) return wx.showToast({ title: '请先拍照', icon: 'none' });
    if (!this.data.fields.length) return wx.showToast({ title: '请先加载茶园地块', icon: 'none' });
    this.setData({ uploading: true });
    try {
      if (!this.knowledgeMap) await this.loadKnowledge();
      const field = this.data.fields[this.data.fieldIndex];
      const result = await api.upload('/api/predict', this.data.image, {
        fieldId: field && field.id || '',
        source: 'wechat-miniprogram',
        reporter: '小程序巡园员'
      });
      const analysis = result.result || {};
      const screeningText = analysis.needsReview || analysis.classCode === 'unknown' || analysis.accepted === false ? '待专家复核' : '已完成初筛';
      this.setData({
        result,
        confidenceText: percentage(analysis.confidence),
        screeningText,
        knowledge: this.resultKnowledge(result)
      });
      wx.showToast({ title: '识别完成' });
    } catch (error) {
      wx.showToast({ title: error.message || '识别失败', icon: 'none' });
    } finally {
      this.setData({ uploading: false });
    }
  },

  async review() {
    if (!this.data.result) return;
    try {
      await api.request('/api/records/' + this.data.result.id + '/review', 'POST', { expert: '小程序农技员', comment: '已提交专家复核' });
      wx.showToast({ title: '已提交复核' });
    } catch (error) { wx.showToast({ title: error.message || '提交失败', icon: 'none' }); }
  },

  async treat() {
    if (!this.data.result) return;
    try {
      await api.request('/api/records/' + this.data.result.id + '/treatment', 'POST', { measure: '已完成基础农业防控处理', operator: '小程序巡园员' });
      wx.showToast({ title: '已生成复查任务' });
    } catch (error) { wx.showToast({ title: error.message || '记录失败', icon: 'none' }); }
  }
});
