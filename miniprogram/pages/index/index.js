const api = require('../../utils/api');

Page({
  data: {
    dashboard: { records: 0, reviews: 0, tasks: 0, completedTasks: 0 },
    pendingTasks: 0,
    latest: [],
    guideVisible: false,
    helpVisible: false,
    helpTitle: '',
    helpText: ''
  },

  onLoad() {
    this.setData({ guideVisible: wx.getStorageSync('teaGuideSeen.v1') !== '1' });
  },

  onShow() {
    this.load();
  },

  async load() {
    try {
      const dashboard = await api.request('/api/dashboard');
      const pendingTasks = Math.max(0, Number(dashboard.tasks || 0) - Number(dashboard.completedTasks || 0));
      this.setData({
        dashboard,
        pendingTasks,
        latest: dashboard.latestRecords || []
      });
    } catch (error) {
      wx.showToast({ title: '服务未启动', icon: 'none' });
    }
  },

  finishGuide() {
    wx.setStorageSync('teaGuideSeen.v1', '1');
    this.setData({ guideVisible: false });
  },

  startGuide() {
    this.finishGuide();
    this.goCapture();
  },

  showHelp(event) {
    const key = event.currentTarget.dataset.key;
    const content = {
      patrol: ['今日巡园', '从拍照识别开始，查看识别结果，再根据专家复核和复查任务完成处置闭环。'],
      records: ['识别记录', '这里保存全部识别结果，包括类别、置信度、图像质量和处置状态。'],
      reviews: ['待复核', 'AI识别完成，等待农技专家人工核验。低置信度或疑似未知样本会进入这里。'],
      tasks: ['复查任务', '初次复核存疑或完成处置后，需要按期限再次到现场核查的记录。']
    }[key] || ['使用说明', '请按页面提示完成茶园巡查。'];
    this.setData({ helpVisible: true, helpTitle: content[0], helpText: content[1] });
  },

  closeHelp() {
    this.setData({ helpVisible: false });
  },

  noop() {},

  goCapture() { wx.navigateTo({ url: '/pages/capture/capture' }); },
  goHistory() { wx.navigateTo({ url: '/pages/history/history' }); },
  goReviews() { wx.navigateTo({ url: '/pages/history/history?status=expert_review' }); },
  goTasks() { wx.navigateTo({ url: '/pages/tasks/tasks' }); },
  goFields() { wx.navigateTo({ url: '/pages/fields/fields' }); }
});
