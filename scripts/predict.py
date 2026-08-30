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
    args = parser.parse_args()
    metadata = json.loads(Path(args.metadata).read_text(encoding='utf-8'))
    class_names = metadata['class_names']
    image_size = int(metadata.get('image_size', 224))
    session = ort.InferenceSession(args.model, providers=['CPUExecutionProvider'])
    tensor = preprocess(Path(args.image), image_size)
    logits = session.run(None, {'images': tensor})[0]
    probabilities = softmax(logits)[0]
    order = probabilities.argsort()[::-1][:args.topk]
    result = {
        'engine': 'onnx-mobilenetv3',
        'classCode': class_names[int(order[0])],
        'confidence': float(probabilities[int(order[0])]),
        'topK': [{'classCode': class_names[int(index)], 'confidence': float(probabilities[int(index)])} for index in order],
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
