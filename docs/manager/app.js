const state = { dashboard: null, fields: [], records: [], tasks: [], knowledge: [], currentRecord: null };
const names = { healthy: '健康叶片', algal_leaf: '藻斑病', anthracnose: '茶炭疽病', bird_eye_spot: '鸟眼斑', brown_blight: '褐斑病', gray_blight: '灰斑病', red_leaf_spot: '红叶斑', white_spot: '白斑病', tea_white_scab: '茶白星病/白痂症状', tea_blister_blight: '茶饼病', tea_blister_blight_perforation: '茶饼病穿孔期', tea_cloud_leaf_blight: '茶云纹叶枯病', tea_ring_spot: '茶轮斑病', tea_white_star_disease: '茶白星病', tea_bud_blight: '茶芽枯病', tea_small_green_leafhopper: '茶小绿叶蝉', tea_geometrid: '茶尺蠖', tea_tussock_moth: '茶毛虫', tea_orange_gall_mite: '茶橙瘿螨', tea_aphid: '茶蚜', black_spiny_whitefly: '黑刺粉虱', tea_lacewing_weevil: '茶丽纹象甲', leaf_beetle: '叶甲类虫害', apolygus_lucorum: '绿盲蝽类虫害', unknown: '疑似未知症状' };
const severityNames = { low: '轻度', medium: '中度', high: '重度', healthy: '健康', review: '待复核' };

function q(id) { return document.getElementById(id); }
function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function toast(message) { const el = q('toast'); if (!el) return alert(message); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2200); }
async function api(url, options) { try { const response = await fetch(url, options); const text = await response.text(); let data; try { data = text ? JSON.parse(text) : {}; } catch { data = text; } if (!response.ok) throw new Error((data && data.error) || '请求失败'); return data; } catch (error) { if (window.teaDemoApi) return window.teaDemoApi.request(url, options); throw error; } }
function statusLabel(status) { return { healthy: '健康', diagnosed: '已诊断', expert_review: '待专家复核', reviewed: '专家已复核', treated: '已处置', closed: '已闭环', pending: '待完成', completed: '已完成' }[status] || status; }
function formatDate(value) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '暂无'; }
function ratio(value) { return value == null ? '—' : (value * 100).toFixed(1) + '%'; }
function displayName(code) { return names[code] || code || '未知'; }
function screeningState(record) { return record.result?.classCode === 'unknown' || record.result?.needsReview || record.result?.accepted === false ? '待专家复核' : '已完成初筛'; }

async function loadAll() {
  const [dashboard, fields, records, tasks, knowledge, detailed] = await Promise.all([api('/api/dashboard'), api('/api/fields'), api('/api/records'), api('/api/tasks'), api('/api/knowledge'), loadDetailedKnowledge()]);
  const merged = new Map((knowledge || []).map((item) => [item.code, item]));
  (detailed || []).forEach((item) => merged.set(item.code, { ...(merged.get(item.code) || {}), ...item }));
  Object.assign(state, { dashboard, fields, records, tasks, knowledge: [...merged.values()] });
  renderAll();
}

