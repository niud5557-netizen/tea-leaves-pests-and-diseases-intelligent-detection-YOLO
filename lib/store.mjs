import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = path.join(root, 'data', 'database.json');
let writeQueue = Promise.resolve();

export const supportedClasses = ['healthy', 'algal_leaf', 'anthracnose', 'bird_eye_spot', 'brown_blight', 'gray_blight', 'red_leaf_spot', 'white_spot', 'tea_white_scab', 'tea_blister_blight', 'tea_blister_blight_perforation', 'leaf_beetle', 'apolygus_lucorum'];

const knowledgeCatalog = [
  { code: 'healthy', name: '健康叶片', category: 'health', advice: '继续保持常规巡查，建议保留当前叶片作为健康对照样本。', recheckDays: 7 },
  { code: 'algal_leaf', name: '藻斑病', category: 'disease', advice: '优先改善通风透光并清理重病叶，结合当地农技规程进行复核和防控。', recheckDays: 3 },
  { code: 'anthracnose', name: '茶炭疽病', category: 'disease', advice: '记录发生地块和扩散范围，清理重病叶并提交农技员确认，避免未经审核直接用药。', recheckDays: 3 },
  { code: 'bird_eye_spot', name: '鸟眼斑', category: 'disease', advice: '建议补拍叶片正反面并检查相邻植株，确认是否为局部斑点或成片发生。', recheckDays: 3 },
  { code: 'brown_blight', name: '褐斑病', category: 'disease', advice: '加强排水、通风和田间卫生，标记病株并由农技人员确定后续措施。', recheckDays: 3 },
  { code: 'gray_blight', name: '灰斑病', category: 'disease', advice: '检查叶片边缘与枝梢症状，建议上传多角度照片并安排专家复核。', recheckDays: 3 },
  { code: 'red_leaf_spot', name: '红叶斑', category: 'disease', advice: '记录红斑面积比例和发生范围，排查营养、日灼及病害等混淆因素。', recheckDays: 3 },
  { code: 'white_spot', name: '白斑病', category: 'disease', advice: '检查叶背和相邻叶片，保持茶园通风，并由专家排除虫害或机械损伤。', recheckDays: 3 },
  { code: 'tea_white_scab', name: '茶白星病/白痂症状', category: 'disease', advice: '补拍叶片正反面和枝梢，结合湿度、郁闭度和历史发病区进行专家复核。', recheckDays: 3 },
  { code: 'tea_blister_blight', name: '茶饼病', category: 'disease', advice: '关注低温高湿和嫩叶发病，先隔离高风险地块并安排农技员确认绿色防控方案。', recheckDays: 2 },
  { code: 'tea_blister_blight_perforation', name: '茶饼病穿孔期', category: 'disease', advice: '记录穿孔比例和扩散范围，清理严重病叶，结合茶园湿度管理进行复查。', recheckDays: 2 },
  { code: 'leaf_beetle', name: '叶甲类虫害', category: 'pest', advice: '重点检查叶缘取食痕、虫口密度和发生中心，优先采用灯诱、人工清除和生物防控。', recheckDays: 2 },
  { code: 'apolygus_lucorum', name: '绿盲蝽类虫害', category: 'pest', advice: '重点排查嫩梢和幼叶刺吸症状，记录虫口密度并提交农技员制定绿色防控方案。', recheckDays: 2 },
  { code: 'unknown', name: '疑似未知症状', category: 'unknown', advice: '系统无法可靠归类，请补拍叶片正反面、整株和周边环境照片并提交专家复核。', recheckDays: 1 }
];

function now() {
  return new Date().toISOString();
}

function modelStatus() {
  return {
    version: 'tea-disease-pest-mobilenetv3-2026-08-14',
    mode: process.env.ANALYZER_MODE || 'demo',
    supportedClasses,
    modelFile: 'models/tea_disease_pest.onnx',
    metricsFile: 'models/metrics.json',
    notice: '真实分类模型支持13类茶树病害/虫害初筛；严重度、病斑框为辅助估计，非分割或检测模型指标。'
  };
}

function defaultDatabase() {
  return {
    meta: { schemaVersion: 2, createdAt: now(), updatedAt: now() },
    model: modelStatus(),
    fields: [
      { id: 'field-a01', garden: '信阳示范茶园', name: 'A-01 向阳坡', areaMu: 38, variety: '信阳群体种', owner: '示范合作社', risk: 'medium', lat: 32.125, lng: 114.067, lastPatrolAt: now() },
      { id: 'field-a02', garden: '信阳示范茶园', name: 'A-02 林缘地', areaMu: 26, variety: '信阳10号', owner: '示范合作社', risk: 'low', lat: 32.127, lng: 114.071, lastPatrolAt: now() },
      { id: 'field-b01', garden: '青年实训茶园', name: 'B-01 试验地', areaMu: 12, variety: '信阳群体种', owner: '项目团队', risk: 'high', lat: 32.131, lng: 114.074, lastPatrolAt: now() }
    ],
    records: [],
    tasks: [],
    knowledge: knowledgeCatalog
  };
}

function normalizeDatabase(database) {
  database.meta ||= { schemaVersion: 2, createdAt: now(), updatedAt: now() };
  database.meta.schemaVersion = 2;
  database.model = modelStatus();
  database.fields ||= defaultDatabase().fields;
  database.records ||= [];
  database.tasks ||= [];
  const byCode = new Map((database.knowledge || []).map((item) => [item.code, item]));
  for (const item of knowledgeCatalog) byCode.set(item.code, { ...byCode.get(item.code), ...item });
  database.knowledge = [...byCode.values()];
  return database;
}

export async function loadDatabase() {
  try {
    return normalizeDatabase(JSON.parse(await fs.readFile(databasePath, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const initial = defaultDatabase();
    await fs.mkdir(path.dirname(databasePath), { recursive: true });
    await fs.writeFile(databasePath, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
}

export async function saveDatabase(database) {
  normalizeDatabase(database);
  database.meta.updatedAt = now();
  const temporaryPath = databasePath + '.tmp';
  await fs.writeFile(temporaryPath, JSON.stringify(database, null, 2), 'utf8');
  await fs.rename(temporaryPath, databasePath);
  return database;
}

export function mutateDatabase(mutator) {
  writeQueue = writeQueue.then(async () => {
    const database = await loadDatabase();
    const result = await mutator(database);
    await saveDatabase(database);
    return result;
  });
  return writeQueue;
}

export function createId(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
