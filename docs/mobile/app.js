var ms = {
  fields: [],
  records: [],
  tasks: [],
  current: null,
  knowledge: new Map(),
  disclaimer: '治理建议仅供参考。大面积或快速扩散的病虫害请咨询农技人员。',
  historyFilter: null
};

var cn = {
  healthy: '健康叶片',
  algal_leaf: '藻斑病',
  anthracnose: '茶炭疽病',
  bird_eye_spot: '鸟眼斑',
  brown_blight: '褐斑病',
  gray_blight: '灰斑病',
  red_leaf_spot: '红叶斑',
  white_spot: '白斑病',
  tea_white_scab: '茶白星病/白痂症状',
  tea_blister_blight: '茶饼病',
  tea_blister_blight_perforation: '茶饼病穿孔期',
  leaf_beetle: '叶甲类虫害',
  apolygus_lucorum: '绿盲蝽类虫害',
  unknown: '疑似未知症状'
};

var helpContent = {
  patrol: { title: '今日巡园', text: '从拍照识别开始，查看识别结果，再根据专家复核和复查任务完成处置闭环。' },
  fields: { title: '地块风险', text: '这里显示各地块的当前风险等级和基础信息，风险会随现场识别结果更新。' },
  records: { title: '识别记录', text: '查看全部巡查识别记录，包括识别类别、置信度、图像质量和当前处置状态。' },
  reviews: { title: '待复核', text: 'AI识别完成，等待农技专家人工核验。低置信度、疑似未知或模型主动拒识的记录会进入这里。' },
  capture: { title: '拍照识别', text: '选择地块并上传清晰的叶片、嫩梢或虫体照片，系统会先给出AI初筛结果。' },
  tasks: { title: '复查任务', text: '初次复核存疑，需要二次核查的记录。完成处置后请按任务日期回到现场复查。' }
};

function e(id) { return document.getElementById(id); }

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}

function mt(msg) {
  var x = e('mToast');
  if (!x) return;
  x.textContent = msg;
  x.classList.add('show');
  clearTimeout(mt.timer);
  mt.timer = setTimeout(function () { x.classList.remove('show'); }, 2200);
}

async function ma(url, opt) {
  try {
    var r = await fetch(url, opt);
    var t = await r.text();
    var d;
    try { d = t ? JSON.parse(t) : {}; } catch { d = t; }
    if (!r.ok) throw new Error(d && d.error || '请求失败');
    return d;
  } catch (err) {
    if (window.teaDemoApi) return window.teaDemoApi.request(url, opt);
    throw err;
  }
}

function fd(v) {
  return v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : '暂无';
}

function risk(value) {
  return value === 'high' ? '高风险' : value === 'medium' ? '中风险' : '低风险';
}

function statusText(value) {
  return value === 'high' ? '重度' : value === 'medium' ? '中度' : value === 'healthy' ? '健康' : value === 'review' ? '待复核' : '轻度';
}

function statusScreening(record) {
  var resultData = record && record.result || {};
  return record && record.status === 'expert_review' || resultData.classCode === 'unknown' || resultData.needsReview || resultData.accepted === false ? '待专家复核' : '已完成初筛';
}

function knowledgeFor(code) {
  return ms.knowledge.get(code) || ms.knowledge.get('unknown') || {
    code: 'unknown',
    name: cn.unknown,
    category: 'unknown',
    symptoms: '暂无匹配的症状说明。',
    conditions: '请结合现场环境和专家意见判断。',
    agriculturalControl: '补拍清晰的叶片正反面、整株和周边环境照片后提交复核。',
    chemicalControl: '未完成专家确认前，不建议自行用药。',
    precautions: '治理建议仅供参考。'
  };
}

