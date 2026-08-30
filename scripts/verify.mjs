import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:8080';

async function api(endpoint, options) {
  const response = await fetch(base + endpoint, options);
  const data = await response.json();
  if (!response.ok) throw new Error(`${endpoint} ${response.status}: ${data.error || JSON.stringify(data)}`);
  return data;
}

async function firstImage(classCode) {
  const directory = path.join(root, 'dataset', 'prepared', 'imagefolder', 'test', classCode);
  const files = await fs.readdir(directory);
  const file = files.find((name) => /\.(jpg|jpeg|png)$/i.test(name));
  if (!file) throw new Error(`缺少测试图像: ${classCode}`);
  return path.join(directory, file);
}

async function uploadSample(classCode, fieldId, source) {
  const imagePath = await firstImage(classCode);
  const form = new FormData();
  form.set('fieldId', fieldId);
  form.set('reporter', '自动验证脚本');
  form.set('source', source);
  form.set('note', `验证样本: ${classCode}`);
  const buffer = await fs.readFile(imagePath);
  const blob = new Blob([buffer], { type: 'image/jpeg' });
  form.set('image', blob, path.basename(imagePath));
  return api('/api/predict', { method: 'POST', body: form });
}

async function main() {
  const health = await api('/api/health');
  const fields = await api('/api/fields');
  if (!fields.length) throw new Error('没有茶园地块');
  const fieldId = fields[0].id;
  const disease = await uploadSample('anthracnose', fieldId, 'verify-disease');
  const pest = await uploadSample('apolygus_lucorum', fieldId, 'verify-pest');
  const reviewed = await api(`/api/records/${pest.id}/review`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expert: '自动验证专家', classCode: pest.result.classCode, severity: pest.result.severity, comment: '验证专家复核闭环' })
  });
  const treatment = await api(`/api/records/${reviewed.id}/treatment`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ measure: '完成绿色防控示范处置', operator: '自动验证员', recheckDays: 1 })
  });
  const closed = await api(`/api/records/${reviewed.id}/recheck`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outcome: 'improved', note: '复查通过', operator: '自动验证员' })
  });
  const dashboard = await api('/api/dashboard');
  const model = await api('/api/model');
  const report = {
    generatedAt: new Date().toISOString(),
    base,
    health,
    model,
    checks: {
      apiHealth: Boolean(health.ok),
      diseaseUpload: Boolean(disease.id && disease.result?.engine),
      pestUpload: Boolean(pest.id && pest.result?.engine),
      expertReview: reviewed.status === 'reviewed',
      treatmentTask: Boolean(treatment.task?.id),
      recheckClosed: closed.status === 'closed',
      dashboardRecords: dashboard.records
    },
    disease: { id: disease.id, classCode: disease.result.classCode, confidence: disease.result.confidence, engine: disease.result.engine },
    pest: { id: pest.id, classCode: pest.result.classCode, confidence: pest.result.confidence, engine: pest.result.engine },
    result: 'PASS'
  };
  await fs.mkdir(path.join(root, 'data', 'reports'), { recursive: true });
  await fs.writeFile(path.join(root, 'data', 'reports', 'verification-runtime.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

