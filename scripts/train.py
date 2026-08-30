import argparse
import json
import time
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader, WeightedRandomSampler
from torchvision import datasets, models, transforms


def build_model(num_classes: int, pretrained: bool):
    weights = None
    pretrained_used = False
    if pretrained:
        try:
            weights = models.MobileNet_V3_Small_Weights.IMAGENET1K_V1
            model = models.mobilenet_v3_small(weights=weights)
            pretrained_used = True
        except Exception as exc:
            print(json.dumps({'warning': 'pretrained_weights_unavailable', 'reason': str(exc)}, ensure_ascii=False), flush=True)
            model = models.mobilenet_v3_small(weights=None)
    else:
        model = models.mobilenet_v3_small(weights=None)
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, num_classes)
    return model, pretrained_used


def make_loaders(data_dir: Path, image_size: int, batch_size: int, workers: int):
    train_tf = transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(12),
        transforms.ColorJitter(brightness=0.18, contrast=0.18, saturation=0.15, hue=0.03),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    train_ds = datasets.ImageFolder(data_dir / 'train', transform=train_tf)
    val_ds = datasets.ImageFolder(data_dir / 'val', transform=eval_tf)
    test_ds = datasets.ImageFolder(data_dir / 'test', transform=eval_tf)
    counts = torch.bincount(torch.tensor(train_ds.targets), minlength=len(train_ds.classes)).float()
    weights = 1.0 / torch.clamp(counts, min=1)
    sampler = WeightedRandomSampler(weights[torch.tensor(train_ds.targets)], num_samples=len(train_ds), replacement=True)
    train_loader = DataLoader(train_ds, batch_size=batch_size, sampler=sampler, num_workers=workers, pin_memory=torch.cuda.is_available())
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=workers, pin_memory=torch.cuda.is_available())
    test_loader = DataLoader(test_ds, batch_size=batch_size, shuffle=False, num_workers=workers, pin_memory=torch.cuda.is_available())
    return train_ds, val_ds, test_ds, train_loader, val_loader, test_loader


def evaluate(model, loader, device, num_classes):
    model.eval()
    correct = 0
    total = 0
    loss_sum = 0.0
    criterion = nn.CrossEntropyLoss()
    confusion = torch.zeros((num_classes, num_classes), dtype=torch.long)
    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            labels = labels.to(device)
            logits = model(images)
            loss = criterion(logits, labels)
            preds = logits.argmax(dim=1)
            correct += (preds == labels).sum().item()
            total += labels.numel()
            loss_sum += loss.item() * labels.numel()
            for true_label, pred_label in zip(labels.cpu(), preds.cpu()):
                confusion[int(true_label), int(pred_label)] += 1
    return {
        'loss': loss_sum / max(1, total),
        'accuracy': correct / max(1, total),
        'total': total,
        'confusion_matrix': confusion.tolist(),
    }


def main():
    parser = argparse.ArgumentParser(description='Train AI茶查查 MobileNetV3 classification baseline.')
    parser.add_argument('--data', default='dataset/prepared/imagefolder')
    parser.add_argument('--out', default='models')
    parser.add_argument('--epochs', type=int, default=10)
    parser.add_argument('--batch-size', type=int, default=32)
    parser.add_argument('--image-size', type=int, default=224)
    parser.add_argument('--lr', type=float, default=3e-4)
    parser.add_argument('--workers', type=int, default=0)
    parser.add_argument('--no-pretrained', action='store_true')
    args = parser.parse_args()

    data_dir = Path(args.data)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    device = torch.device('cuda:0' if torch.cuda.is_available() else 'cpu')
    train_ds, val_ds, test_ds, train_loader, val_loader, test_loader = make_loaders(data_dir, args.image_size, args.batch_size, args.workers)
    model, pretrained_used = build_model(len(train_ds.classes), pretrained=not args.no_pretrained)
    model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(1, args.epochs))
    criterion = nn.CrossEntropyLoss(label_smoothing=0.05)

    history = []
    best_acc = -1.0
    best_path = out_dir / 'tea_disease_pest_mobilenetv3_best.pth'
    started = time.time()
    for epoch in range(1, args.epochs + 1):
        model.train()
        running_loss = 0.0
        seen = 0
        for images, labels in train_loader:
            images = images.to(device)
            labels = labels.to(device)
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * labels.numel()
            seen += labels.numel()
        scheduler.step()
        val_metrics = evaluate(model, val_loader, device, len(train_ds.classes))
        epoch_row = {'epoch': epoch, 'train_loss': running_loss / max(1, seen), 'val_loss': val_metrics['loss'], 'val_accuracy': val_metrics['accuracy']}
        history.append(epoch_row)
        print(json.dumps(epoch_row, ensure_ascii=False), flush=True)
        if val_metrics['accuracy'] > best_acc:
            best_acc = val_metrics['accuracy']
            torch.save({'model': model.state_dict(), 'classes': train_ds.classes, 'image_size': args.image_size, 'pretrained_used': pretrained_used}, best_path)

    checkpoint = torch.load(best_path, map_location=device, weights_only=False)
    model.load_state_dict(checkpoint['model'])
    test_metrics = evaluate(model, test_loader, device, len(train_ds.classes))
    metrics = {
        'created_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        'device': str(device),
        'pretrained_used': pretrained_used,
        'classes': train_ds.classes,
        'epochs': args.epochs,
        'batch_size': args.batch_size,
        'image_size': args.image_size,
        'train_count': len(train_ds),
        'val_count': len(val_ds),
        'test_count': len(test_ds),
        'best_val_accuracy': best_acc,
        'test': test_metrics,
        'history': history,
        'seconds': round(time.time() - started, 1),
        'limitations': '分类模型基于公开/本地图像训练；严重度为图像启发式估计，虫体检测和病斑分割需框级/掩膜级标注后另训。',
    }
    (out_dir / 'metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding='utf-8')
    (out_dir / 'class_names.json').write_text(json.dumps({'class_names': train_ds.classes}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