function normalizeKnowledgeItem(item) {
  item = item || {};
  var agricultural = item.agriculturalControl || item.agricultural_control || '';
  var chemical = item.chemicalControl || item.chemical_control || '';
  var precautions = item.precautions || item.notes || '';
  return Object.assign({}, item, {
    code: item.code || item.name || 'unknown',
    agriculturalControl: agricultural,
    chemicalControl: chemical,
    precautions: precautions,
    advice: item.advice || (Array.isArray(agricultural) ? agricultural[0] : agricultural) || precautions
  });
}

async function loadKnowledge() {
  try {
    var responses = await Promise.all([
      fetch('../shared/knowledge-base.json', { cache: 'no-store' }),
      fetch('../shared/plant-protection-knowledge.json', { cache: 'no-store' })
    ]);
    if (!responses[0].ok || !responses[1].ok) throw new Error('知识库加载失败');
    var database = await responses[0].json();
    var detailed = await responses[1].json();
    var items = Array.isArray(database) ? database : database.items || [];
    var detailedItems = Array.isArray(detailed) ? detailed : detailed.items || [];
    var merged = new Map();
    items.concat(detailedItems).map(normalizeKnowledgeItem).forEach(function (item) {
      if (item && item.code) merged.set(String(item.code), item);
    });
    ms.knowledge = merged;
    if (database.disclaimer) ms.disclaimer = database.disclaimer;
  } catch (err) {
    ms.knowledge = new Map();
    mt('治理知识库暂不可用，已保留基础识别结果');
  }
}

function normalizeCode(value, resultData) {
  if (value == null || value === '') return 'unknown';
  if (typeof value === 'number' && Array.isArray(resultData.classNames)) return resultData.classNames[value] || 'unknown';
  var code = String(value);
  if (ms.knowledge.has(code) || cn[code]) return code;
  var matched = Array.from(ms.knowledge.values()).find(function (item) { return item.name === code; });
  return matched ? matched.code : 'unknown';
}

function getDetections(record) {
  var resultData = record && record.result || {};
  var raw = resultData.detections || record && record.detections;
  if (!Array.isArray(raw) || !raw.length) raw = [{
    classCode: resultData.classCode || record && record.classCode || 'unknown',
    confidence: resultData.confidence
  }];

  var best = new Map();
  raw.forEach(function (detection) {
    detection = detection || {};
    var code = normalizeCode(detection.classCode != null ? detection.classCode : detection.code != null ? detection.code : detection.class_id != null ? detection.class_id : detection.classId != null ? detection.classId : detection.label, resultData);
    var confidenceValue = detection.confidence != null ? detection.confidence : detection.score != null ? detection.score : detection.probability != null ? detection.probability : resultData.confidence;
    var confidence = Number(confidenceValue);
    if (!Number.isFinite(confidence)) confidence = 0;
    if (confidence > 1) confidence /= 100;
    confidence = Math.max(0, Math.min(1, confidence));
    var previous = best.get(code);
    if (!previous || confidence > previous.confidence) best.set(code, { code: code, confidence: confidence });
  });

  var detections = Array.from(best.values()).sort(function (a, b) { return b.confidence - a.confidence; });
  if (detections.some(function (detection) { return detection.code !== 'healthy'; })) {
    detections = detections.filter(function (detection) { return detection.code !== 'healthy'; });
  }
  return detections.length ? detections : [{ code: 'unknown', confidence: 0 }];
}

function detectionName(detection) {
  return knowledgeFor(detection.code).name || cn[detection.code] || detection.code;
}

function knowledgeValue(value) {
  if (Array.isArray(value)) {
    return '<ul class="knowledge-list">' + value.map(function (item) {
      if (item && typeof item === 'object') {
        return '<li>' + esc([item.pesticide, item.dilution, item.timing, item.safety_interval].filter(Boolean).join('；')) + '</li>';
      }
      return '<li>' + esc(item) + '</li>';
    }).join('') + '</ul>';
  }
  if (value && typeof value === 'object') return esc(JSON.stringify(value));
  return esc(value || '暂无');
}

