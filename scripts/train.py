import argparse
import json
import random
import time
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader, WeightedRandomSampler
from torchvision import datasets, models, transforms

MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]


def seed_everything(seed: int):
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def build_model(num_classes: int, pretrained: bool):
    pretrained_used = False
    if pretrained:
        try:
            model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1)
            pretrained_used = True
        except Exception as exc:
            print(json.dumps({'warning': 'pretrained_weights_unavailable', 'reason': str(exc)}, ensure_ascii=False), flush=True)
            model = models.mobilenet_v3_small(weights=None)
    else:
        model = models.mobilenet_v3_small(weights=None)
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, num_classes)
    return model, pretrained_used


def make_loaders(data_dir: Path, image_size: int, batch_size: int, workers: int, balance: str):
    train_tf = transforms.Compose([
        transforms.RandomResizedCrop(image_size, scale=(0.80, 1.0), ratio=(0.85, 1.18)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(p=0.15),
        transforms.RandomApply([transforms.RandomAffine(degrees=12, translate=(0.05, 0.05), scale=(0.92, 1.08), shear=5)], p=0.55),
        transforms.RandomApply([transforms.ColorJitter(brightness=0.30, contrast=0.28, saturation=0.22, hue=0.04)], p=0.85),
        transforms.RandomApply([transforms.GaussianBlur(kernel_size=3, sigma=(0.1, 1.2))], p=0.12),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
        transforms.RandomErasing(p=0.25, scale=(0.02, 0.12), ratio=(0.3, 3.3), value='random'),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((image_size, image_size)),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ])
    train_ds = datasets.ImageFolder(data_dir / 'train', transform=train_tf)
    val_ds = datasets.ImageFolder(data_dir / 'val', transform=eval_tf)
    test_ds = datasets.ImageFolder(data_dir / 'test', transform=eval_tf)
    if train_ds.classes != val_ds.classes or train_ds.classes != test_ds.classes:
        raise ValueError('train/val/test 类别目录不一致，请确保每个 split 都包含相同类别（包括 unknown）')

    targets = torch.tensor(train_ds.targets)
    counts = torch.bincount(targets, minlength=len(train_ds.classes)).float()
    sampler = None
    if balance == 'sampler':
        sample_weights = (1.0 / torch.clamp(counts, min=1))[targets]
        sampler = WeightedRandomSampler(sample_weights, num_samples=len(train_ds), replacement=True)
    train_loader = DataLoader(train_ds, batch_size=batch_size, sampler=sampler, shuffle=sampler is None, num_workers=workers, pin_memory=torch.cuda.is_available())
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=workers, pin_memory=torch.cuda.is_available())
    test_loader = DataLoader(test_ds, batch_size=batch_size, shuffle=False, num_workers=workers, pin_memory=torch.cuda.is_available())
    return train_ds, val_ds, test_ds, train_loader, val_loader, test_loader, counts


def mixup(images, labels, alpha: float):
    if alpha <= 0:
        return images, labels, labels, 1.0
    lam = float(torch.distributions.Beta(alpha, alpha).sample())
    permutation = torch.randperm(images.size(0), device=images.device)
    return lam * images + (1 - lam) * images[permutation], labels, labels[permutation], lam


def classification_report(confusion):
    confusion = confusion.float()
    true_positive = confusion.diag()
    support = confusion.sum(dim=1)
    predicted = confusion.sum(dim=0)
    precision = true_positive / predicted.clamp_min(1)
    recall = true_positive / support.clamp_min(1)
    f1 = 2 * precision * recall / (precision + recall).clamp_min(1e-12)
    return precision.tolist(), recall.tolist(), f1.tolist(), {
        'macro_precision': float(precision.mean()),
        'macro_recall': float(recall.mean()),
        'macro_f1': float(f1.mean()),
        'balanced_accuracy': float(recall.mean()),
    }


