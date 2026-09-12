import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pythonPath = process.env.PYTHON_PATH || path.join(root, '.venv', 'Scripts', 'python.exe');
const onnxModelPath = process.env.MODEL_PATH || path.join(root, 'models', 'tea_disease_pest.onnx');
const modelMetadataPath = process.env.MODEL_METADATA_PATH || path.join(root, 'models', 'model_metadata.json');
const predictScriptPath = path.join(root, 'scripts', 'predict.py');

const classes = ['healthy', 'algal_leaf', 'anthracnose', 'bird_eye_spot', 'brown_blight', 'gray_blight', 'red_leaf_spot', 'white_spot', 'tea_white_scab', 'tea_blister_blight', 'tea_blister_blight_perforation', 'leaf_beetle', 'apolygus_lucorum'];
const pestClasses = new Set(['leaf_beetle', 'apolygus_lucorum']);
const fileHints = {
  healthy: ['healthy', 'normal', '健康'],
  algal_leaf: ['algal', '藻斑'],
  anthracnose: ['anthracnose', '炭疽'],
  bird_eye_spot: ['bird_eye', 'bird-eye', '鸟眼'],
  brown_blight: ['brown_blight', 'brown-blight', '褐斑'],
  gray_blight: ['gray_blight', 'gray-light', 'gray_blight', '灰斑'],
  red_leaf_spot: ['red_leaf', 'red-leaf', '红叶'],
  white_spot: ['white_spot', 'white-spot', '白斑'],
  tea_white_scab: ['whitescab', 'white_scab', '白星', '白痂'],
  tea_blister_blight: ['teablisterblight', 'blister_blight', '茶饼'],
  tea_blister_blight_perforation: ['teablisterblightafter', 'perforation', '穿孔'],
  leaf_beetle: ['leafbeetle', 'leaf_beetle', '叶甲'],
  apolygus_lucorum: ['mirid', 'apolygus', '绿盲蝽']
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calculateSharpness(data, width, height) {
  if (width < 3 || height < 3) return 0;
  const values = [];
  for (let row = 1; row < height - 1; row += 2) {
    for (let column = 1; column < width - 1; column += 2) {
      const index = row * width + column;
      const laplacian = -4 * data[index] + data[index - 1] + data[index + 1] + data[index - width] + data[index + width];
      values.push(laplacian);
    }
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
}

function detectHint(fileName) {
  const lower = fileName.toLowerCase();
  for (const [code, hints] of Object.entries(fileHints)) {
    if (hints.some((hint) => lower.includes(hint.toLowerCase()))) return code;
  }
  return null;
}

function severityFromRatio(ratio, category) {
  if (category === 'health') return 'healthy';
  if (category === 'pest') {
    if (ratio < 0.055) return 'low';
    if (ratio < 0.12) return 'medium';
    return 'high';
  }
  if (ratio < 0.05) return 'low';
  if (ratio < 0.15) return 'medium';
  return 'high';
}

async function modelReady() {
  try {
    await fs.access(onnxModelPath);
    await fs.access(modelMetadataPath);
    await fs.access(predictScriptPath);
    return true;
  } catch {
    return false;
  }
}

async function runModel(filePath) {
  const { stdout } = await execFileAsync(pythonPath, [predictScriptPath, '--image', filePath, '--model', onnxModelPath, '--metadata', modelMetadataPath], {
    cwd: root,
    env: { ...process.env, PYTHONPATH: '' },
    windowsHide: true,
    timeout: Number(process.env.MODEL_TIMEOUT_MS || 30000),
    maxBuffer: 1024 * 1024
  });
  return JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
}

async function imageQuality(input) {
  const metadata = await sharp(input).metadata();
  const stats = await sharp(input).stats();
  const raw = await sharp(input).resize(192, 192, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const sharpness = calculateSharpness(raw.data, raw.info.width, raw.info.height);
  const means = stats.channels.slice(0, 3).map((channel) => channel.mean);
  const [red = 0, green = 0, blue = 0] = means;
  const brightness = (red + green + blue) / 3;
  const qualityIssues = [];
  if ((metadata.width || 0) < 320 || (metadata.height || 0) < 240) qualityIssues.push('图片分辨率偏低');
  if (brightness < 38) qualityIssues.push('画面过暗');
  if (brightness > 232) qualityIssues.push('画面过曝');
  if (sharpness < 65) qualityIssues.push('画面可能模糊');
  return {
    score: Math.round(clamp(100 - qualityIssues.length * 22 + Math.min(12, sharpness / 35), 20, 99)),
    accepted: qualityIssues.length < 3,
    issues: qualityIssues,
    brightness: Number(brightness.toFixed(1)),
    sharpness: Number(sharpness.toFixed(1)),
    width: metadata.width,
    height: metadata.height,
    greenDominance: green / Math.max(1, (red + blue) / 2),
    entropy: stats.entropy
  };
}

function demoPrediction(input, originalName, quality) {
  const hash = crypto.createHash('sha256').update(input).digest();
  const useFilenameHints = process.env.DEMO_USE_FILENAME_HINTS === '1';
  let classCode = useFilenameHints ? detectHint(originalName) : null;
  if (!classCode) classCode = quality.score < 48 ? 'unknown' : 'unknown';
  const confidence = classCode === 'unknown' ? 0.42 : Number(clamp(0.67 + (hash[1] / 255) * 0.27 + Math.min(0.04, quality.score / 2500), 0.35, 0.97).toFixed(4));
  return { engine: 'demo', classCode, confidence, topK: [{ classCode, confidence }] };
}

export async function analyzeImage(filePath, originalName = '') {
  const input = await sharp(filePath).rotate().toBuffer();
  const quality = await imageQuality(input);
  const shouldUseModel = (process.env.ANALYZER_MODE || 'demo') === 'model' && await modelReady();
  let prediction;
  try {
    prediction = shouldUseModel ? await runModel(filePath) : demoPrediction(input, originalName, quality);
  } catch (error) {
    prediction = demoPrediction(input, originalName, quality);
    prediction.engine = 'demo-fallback';
    prediction.fallbackReason = error.message;
  }

  const classCode = prediction.classCode || 'unknown';
  const category = classCode === 'healthy' ? 'health' : pestClasses.has(classCode) ? 'pest' : classCode === 'unknown' ? 'unknown' : 'disease';
  const confidence = Number(clamp(Number(prediction.confidence || 0), 0, 1).toFixed(4));
  // A classifier has no spatial supervision. Do not expose synthetic boxes or lesion ratios as detections.
  const lesionRatio = null;
  const severity = category === 'health' ? 'healthy' : 'review';
  const lesionBox = null;
  const needsReview = prediction.accepted === false || category === 'unknown' || confidence < Number(process.env.REVIEW_THRESHOLD || 0.72) || quality.score < 55;

  return {
    engine: prediction.engine || (shouldUseModel ? 'onnx-mobilenetv3' : 'demo'),
    modelReady: shouldUseModel,
    classCode,
    category,
    confidence,
    topK: prediction.topK || [{ classCode, confidence }],
    accepted: prediction.accepted !== false,
    rejectThreshold: prediction.rejectThreshold,
    rejectMargin: prediction.rejectMargin,
    top1Top2Margin: prediction.top1Top2Margin,
    rejectionReasons: prediction.rejectionReasons || [],
    lesionRatio,
    severity,
    lesionBox,
    needsReview,
    quality: {
      score: quality.score,
      accepted: quality.accepted,
      issues: quality.issues,
      brightness: quality.brightness,
      sharpness: quality.sharpness,
      width: quality.width,
      height: quality.height
    },
    explanation: category === 'unknown'
      ? '图像质量或特征分布不足以可靠归类，建议重新拍摄或提交专家复核。'
      : category === 'health'
        ? '模型判断为健康叶片；仍建议结合地块历史和周边植株进行常规巡查。'
        : shouldUseModel
          ? '结果来自已训练的图像分类模型；该模型没有框级监督，因此不提供病斑位置或病斑占比。'
          : '当前为演示分析器输出；接入模型后可切换为真实分类推理。',
    disclaimer: shouldUseModel
      ? '该模型为开放集分类初筛基线；田间生产应用前仍需外部茶园盲测、专家复核和持续数据回流。'
      : '当前为演示分析器结果，不可替代植保专家诊断。接入真实模型后须重新完成外部茶园盲测。',
    fallbackReason: prediction.fallbackReason
  };
}