function renderHistory() {
  var records = ms.records.slice();
  var title = '巡查历史';
  if (ms.historyFilter === 'reviews') {
    title = '待复核';
    records = records.filter(function (record) {
      var resultData = record.result || {};
      return record.status === 'expert_review' || resultData.needsReview;
    });
  }
  e('mHistoryTitle').textContent = title;
  var help = document.querySelector('#m-history [data-help]');
  if (help) {
    help.dataset.help = ms.historyFilter === 'reviews' ? 'reviews' : 'records';
    help.setAttribute('aria-label', ms.historyFilter === 'reviews' ? '查看待复核说明' : '查看巡查历史说明');
  }
  e('mHistory').innerHTML = records.length ? records.map(item).join('') : '<div class="empty">' + (ms.historyFilter === 'reviews' ? '当前没有待复核记录。' : '暂无巡查历史。') + '</div>';
}

function renderTasks(showPendingOnly) {
  var tasks = showPendingOnly ? ms.tasks.filter(function (task) { return task.status !== 'completed'; }) : ms.tasks;
  e('mTaskList').innerHTML = tasks.length ? tasks.map(function (task) {
    return '<div class="mobile-list-item"><div><b>' + esc(task.title || '复查任务') + '</b><div class="small muted">' + esc(task.field ? task.field.name : '') + ' · ' + esc(fd(task.dueAt)) + '</div></div><span class="status ' + esc(task.status || 'pending') + '">' + (task.status === 'completed' ? '已完成' : '待复查') + '</span></div>';
  }).join('') : '<div class="empty">' + (showPendingOnly ? '暂无待完成的复查任务。' : '暂无处置与复查任务。') + '</div>';
}