def evaluate(model, loader, device, num_classes, class_names):
    model.eval()
    correct = 0
    total = 0
    loss_sum = 0.0
    criterion = nn.CrossEntropyLoss()
    confusion = torch.zeros((num_classes, num_classes), dtype=torch.long)
    probabilities = []
    labels_seen = []
    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            labels = labels.to(device)
            logits = model(images)
            loss = criterion(logits, labels)
            probs = torch.softmax(logits, dim=1)
            preds = probs.argmax(dim=1)
            correct += (preds == labels).sum().item()
            total += labels.numel()
            loss_sum += loss.item() * labels.numel()
            for true_label, pred_label in zip(labels.cpu(), preds.cpu()):
                confusion[int(true_label), int(pred_label)] += 1
            probabilities.append(probs.cpu())
            labels_seen.append(labels.cpu())
    precision, recall, f1, aggregate = classification_report(confusion)
    per_class = {
        name: {'precision': precision[index], 'recall': recall[index], 'f1': f1[index], 'support': int(confusion[index].sum())}
        for index, name in enumerate(class_names)
    }
    return {
        'loss': loss_sum / max(1, total),
        'accuracy': correct / max(1, total),
        'total': total,
        'confusion_matrix': confusion.tolist(),
        **aggregate,
        'per_class': per_class,
        '_probabilities': torch.cat(probabilities) if probabilities else torch.empty((0, num_classes)),
        '_labels': torch.cat(labels_seen) if labels_seen else torch.empty((0,), dtype=torch.long),
    }


def calibrate_rejection(metrics, class_names, fixed_margin: float):
    probabilities = metrics.pop('_probabilities')
    labels = metrics.pop('_labels')
    unknown_index = class_names.index('unknown') if 'unknown' in class_names else None
    if unknown_index is None or not len(labels) or not (labels == unknown_index).any():
        return {'confidence_threshold': 0.45, 'margin_threshold': fixed_margin, 'calibrated': False, 'reason': '验证集没有 unknown 样本'}

    top_values, top_indices = probabilities.topk(2, dim=1)
    candidates = []
    margins = sorted({0.0, 0.02, 0.04, 0.06, round(fixed_margin, 2), 0.10, 0.12})
    for threshold in [round(value, 2) for value in torch.arange(0.0, 0.86, 0.01).tolist()]:
        for margin in margins:
            rejected = (top_values[:, 0] < threshold) | ((top_values[:, 0] - top_values[:, 1]) < margin) | (top_indices[:, 0] == unknown_index)
            true_unknown = labels == unknown_index
            true_positive = (rejected & true_unknown).sum().item()
            true_negative = (~rejected & ~true_unknown).sum().item()
            false_positive = (~rejected & true_unknown).sum().item()
            false_negative = (rejected & ~true_unknown).sum().item()
            unknown_recall = true_positive / max(1, true_positive + false_positive)
            known_acceptance = true_negative / max(1, true_negative + false_negative)
            balanced = (unknown_recall + known_acceptance) / 2
            candidates.append({
                'threshold': threshold,
                'margin': margin,
                'unknown_recall': unknown_recall,
                'known_acceptance': known_acceptance,
                'balanced': balanced,
            })
    eligible = [item for item in candidates if item['known_acceptance'] >= 0.85]
    if eligible:
        best = max(eligible, key=lambda item: (item['balanced'], item['unknown_recall'], item['known_acceptance'], -abs(item['threshold'] - 0.50), -item['margin']))
    else:
        best = max(candidates, key=lambda item: (item['known_acceptance'], item['balanced'], item['unknown_recall'], -item['threshold'], -item['margin']))
    return {
        'confidence_threshold': best['threshold'],
        'margin_threshold': best['margin'],
        'calibrated': True,
        'unknown_recall': best['unknown_recall'],
        'known_acceptance': best['known_acceptance'],
        'known_acceptance_constraint_met': bool(eligible),
    }


def clean_metrics(metrics):
    metrics.pop('_probabilities', None)
    metrics.pop('_labels', None)
    return metrics


