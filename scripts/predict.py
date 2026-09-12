import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(3, 1, 1)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(3, 1, 1)


def preprocess(image_path: Path, image_size: int):
    with Image.open(image_path) as image:
        image = ImageOps.exif_transpose(image).convert('RGB').resize((image_size, image_size))
    array = np.asarray(image, dtype=np.float32) / 255.0
    array = array.transpose(2, 0, 1)
    array = (array - MEAN) / STD
    return array[None, ...].astype(np.float32)


def softmax(logits):
    logits = logits - logits.max(axis=1, keepdims=True)
    exp = np.exp(logits)
    return exp / exp.sum(axis=1, keepdims=True)


def main():
    parser = argparse.ArgumentParser(description='Predict one image with AI茶查查 ONNX model.')
    parser.add_argument('--image', required=True)
    parser.add_argument('--model', default='models/tea_disease_pest.onnx')
    parser.add_argument('--metadata', default='models/model_metadata.json')
    parser.add_argument('--topk', type=int, default=5)
    parser.add_argument('--reject-threshold', type=float, default=None, help='低于该置信度时输出 unknown；默认读取模型校准值')
    parser.add_argument('--reject-margin', type=float, default=None, help='top1 与 top2 概率差低于该值时输出 unknown')
    args = parser.parse_args()
    metadata = json.loads(Path(args.metadata).read_text(encoding='utf-8'))
    class_names = metadata['class_names']
    image_size = int(metadata.get('image_size', 224))
    session = ort.InferenceSession(args.model, providers=['CPUExecutionProvider'])
    tensor = preprocess(Path(args.image), image_size)
    logits = session.run(None, {'images': tensor})[0]
    probabilities = softmax(logits)[0]
    order = probabilities.argsort()[::-1][:args.topk]
    operating_point = metadata.get('operating_point', {})
    reject_threshold = float(args.reject_threshold if args.reject_threshold is not None else operating_point.get('confidence_threshold', 0.45))
    reject_margin = float(args.reject_margin if args.reject_margin is not None else operating_point.get('margin_threshold', 0.08))
    top1_index = int(order[0])
    top2_probability = float(probabilities[int(order[1])]) if len(order) > 1 else 0.0
    top1_probability = float(probabilities[top1_index])
    margin = top1_probability - top2_probability
    rejection_reasons = []
    if class_names[top1_index] == 'unknown':
        rejection_reasons.append('模型判定为 unknown')
    if top1_probability < reject_threshold:
        rejection_reasons.append(f'置信度低于 {reject_threshold:.2f}')
    if margin < reject_margin:
        rejection_reasons.append(f'top1-top2 间隔低于 {reject_margin:.2f}')
    class_code = 'unknown' if rejection_reasons else class_names[top1_index]
    result = {
        'engine': 'onnx-mobilenetv3',
        'classCode': class_code,
        'confidence': top1_probability,
        'topK': [{'classCode': class_names[int(index)], 'confidence': float(probabilities[int(index)])} for index in order],
        'accepted': not rejection_reasons,
        'rejectThreshold': reject_threshold,
        'rejectMargin': reject_margin,
        'top1Top2Margin': margin,
        'rejectionReasons': rejection_reasons,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