function show(name) {
  document.querySelectorAll('.mview').forEach(function (view) { view.style.display = 'none'; });
  var target = e('m-' + name);
  if (!target) return;
  target.style.display = 'block';
  document.querySelectorAll('[data-mgo]').forEach(function (link) { link.classList.toggle('active', link.dataset.mgo === name); });
  if (name === 'history') renderHistory();
  if (name === 'tasks') renderTasks(false);
  if (name === 'capture') window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openHelp(key) {
  var content = helpContent[key] || helpContent.records;
  e('helpTitle').textContent = content.title;
  e('helpText').textContent = content.text;
  e('helpModal').hidden = false;
}

function closeModals() {
  e('helpModal').hidden = true;
  e('onboardingModal').hidden = true;
}

function completeOnboarding() {
  try { localStorage.setItem('aiTeaCheck.mobileOnboarding.v1', '1'); } catch (err) {}
  e('onboardingModal').hidden = true;
}

function maybeShowOnboarding() {
  var seen = false;
  try { seen = localStorage.getItem('aiTeaCheck.mobileOnboarding.v1') === '1'; } catch (err) {}
  if (!seen) e('onboardingModal').hidden = false;
}

async function load() {
  var data = await Promise.all([ma('/api/dashboard'), ma('/api/fields'), ma('/api/records'), ma('/api/tasks')]);
  var dashboard = data[0] || {};
  ms.fields = Array.isArray(data[1]) ? data[1] : [];
  ms.records = Array.isArray(data[2]) ? data[2] : [];
  ms.tasks = Array.isArray(data[3]) ? data[3] : [];
  e('mRecords').textContent = dashboard.records == null ? ms.records.length : dashboard.records;
  e('mReviews').textContent = dashboard.reviews == null ? ms.records.filter(function (record) { return record.status === 'expert_review' || record.result && record.result.needsReview; }).length : dashboard.reviews;
  e('mTasks').textContent = dashboard.tasks == null ? ms.tasks.filter(function (task) { return task.status !== 'completed'; }).length : Math.max(0, dashboard.tasks - (dashboard.completedTasks || 0));
  e('mFieldSelect').innerHTML = ms.fields.map(function (field) { return '<option value="' + esc(field.id) + '">' + esc(field.garden) + ' / ' + esc(field.name) + '</option>'; }).join('');
  e('mFieldList').innerHTML = ms.fields.length ? ms.fields.map(function (field) {
    return '<div class="mobile-list-item"><div><b>' + esc(field.name) + '</b><div class="small muted">' + esc(field.areaMu) + '亩 · ' + esc(field.variety) + '</div></div><span class="status ' + esc(field.risk) + '">' + risk(field.risk) + '</span></div>';
  }).join('') : '<div class="empty">暂无地块信息。</div>';
  var latest = ms.records.slice(0, 4);
  e('mRecent').innerHTML = latest.length ? latest.map(item).join('') : '<div class="empty">暂无识别记录，点击“拍照识别”体验一下吧。</div>';
  renderHistory();
  renderTasks(false);
}

function item(record) {
  var detections = getDetections(record);
  var primary = detections[0];
  var resultData = record.result || {};
  var names = detections.slice(0, 2).map(detectionName).join('、');
  if (detections.length > 2) names += '等';
  return '<div class="mobile-list-item"><div><b>' + esc(record.diseaseName || names || cn.unknown) + '</b><div class="small muted">' + esc(record.field ? record.field.name : '') + ' · ' + esc(fd(record.createdAt)) + ' · ' + Math.round(primary.confidence * 100) + '%</div></div><span class="status ' + esc(resultData.severity || record.status || 'pending') + '">' + esc(statusText(resultData.severity)) + '</span></div>';
}

function renderKnowledge(record) {
  var panel = e('mKnowledge');
  var detections = getDetections(record);
  panel.innerHTML = '<div class="knowledge-heading"><h3>治理建议</h3><span class="small muted">按识别类别匹配</span></div>' + detections.map(function (detection) {
    var knowledge = knowledgeFor(detection.code);
    var agricultural = knowledge.agriculturalControl || knowledge.agricultural_control;
    var chemical = knowledge.chemicalControl || knowledge.chemical_control;
    var precautions = knowledge.precautions || knowledge.notes;
    var category = knowledge.category === 'pest' ? '虫害' : knowledge.category === 'health' ? '健康' : knowledge.category === 'disease' ? '病害' : '待确认';
    return '<article class="knowledge-card"><div class="knowledge-card-head"><div><h4>' + esc(knowledge.name || cn[detection.code]) + '</h4><span class="small muted">置信度 ' + Math.round(detection.confidence * 1000) / 10 + '%</span></div><span class="badge">' + category + '</span></div><div class="knowledge-grid"><div class="knowledge-section"><b>症状描述</b><p>' + knowledgeValue(knowledge.symptoms) + '</p></div><div class="knowledge-section"><b>发病条件</b><p>' + knowledgeValue(knowledge.conditions) + '</p></div><div class="knowledge-section"><b>农业防治</b><p>' + knowledgeValue(agricultural) + '</p></div><div class="knowledge-section"><b>药剂防治</b><p>' + knowledgeValue(chemical) + '</p></div><div class="knowledge-section"><b>注意事项</b><p>' + knowledgeValue(precautions) + '</p></div></div></article>';
  }).join('');
  panel.hidden = false;
}

function result(record) {
  ms.current = record;
  var resultData = record.result || {};
  var detections = getDetections(record);
  e('mResult').style.display = 'block';
  e('mResultImage').src = record.imageUrl || '';
  e('mResultImage').style.display = record.imageUrl ? 'block' : 'none';
  e('mResultName').textContent = detections.map(detectionName).join('、');
  e('mResultDetail').innerHTML = '<div class="mobile-list"><div class="mobile-list-item"><span>识别类别</span><b>' + esc(detections.map(detectionName).join('、')) + '</b></div><div class="mobile-list-item"><span>模型把握度</span><b>' + Math.round(detections[0].confidence * 1000) / 10 + '%</b></div><div class="mobile-list-item"><span>初筛状态</span><b>' + esc(statusScreening(record)) + '</b></div><div class="mobile-list-item"><span>图像质量</span><b>' + esc(resultData.quality && resultData.quality.score != null ? resultData.quality.score : '—') + '分</b></div></div>' + (record.advice ? '<p>' + esc(record.advice) + '</p>' : '');
  renderKnowledge(record);
  e('mDisclaimer').textContent = ms.disclaimer || resultData.disclaimer || '治理建议仅供参考，大面积病害请咨询农技人员。';
}

document.querySelectorAll('[data-mgo]').forEach(function (link) {
  link.onclick = function (event) {
    event.preventDefault();
    ms.historyFilter = null;
    show(link.dataset.mgo);
    if (link.dataset.mgo === 'history') renderHistory();
    if (link.dataset.mgo === 'tasks') renderTasks(false);
    if (link.getAttribute('href')) history.replaceState(null, '', link.getAttribute('href'));
  };
});

document.querySelectorAll('[data-stat-target]').forEach(function (card) {
  card.onclick = function () {
    var target = card.dataset.statTarget;
    if (target === 'reviews') {
      ms.historyFilter = 'reviews';
      show('history');
    } else if (target === 'tasks') {
      ms.historyFilter = null;
      show('tasks');
      renderTasks(true);
    } else {
      ms.historyFilter = null;
      show('history');
    }
    history.replaceState(null, '', '#' + (target === 'reviews' ? 'history' : target));
  };
});

document.querySelectorAll('[data-help]').forEach(function (button) {
  button.onclick = function () { openHelp(button.dataset.help); };
});

e('guideSkip').onclick = completeOnboarding;
e('guideStart').onclick = function () {
  completeOnboarding();
  show('capture');
  history.replaceState(null, '', '#capture');
};
e('helpClose').onclick = function () { e('helpModal').hidden = true; };

document.querySelectorAll('.modal-backdrop').forEach(function (backdrop) {
  backdrop.addEventListener('click', function (event) {
    if (event.target === backdrop) backdrop.hidden = true;
  });
});
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') closeModals();
});