def main():
    parser = argparse.ArgumentParser(description='Train the open-set tea image classifier baseline.')
    parser.add_argument('--data', default='dataset/prepared/imagefolder')
    parser.add_argument('--out', default='models')
    parser.add_argument('--epochs', type=int, default=40)
    parser.add_argument('--batch-size', type=int, default=32)
    parser.add_argument('--image-size', type=int, default=320)
    parser.add_argument('--lr', type=float, default=2e-4)
    parser.add_argument('--workers', type=int, default=0)
    parser.add_argument('--mixup-alpha', type=float, default=0.20)
    parser.add_argument('--reject-margin', type=float, default=0.08)
    parser.add_argument('--balance', choices=['sampler', 'loss', 'none'], default='sampler')
    parser.add_argument('--seed', type=int, default=20260912)
    parser.add_argument('--no-pretrained', action='store_true')
    args = parser.parse_args()

    seed_everything(args.seed)
    data_dir = Path(args.data)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    device = torch.device('cuda:0' if torch.cuda.is_available() else 'cpu')
    train_ds, val_ds, test_ds, train_loader, val_loader, test_loader, counts = make_loaders(data_dir, args.image_size, args.batch_size, args.workers, args.balance)
    model, pretrained_used = build_model(len(train_ds.classes), pretrained=not args.no_pretrained)
    model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(1, args.epochs))
    class_weights = (counts.sum() / (len(counts) * counts.clamp_min(1))).to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights if args.balance == 'loss' else None, label_smoothing=0.03)

    history = []
    best_macro_f1 = -1.0
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
            mixed, first_labels, second_labels, lam = mixup(images, labels, args.mixup_alpha if random.random() < 0.5 else 0)
            logits = model(mixed)
            loss = lam * criterion(logits, first_labels) + (1 - lam) * criterion(logits, second_labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * labels.numel()
            seen += labels.numel()
        scheduler.step()
        val_metrics = evaluate(model, val_loader, device, len(train_ds.classes), train_ds.classes)
        epoch_row = {
            'epoch': epoch,
            'train_loss': running_loss / max(1, seen),
            'val_loss': val_metrics['loss'],
            'val_accuracy': val_metrics['accuracy'],
            'val_macro_f1': val_metrics['macro_f1'],
            'val_macro_recall': val_metrics['macro_recall'],
        }
        history.append(epoch_row)
        print(json.dumps(epoch_row, ensure_ascii=False), flush=True)
        if val_metrics['macro_f1'] > best_macro_f1:
            best_macro_f1 = val_metrics['macro_f1']
            torch.save({
                'model': model.state_dict(),
                'classes': train_ds.classes,
                'image_size': args.image_size,
                'pretrained_used': pretrained_used,
                'reject_margin': args.reject_margin,
                'seed': args.seed,
            }, best_path)

    checkpoint = torch.load(best_path, map_location=device, weights_only=False)
    model.load_state_dict(checkpoint['model'])
    val_metrics = evaluate(model, val_loader, device, len(train_ds.classes), train_ds.classes)
    operating_point = calibrate_rejection(val_metrics, train_ds.classes, args.reject_margin)
    checkpoint['operating_point'] = operating_point
    torch.save(checkpoint, best_path)
    test_metrics = clean_metrics(evaluate(model, test_loader, device, len(train_ds.classes), train_ds.classes))
    val_metrics = clean_metrics(val_metrics)
    metrics = {
        'created_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        'device': str(device),
        'pretrained_used': pretrained_used,
        'classes': train_ds.classes,
        'epochs': args.epochs,
        'batch_size': args.batch_size,
        'image_size': args.image_size,
        'balance': args.balance,
        'mixup_alpha': args.mixup_alpha,
        'train_class_counts': {name: int(counts[index]) for index, name in enumerate(train_ds.classes)},
        'train_count': len(train_ds),
        'val_count': len(val_ds),
        'test_count': len(test_ds),
        'best_val_macro_f1': best_macro_f1,
        'operating_point': operating_point,
        'val': val_metrics,
        'test': test_metrics,
        'history': history,
        'seconds': round(time.time() - started, 1),
        'limitations': '当前仍是图像分类模型；YOLO 检测、P2 小目标头、框级 mAP 和 NMS 需带框标注的独立检测训练。',
    }
    (out_dir / 'metrics.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding='utf-8')
    (out_dir / 'class_names.json').write_text(json.dumps({'class_names': train_ds.classes}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
