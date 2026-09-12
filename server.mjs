import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { analyzeImage } from './lib/analyzer.mjs';
import { createId, loadDatabase, mutateDatabase } from './lib/store.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const uploadDirectory = path.join(root, 'data', 'uploads');
const plantKnowledgePath = path.join(root, 'public', 'shared', 'plant-protection-knowledge.json');
await fs.mkdir(uploadDirectory, { recursive: true });
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 10);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDirectory, { maxAge: '1h' }));
app.use('/shared', express.static(path.join(root, 'public', 'shared')));
app.use('/demo', express.static(path.join(root, 'public', 'demo')));
app.use('/manager', express.static(path.join(root, 'public', 'manager')));
app.use('/mobile', express.static(path.join(root, 'public', 'mobile')));

const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    callback(null, Date.now() + '-' + Math.random().toString(36).slice(2, 9) + extension);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (!file.mimetype?.startsWith('image/')) return callback(new Error('仅支持图片文件'));
    callback(null, true);
  }
});

function knowledgeFor(database, code) {
  return database.knowledge.find((item) => item.code === code) || database.knowledge.find((item) => item.code === 'unknown');
}

function displayRecord(record, database) {
  const field = database.fields.find((item) => item.id === record.fieldId);
  const knowledge = knowledgeFor(database, record.result.classCode);
  return {
    ...record,
    imageUrl: '/uploads/' + record.imageFile,
    field,
    diseaseName: knowledge?.name || record.result.classCode,
    advice: record.advice || knowledge?.advice || ''
  };
}

function dashboard(database) {
  const records = database.records;
  const unresolved = records.filter((item) => !['closed', 'healthy'].includes(item.status)).length;
  const reviews = records.filter((item) => item.status === 'expert_review').length;
  const highRisk = records.filter((item) => item.result.severity === 'high').length;
  const completedTasks = database.tasks.filter((item) => item.status === 'completed').length;
  const classCounts = {};
  for (const record of records) classCounts[record.result.classCode] = (classCounts[record.result.classCode] || 0) + 1;
  return {
    fields: database.fields.length,
    records: records.length,
    unresolved,
    reviews,
    highRisk,
    tasks: database.tasks.length,
    completedTasks,
    completionRate: database.tasks.length ? Math.round(completedTasks / database.tasks.length * 100) : 0,
    classCounts,
    model: database.model,
    latestRecords: records.slice(0, 8).map((record) => displayRecord(record, database))
  };
}

async function loadPlantProtectionKnowledge() {
  try {
    const data = JSON.parse(await fs.readFile(plantKnowledgePath, 'utf8'));
    return Array.isArray(data) ? data : data.items || [];
  } catch {
    return [];
  }
}

app.get('/', (_request, response) => response.redirect('/manager/'));
app.get('/api/health', async (_request, response) => {
  const database = await loadDatabase();
  response.json({ ok: true, service: 'AI茶查查统一服务', version: '2.0.0', time: new Date().toISOString(), model: database.model });
});
app.get('/api/dashboard', async (_request, response) => response.json(dashboard(await loadDatabase())));
app.get('/api/model', async (_request, response) => response.json((await loadDatabase()).model));
app.get('/api/knowledge', async (_request, response) => {
  const database = await loadDatabase();
  const merged = new Map(database.knowledge.map((item) => [item.code, item]));
  for (const item of await loadPlantProtectionKnowledge()) {
    const current = merged.get(item.code) || {};
    merged.set(item.code, {
      ...current,
      ...item,
      agriculturalControl: item.agriculturalControl || item.agricultural_control,
      chemicalControl: item.chemicalControl || item.chemical_control,
      precautions: item.precautions || item.notes
    });
  }
  response.json([...merged.values()]);
});

app.get('/api/fields', async (_request, response) => response.json((await loadDatabase()).fields));
app.post('/api/fields', async (request, response) => {
  const result = await mutateDatabase((database) => {
    const field = {
      id: createId('field'), garden: request.body.garden || '未命名茶园', name: request.body.name || '未命名地块',
      areaMu: Number(request.body.areaMu || 0), variety: request.body.variety || '待补充', owner: request.body.owner || '待补充',
      risk: 'low', lat: Number(request.body.lat || 0), lng: Number(request.body.lng || 0), lastPatrolAt: null
    };
    database.fields.push(field);
    return field;
  });
  response.status(201).json(result);
});

app.get('/api/records', async (request, response) => {
  const database = await loadDatabase();
  let records = database.records;
  if (request.query.fieldId) records = records.filter((item) => item.fieldId === request.query.fieldId);
  if (request.query.status) records = records.filter((item) => item.status === request.query.status);
  response.json(records.map((record) => displayRecord(record, database)));
});

app.get('/api/records/:id', async (request, response) => {
  const database = await loadDatabase();
  const record = database.records.find((item) => item.id === request.params.id);
  if (!record) return response.status(404).json({ error: '记录不存在' });
  response.json(displayRecord(record, database));
});