e('mUpload').onsubmit = async function (event) {
  event.preventDefault();
  var files = Array.from(event.target.elements.image.files || []);
  if (!files.length) return;
  try {
    mt(files.length > 1 ? '正在逐张识别' : '正在识别');
    var records = [];
    for (var index = 0; index < files.length; index += 1) {
      var form = new FormData(event.target);
      form.delete('image');
      form.append('image', files[index], files[index].name);
      form.set('source', 'mobile-web');
      records.push(await ma('/api/predict', { method: 'POST', body: form }));
    }
    result(records[0]);
    if (e('mBatchSummary')) e('mBatchSummary').textContent = records.length > 1 ? '本批次完成 ' + records.length + ' 张，当前展示第 1 张结果。' : '';
    mt('识别完成，共 ' + records.length + ' 张');
    await load();
  } catch (err) {
    mt(err.message || '识别失败');
  }
};

e('mReview').onclick = async function () {
  if (!ms.current) return;
  try {
    await ma('/api/records/' + encodeURIComponent(ms.current.id) + '/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expert: '移动农技员', comment: '已提交移动端专家复核' }) });
    mt('已提交专家复核');
    await load();
  } catch (err) { mt(err.message || '提交失败'); }
};

e('mTreat').onclick = async function () {
  if (!ms.current) return;
  try {
    await ma('/api/records/' + encodeURIComponent(ms.current.id) + '/treatment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ measure: '现场已完成基础农业防控处理', operator: '移动巡园员' }) });
    mt('处置已记录并生成复查任务');
    await load();
  } catch (err) { mt(err.message || '记录失败'); }
};

(async function init() {
  await loadKnowledge();
  await load();
  var hash = location.hash.slice(1);
  if (hash === 'capture' || hash === 'history' || hash === 'tasks') show(hash);
  maybeShowOnboarding();
}()).catch(function (err) { mt(err.message || '页面数据加载失败'); });
