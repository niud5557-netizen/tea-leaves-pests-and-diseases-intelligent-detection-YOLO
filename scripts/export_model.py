import argparse
import json
from pathlib import Path

import torch
from torch import nn
from torchvision import models


def build_model(num_classes: int):
    model = models.mobilenet_v3_small(weights=None)
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, num_classes)
    return model


def main():
    parser = argparse.ArgumentParser(description='Export AI茶查查 classifier to ONNX.')
    parser.add_argument('--checkpoint', default='models/tea_disease_pest_mobilenetv3_best.pth')
    parser.add_argument('--output', default='models/tea_disease_pest.onnx')
    args = parser.parse_args()
    checkpoint = torch.load(args.checkpoint, map_location='cpu', weights_only=False)
    classes = checkpoint['classes']
    image_size = int(checkpoint.get('image_size', 224))
    model = build_model(len(classes))
    model.load_state_dict(checkpoint['model'])
    model.eval()
    dummy = torch.randn(1, 3, image_size, image_size)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        dummy,
        output,
        input_names=['images'],
        output_names=['logits'],
        dynamic_axes={'images': {0: 'batch'}, 'logits': {0: 'batch'}},
        opset_version=17,
    )
    metadata = {'onnx': str(output), 'class_names': classes, 'image_size': image_size, 'checkpoint': str(Path(args.checkpoint)), 'model_family': 'MobileNetV3-Small'}
    (output.parent / 'model_metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