app.post('/api/predict', upload.single('image'), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: '请上传图片' });
  const analysis = await analyzeImage(request.file.path, request.file.originalname);
  const record = await mutateDatabase((database) => {
    const knowledge = knowledgeFor(database, analysis.classCode);
    const field = database.fields.find((item) => item.id === request.body.fieldId) || database.fields[0];
    field.lastPatrolAt = new Date().toISOString();
    if (analysis.severity === 'high') field.risk = 'high';
    else if (analysis.severity === 'medium' && field.risk !== 'high') field.risk = 'medium';
    const item = {
      id: createId('rec'), fieldId: field.id, source: request.body.source || 'web', reporter: request.body.reporter || '体验用户',
      note: request.body.note || '', createdAt: new Date().toISOString(), imageFile: request.file.filename,
      originalName: request.file.originalname, status: analysis.classCode === 'healthy' ? 'healthy' : analysis.classCode === 'unknown' || analysis.confidence < 0.72 ? 'expert_review' : 'diagnosed',
      result: analysis, advice: knowledge?.advice || '', expertReview: null, treatment: null, recheck: null
    };
    database.records.unshift(item);
    return displayRecord(item, database);
  });
  response.status(201).json(record);
});

app.post('/api/records/:id/review', async (request, response) => {
  const updated = await mutateDatabase((database) => {
    const record = database.records.find((item) => item.id === request.params.id);
    if (!record) return null;
    const classCode = request.body.classCode || record.result.classCode;
    const severity = request.body.severity || record.result.severity;
    record.result.classCode = classCode;
    record.result.severity = severity;
    record.expertReview = { expert: request.body.expert || '示范农技专家', comment: request.body.comment || '已复核', reviewedAt: new Date().toISOString() };
    record.advice = knowledgeFor(database, classCode)?.advice || record.advice;
    record.status = 'reviewed';
    return displayRecord(record, database);
  });
  if (!updated) return response.status(404).json({ error: '记录不存在' });
  response.json(updated);
});

app.post('/api/records/:id/treatment', async (request, response) => {
  const result = await mutateDatabase((database) => {
    const record = database.records.find((item) => item.id === request.params.id);
    if (!record) return null;
    const knowledge = knowledgeFor(database, record.result.classCode);
    const days = Number(request.body.recheckDays || knowledge?.recheckDays || 3);
    const dueAt = new Date(Date.now() + days * 86400000).toISOString();
    const treatment = { measure: request.body.measure || '清理病叶、改善通风并等待专家指导', operator: request.body.operator || '巡园员', treatedAt: new Date().toISOString(), dueAt };
    record.treatment = treatment;
    record.status = 'treated';
    const task = { id: createId('task'), recordId: record.id, fieldId: record.fieldId, title: '复查：' + (knowledge?.name || record.result.classCode), dueAt, status: 'pending', assignee: request.body.operator || '巡园员', createdAt: new Date().toISOString() };
    database.tasks.unshift(task);
    return { record: displayRecord(record, database), task };
  });
  if (!result) return response.status(404).json({ error: '记录不存在' });
  response.status(201).json(result);
});

app.post('/api/records/:id/recheck', async (request, response) => {
  const result = await mutateDatabase((database) => {
    const record = database.records.find((item) => item.id === request.params.id);
    if (!record) return null;
    record.recheck = { outcome: request.body.outcome || 'improved', note: request.body.note || '', checkedAt: new Date().toISOString(), operator: request.body.operator || '巡园员' };
    record.status = request.body.outcome === 'worse' ? 'expert_review' : 'closed';
    for (const task of database.tasks.filter((item) => item.recordId === record.id && item.status !== 'completed')) {
      task.status = 'completed'; task.completedAt = new Date().toISOString();
    }
    return displayRecord(record, database);
  });
  if (!result) return response.status(404).json({ error: '记录不存在' });
  response.json(result);
});

app.get('/api/tasks', async (_request, response) => {
  const database = await loadDatabase();
  response.json(database.tasks.map((task) => ({ ...task, field: database.fields.find((item) => item.id === task.fieldId) })));
});
app.post('/api/tasks/:id/complete', async (request, response) => {
  const task = await mutateDatabase((database) => {
    const item = database.tasks.find((candidate) => candidate.id === request.params.id);
    if (!item) return null;
    item.status = 'completed'; item.completedAt = new Date().toISOString(); item.note = request.body.note || '';
    return item;
  });
  if (!task) return response.status(404).json({ error: '任务不存在' });
  response.json(task);
});

app.get('/api/report/summary', async (_request, response) => {
  const database = await loadDatabase();
  response.json({ generatedAt: new Date().toISOString(), dashboard: dashboard(database), fields: database.fields, records: database.records.map((record) => displayRecord(record, database)), tasks: database.tasks });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ error: error.message || '服务器内部错误' });
});

app.listen(port, host, () => {
  console.log('AI茶查查服务已启动：http://127.0.0.1:' + port);
  console.log('PC管理端：http://127.0.0.1:' + port + '/manager/');
  console.log('移动网页端：http://127.0.0.1:' + port + '/mobile/');
});