async function loadDetailedKnowledge() {
  try {
    const response = await fetch('../shared/plant-protection-knowledge.json', { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : data.items || [];
  } catch { return []; }
}

function renderAll() { renderMetrics(); renderMap(); renderBars(); renderLatest(); renderFields(); renderRecords(); renderReviews(); renderTasks(); renderModel(); renderFieldOptions(); const header = q('view-records')?.querySelector('thead th:nth-child(4)'); if (header) header.textContent = '初筛状态'; const latestHeader = q('view-dashboard')?.querySelector('thead th:nth-child(4)'); if (latestHeader) latestHeader.textContent = '初筛状态'; }
function renderMetrics() {
  const dashboard = state.dashboard || { fields: 0, records: 0, reviews: 0, completionRate: 0 };
  const items = [['管理地块', dashboard.fields, '⌖', '覆盖茶园数字档案', 'fields'], ['识别记录', dashboard.records, '◎', '图像与诊断全程留痕', 'records'], ['待专家复核', dashboard.reviews, '✓', '低可信样本自动转人工', 'reviews'], ['闭环完成率', dashboard.completionRate + '%', '↻', '处置与复查任务完成情况', 'tasks']];
  q('metrics').innerHTML = items.map((item) => `<button class="card metric metric-action" type="button" data-go="${item[4]}" title="查看${item[0]}"><span><span class="metric-label">${item[0]}</span><span class="metric-value">${item[1]}</span><span class="trend">${item[3]}</span></span><span class="metric-icon" aria-hidden="true">${item[2]}</span></button>`).join('');
}
function renderMap() {
  const positions = [[23, 29], [63, 24], [48, 63], [75, 68], [28, 72]];
  q('mapPins').innerHTML = state.fields.map((field, index) => {
    const point = positions[index % positions.length];
    const color = field.risk === 'high' ? '#d85c5c' : field.risk === 'medium' ? '#e0a12d' : '#4caf73';
    return `<div class="field-pin ${esc(field.risk)}" style="left:${point[0]}%;top:${point[1]}%;background:${color}"><span>${esc(field.name)} · ${esc(field.areaMu)}亩</span></div>`;
  }).join('');
}
function renderBars() {
  const counts = state.dashboard?.classCounts || {};
  const entries = Object.entries(counts).sort((left, right) => right[1] - left[1]);
  if (!entries.length) { q('classBars').innerHTML = '<div class="empty">完成一次识别后显示病虫害分布</div>'; return; }
  const max = Math.max(...entries.map((entry) => entry[1]));
  q('classBars').innerHTML = entries.map(([code, count]) => `<div class="bar-row"><span>${esc(displayName(code))}</span><div class="progress"><span style="width:${Math.max(8, count / max * 100)}%"></span></div><b>${count}</b></div>`).join('');
}
function recordRow(record, actions) {
  const actionHtml = actions ? `<button class="btn ghost" data-record="${record.id}">查看</button>` : '';
  return `<tr><td><div class="record-cell"><img class="thumb" src="${record.imageUrl}"><div><b>${esc(record.diseaseName || displayName(record.result?.classCode))}</b><div class="small muted">${esc(record.reporter)}</div></div></div></td><td>${esc(record.field ? record.field.name : '—')}</td><td>${esc(record.diseaseName || displayName(record.result?.classCode))}<div class="small muted">置信度 ${Math.round((record.result?.confidence || 0) * 100)}%</div></td><td>${esc(screeningState(record))}</td><td>${record.result?.quality?.score || '—'}分</td><td><span class="status ${esc(record.status)}">${statusLabel(record.status)}</span></td><td>${actionHtml}</td></tr>`;
}
function renderLatest() {
  const latest = state.dashboard?.latestRecords || [];
  q('latestRows').innerHTML = latest.length ? latest.map((record) => `<tr><td><div class="record-cell"><img class="thumb" src="${record.imageUrl}"><b>${esc(record.diseaseName)}</b></div></td><td>${esc(record.field ? record.field.name : '—')}</td><td>${esc(record.diseaseName)}</td><td>${esc(screeningState(record))}</td><td><span class="status ${esc(record.status)}">${statusLabel(record.status)}</span></td><td>${formatDate(record.createdAt)}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty">暂无识别记录</div></td></tr>';
}
function renderFields() {
  q('fieldCards').innerHTML = state.fields.map((field) => `<div class="card"><div class="section-head"><div><span class="status ${esc(field.risk)}">${field.risk === 'high' ? '高风险' : field.risk === 'medium' ? '中风险' : '低风险'}</span><h3>${esc(field.name)}</h3></div><div class="metric-icon">⌖</div></div><p class="muted small">${esc(field.garden)} · ${esc(field.variety)}</p><div class="mobile-list"><div class="mobile-list-item"><span>面积</span><b>${esc(field.areaMu)}亩</b></div><div class="mobile-list-item"><span>负责人</span><b>${esc(field.owner)}</b></div><div class="mobile-list-item"><span>最近巡查</span><span>${formatDate(field.lastPatrolAt)}</span></div></div></div>`).join('');
}
function renderRecords() {
  q('recordRows').innerHTML = state.records.length ? state.records.map((record) => recordRow(record, true)).join('') : '<tr><td colspan="7"><div class="empty">暂无识别记录</div></td></tr>';
}
function renderReviews() {
  const records = state.records.filter((record) => record.status === 'expert_review' || record.result?.needsReview);
  q('reviewRows').innerHTML = records.length ? records.map((record) => `<tr><td><div class="record-cell"><img class="thumb" src="${record.imageUrl}"><b>${esc(record.diseaseName)}</b></div></td><td>${esc(record.field ? record.field.name : '—')}</td><td>${esc(record.diseaseName)} · ${Math.round((record.result?.confidence || 0) * 100)}%</td><td>${record.result?.quality?.score || '—'}分</td><td>${formatDate(record.createdAt)}</td><td><button class="btn" data-review="${record.id}">专家确认</button></td></tr>`).join('') : '<tr><td colspan="6"><div class="empty">当前没有待复核病例，页面已正常打开。</div></td></tr>';
}
function renderTasks() {
  q('taskCards').innerHTML = state.tasks.length ? state.tasks.map((task) => `<div class="card"><div class="section-head"><div><span class="status ${esc(task.status)}">${statusLabel(task.status)}</span><h3>${esc(task.title)}</h3></div><div class="metric-icon">◷</div></div><p class="muted small">${esc(task.field ? task.field.name : '—')}</p><div class="mobile-list"><div class="mobile-list-item"><span>责任人</span><b>${esc(task.assignee)}</b></div><div class="mobile-list-item"><span>复查期限</span><span>${formatDate(task.dueAt)}</span></div></div>${task.status !== 'completed' ? `<button class="btn secondary" style="margin-top:14px" data-complete="${task.id}">标记完成</button>` : ''}</div>`).join('') : '<div class="card empty">处置复查页面已正常打开；识别并生成处置后，任务将在此显示。</div>';
}
function renderModel() {
  const model = state.dashboard?.model || { mode: 'unknown', version: 'unknown', supportedClasses: [], notice: '' };
  q('modelPill').textContent = model.mode === 'demo' ? '演示分析器' : '真实模型 ' + model.version;
  q('modelInfo').innerHTML = `<div class="mobile-list"><div class="mobile-list-item"><span>版本</span><b>${esc(model.version)}</b></div><div class="mobile-list-item"><span>运行模式</span><span class="status ${model.mode === 'demo' ? 'medium' : 'reviewed'}">${esc(model.mode)}</span></div><div class="mobile-list-item"><span>支持类别</span><b>${model.supportedClasses.length}类</b></div><div class="mobile-list-item"><span>模型文件</span><b>${esc(model.modelFile || 'models/tea_disease_pest.onnx')}</b></div></div><p class="footer-note">${esc(model.notice)}</p>`;
}
function renderFieldOptions() { q('uploadField').innerHTML = state.fields.map((field) => `<option value="${field.id}">${esc(field.garden)} / ${esc(field.name)}</option>`).join(''); }

function recordKnowledge(record) {
  return state.knowledge.find((item) => item.code === record.result?.classCode) || {};
}

function guidanceLines(value) {
  if (!Array.isArray(value)) return esc(value || '暂无');
  return '<ul class="knowledge-list">' + value.map((item) => {
    if (item && typeof item === 'object') return '<li>' + esc([item.pesticide, item.dilution, item.timing, item.safety_interval].filter(Boolean).join('；')) + '</li>';
    return '<li>' + esc(item) + '</li>';
  }).join('') + '</ul>';
}

function renderGuidance(record) {
  const item = recordKnowledge(record);
  const agricultural = item.agriculturalControl || item.agricultural_control;
  const chemical = item.chemicalControl || item.chemical_control;
  const notes = item.precautions || item.notes;
  if (!item.name) return '<section class="knowledge-panel"><div class="knowledge-heading"><h3>治理建议</h3></div><div class="knowledge-section"><p>当前类别暂无可用的治理方案，请提交农技人员复核。</p></div></section>';
  return '<section class="knowledge-panel"><div class="knowledge-heading"><h3>治理建议</h3><span class="small muted">按识别类别匹配</span></div><article class="knowledge-card"><div class="knowledge-card-head"><h4>' + esc(item.name) + '</h4><span class="badge">' + (item.category === 'pest' ? '虫害' : item.category === 'health' ? '健康' : '病害') + '</span></div><div class="knowledge-grid"><div class="knowledge-section"><b>症状描述</b><p>' + esc(item.symptoms || '暂无') + '</p></div><div class="knowledge-section"><b>发病条件</b><p>' + esc(item.conditions || '暂无') + '</p></div><div class="knowledge-section"><b>农业防治</b><p>' + guidanceLines(agricultural) + '</p></div><div class="knowledge-section"><b>药剂防治</b><p>' + guidanceLines(chemical) + '</p></div><div class="knowledge-section"><b>注意事项</b><p>' + esc(notes || '药剂使用必须以茶树登记标签和当地农技人员意见为准。') + '</p></div></div></article></section>';
}

function showView(name, options = {}) {
  const target = q('view-' + name);
  if (!target) { toast('页面不存在：' + name); return; }
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  target.classList.add('active');
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
  if (options.hash !== false) history.replaceState(null, '', '#' + name);
  if (options.scroll !== false) window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showResult(record) {
  state.currentRecord = record;
  showView('detect', { hash: false, scroll: false });
  q('resultCard').style.display = 'block';
  q('resultImage').src = record.imageUrl;
  q('resultName').textContent = record.diseaseName || displayName(record.result?.classCode);
  q('resultEngine').textContent = record.result?.engine?.includes('onnx') ? '真实模型 · ' + record.result.engine : '浏览器静态演示';
  q('resultDetails').innerHTML = `<div class="mobile-list"><div class="mobile-list-item"><span>模型置信度</span><b>${Math.round((record.result?.confidence || 0) * 1000) / 10}%</b></div><div class="mobile-list-item"><span>初筛状态</span><b>${esc(screeningState(record))}</b></div><div class="mobile-list-item"><span>图像质量</span><b>${record.result?.quality?.score || '—'}分</b></div></div><p>${esc(record.advice)}</p><p class="small muted">${esc(record.result?.explanation)}</p>${renderGuidance(record)}`;
  q('resultDisclaimer').textContent = record.result?.disclaimer || '';
}
async function reviewRecord(id) {
  const classCode = prompt('专家确认类别代码（例如 anthracnose / leaf_beetle / apolygus_lucorum）', 'anthracnose');
  if (!classCode) return;
  const comment = prompt('专家意见', '经图像复核，建议结合现场症状处理。') || '已复核';
  await api('/api/records/' + id + '/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classCode, expert: '示范农技专家', comment }) });
  toast('专家复核已保存');
  await loadAll();
  showView('reviews', { scroll: false });
}
async function completeTask(id) {
  await api('/api/tasks/' + id + '/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: 'Web端完成' }) });
  toast('任务已完成');
  await loadAll();
  showView('tasks', { scroll: false });
}

function bindEvents() {
  document.addEventListener('click', async (event) => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) { event.preventDefault(); showView(viewButton.dataset.view); return; }
    const goButton = event.target.closest('[data-go]');
    if (goButton) { event.preventDefault(); showView(goButton.dataset.go); return; }
    const recordButton = event.target.closest('[data-record]');
    if (recordButton) { event.preventDefault(); const record = state.records.find((item) => item.id === recordButton.dataset.record); if (record) showResult(record); return; }
    const reviewButton = event.target.closest('[data-review]');
    if (reviewButton) { event.preventDefault(); await reviewRecord(reviewButton.dataset.review); return; }
    const completeButton = event.target.closest('[data-complete]');
    if (completeButton) { event.preventDefault(); await completeTask(completeButton.dataset.complete); }
  });
  q('refreshAll').onclick = () => loadAll().then(() => toast('数据已刷新'));
  q('uploadForm').onsubmit = async (event) => {
    event.preventDefault();
    const files = Array.from(q('uploadImage')?.files || []);
    if (!files.length) return;
    try {
      toast(files.length > 1 ? `正在识别 ${files.length} 张图片` : '正在分析图片');
      const results = [];
      for (const file of files) {
        const form = new FormData(event.target);
        form.delete('image');
        form.append('image', file, file.name);
        form.set('source', 'manager-web');
        results.push(await api('/api/predict', { method: 'POST', body: form }));
      }
      showResult(results[0]);
      if (q('batchSummary')) q('batchSummary').textContent = results.length > 1 ? `本批次完成 ${results.length} 张，当前展示第 1 张结果。` : '';
      toast(`识别完成，共 ${results.length} 张`);
      await loadAll();
      showResult(results[0]);
    } catch (error) { toast(error.message); }
  };
  q('submitReview').onclick = async () => { if (state.currentRecord) await reviewRecord(state.currentRecord.id); };
  q('createTreatment').onclick = async () => {
    if (!state.currentRecord) return;
    const measure = prompt('记录处理措施', '清理异常叶片、改善通风，并按照农技专家意见处理');
    if (!measure) return;
    await api('/api/records/' + state.currentRecord.id + '/treatment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ measure, operator: '项目演示员' }) });
    toast('已生成处置与复查任务');
    await loadAll();
    showView('tasks');
  };
  q('addField').onclick = async () => {
    const name = prompt('地块名称', 'C-01 新增试点地');
    if (!name) return;
    await api('/api/fields', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ garden: '新增试点茶园', name, areaMu: 10, variety: '待补充', owner: '项目团队' }) });
    await loadAll();
  };
  q('downloadReport').onclick = async () => { const report = await api('/api/report/summary'); const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' }); const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); };
}

bindEvents();
loadAll().then(() => showView((location.hash || '#dashboard').slice(1), { hash: false, scroll: false })).catch((error) => toast(error.message));
