import argparse
import csv
import hashlib
import json
import random
import shutil
from collections import Counter, defaultdict
from pathlib import Path
from PIL import Image, ImageOps

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}
LOCAL_CLASS_MAP = {
    'algal leaf': 'algal_leaf',
    'Anthracnose': 'anthracnose',
    'bird eye spot': 'bird_eye_spot',
    'brown blight': 'brown_blight',
    'gray light': 'gray_blight',
    'healthy': 'healthy',
    'red leaf spot': 'red_leaf_spot',
    'white spot': 'white_spot',
}
PEST_PREFIX_MAP = {
    'LeafBeetle': 'leaf_beetle',
    'Mirid': 'apolygus_lucorum',
    'TeaBlisterBlightAfter': 'tea_blister_blight_perforation',
    'TeaBlisterBlight': 'tea_blister_blight',
    'WhiteScab': 'tea_white_scab',
    'Anthracnose': 'anthracnose',
}
PEST_LABEL_MAP = {
    '0': 'leaf_beetle',
    '1': 'tea_white_scab',
    '2': 'tea_blister_blight',
    '3': 'tea_blister_blight_perforation',
    '4': 'apolygus_lucorum',
    '5': 'anthracnose',
}
CLASS_NAMES = [
    'healthy', 'algal_leaf', 'anthracnose', 'bird_eye_spot', 'brown_blight', 'gray_blight',
    'red_leaf_spot', 'white_spot', 'tea_white_scab', 'tea_blister_blight',
    'tea_blister_blight_perforation', 'leaf_beetle', 'apolygus_lucorum'
]
DISPLAY_NAMES = {
    'healthy': '健康叶片',
    'algal_leaf': '藻斑病',
    'anthracnose': '茶炭疽病',
    'bird_eye_spot': '鸟眼斑',
    'brown_blight': '褐斑病',
    'gray_blight': '灰斑病',
    'red_leaf_spot': '红叶斑',
    'white_spot': '白斑病',
    'tea_white_scab': '茶白星病/白痂症状',
    'tea_blister_blight': '茶饼病',
    'tea_blister_blight_perforation': '茶饼病穿孔期',
    'leaf_beetle': '叶甲类虫害',
    'apolygus_lucorum': '绿盲蝽类虫害',
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def image_ok(path: Path):
    try:
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            width, height = image.size
        return True, width, height, ''
    except Exception as exc:
        return False, 0, 0, str(exc)


def class_from_pest_file(image_path: Path, label_dir: Path) -> str | None:
    prefix = image_path.name.split('_')[0]
    if prefix in PEST_PREFIX_MAP:
        return PEST_PREFIX_MAP[prefix]
    label_path = label_dir / (image_path.stem + '.txt')
    if not label_path.exists():
        return None
    counts = Counter()
    for line in label_path.read_text(encoding='utf-8', errors='ignore').splitlines():
        parts = line.strip().split()
        if parts and parts[0] in PEST_LABEL_MAP:
            counts[PEST_LABEL_MAP[parts[0]]] += 1
    return counts.most_common(1)[0][0] if counts else None


def collect_samples(source_root: Path, include_augmented_train: bool):
    samples = []
    rejected = []
    for folder_name, class_code in LOCAL_CLASS_MAP.items():
        folder = source_root / folder_name
        if not folder.exists():
            continue
        for path in folder.rglob('*'):
            if path.is_file() and path.suffix.lower() in IMAGE_EXTS:
                samples.append({'path': path, 'class_code': class_code, 'source': 'local_disease_folder'})

    pest_root = source_root / 'tea_pests_and_diseases'
    pest_sets = [('original', pest_root / 'original')]
    if include_augmented_train:
        pest_sets.append(('augmented_train', pest_root / 'augmented' / 'train'))
    for source_name, base in pest_sets:
        image_dir = base / 'images'
        label_dir = base / 'labels'
        if not image_dir.exists():
            continue
        for path in image_dir.glob('*.jpg'):
            class_code = class_from_pest_file(path, label_dir)
            if class_code:
                samples.append({'path': path, 'class_code': class_code, 'source': source_name})
            else:
                rejected.append({'path': str(path), 'reason': '无法从文件名或YOLO标签推断类别'})
    return samples, rejected


def split_by_hash(samples, seed: int, train_ratio: float, val_ratio: float):
    grouped = defaultdict(list)
    for sample in samples:
        grouped[sample['class_code']].append(sample)
    random.seed(seed)
    split_rows = []
    for class_code, rows in grouped.items():
        rows = sorted(rows, key=lambda row: row['sha256'])
        random.shuffle(rows)
        total = len(rows)
        if total < 3:
            cut_train = total
            cut_val = total
        else:
            cut_train = max(1, int(total * train_ratio))
            cut_val = max(cut_train + 1, int(total * (train_ratio + val_ratio)))
            if total - cut_val < 1:
                cut_val = total - 1
        for index, row in enumerate(rows):
            row = dict(row)
            row['split'] = 'train' if index < cut_train else 'val' if index < cut_val else 'test'
            split_rows.append(row)
    return split_rows


def copy_normalized(sample, output_dir: Path, image_size: int, sequence: int):
    destination_dir = output_dir / 'imagefolder' / sample['split'] / sample['class_code']
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / f"{sequence:06d}_{sample['sha256'][:12]}.jpg"
    with Image.open(sample['path']) as image:
        image = ImageOps.exif_transpose(image).convert('RGB')
        image.thumbnail((image_size, image_size), Image.Resampling.LANCZOS)
        canvas = Image.new('RGB', (image_size, image_size), (246, 248, 240))
        left = (image_size - image.width) // 2
        top = (image_size - image.height) // 2
        canvas.paste(image, (left, top))
        canvas.save(destination, quality=92, optimize=True)
    return destination


def main():
    parser = argparse.ArgumentParser(description='Prepare AI茶查查 disease+pest classification dataset.')
    parser.add_argument('--source', default=r'C:\Users\刁金生\Desktop\tea sickness dataset')
    parser.add_argument('--output', default='dataset/prepared')
    parser.add_argument('--image-size', type=int, default=256)
    parser.add_argument('--seed', type=int, default=20260814)
    parser.add_argument('--include-augmented-train', action='store_true', help='只把外部增强集train作为训练补充；默认关闭以避免泄漏争议')
    parser.add_argument('--train-ratio', type=float, default=0.72)
    parser.add_argument('--val-ratio', type=float, default=0.14)
    args = parser.parse_args()

    source_root = Path(args.source)
    output_dir = Path(args.output)
    if not source_root.exists():
        raise SystemExit(f'数据集目录不存在: {source_root}')
    if output_dir.exists():
        shutil.rmtree(output_dir)
    (output_dir / 'reports').mkdir(parents=True, exist_ok=True)

    raw_samples, rejected = collect_samples(source_root, args.include_augmented_train)
    hash_index = {}
    conflicts = []
    clean_samples = []
    for sample in raw_samples:
        ok, width, height, issue = image_ok(sample['path'])
        if not ok:
            rejected.append({'path': str(sample['path']), 'reason': '图像无法读取: ' + issue})
            continue
        file_hash = sha256_file(sample['path'])
        sample.update({'sha256': file_hash, 'width': width, 'height': height})
        previous = hash_index.get(file_hash)
        if previous:
            if previous['class_code'] != sample['class_code']:
                conflicts.append({'sha256': file_hash, 'kept': str(previous['path']), 'kept_class': previous['class_code'], 'dropped': str(sample['path']), 'dropped_class': sample['class_code']})
            else:
                rejected.append({'path': str(sample['path']), 'reason': '同类别重复图像，已去重'})
            continue
        hash_index[file_hash] = sample
        clean_samples.append(sample)

    split_rows = split_by_hash(clean_samples, args.seed, args.train_ratio, args.val_ratio)
    metadata_rows = []
    for index, sample in enumerate(split_rows, 1):
        out_path = copy_normalized(sample, output_dir, args.image_size, index)
        metadata_rows.append({
            'split': sample['split'],
            'class_code': sample['class_code'],
            'display_name': DISPLAY_NAMES.get(sample['class_code'], sample['class_code']),
            'source': sample['source'],
            'sha256': sample['sha256'],
            'width': sample['width'],
            'height': sample['height'],
            'original_path': str(sample['path']),
            'prepared_path': str(out_path),
        })

    with (output_dir / 'metadata.csv').open('w', newline='', encoding='utf-8-sig') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(metadata_rows[0].keys()))
        writer.writeheader()
        writer.writerows(metadata_rows)

    distribution = defaultdict(Counter)
    source_distribution = defaultdict(Counter)
    for row in metadata_rows:
        distribution[row['split']][row['class_code']] += 1
        source_distribution[row['source']][row['class_code']] += 1

    report = {
        'generated_at': __import__('datetime').datetime.now().isoformat(timespec='seconds'),
        'source_root': str(source_root),
        'output_dir': str(output_dir.resolve()),
        'policy': {
            'dedupe': 'sha256 exact duplicate removal',
            'split': f"stratified random by class, seed={args.seed}",
            'augmented_train_used': bool(args.include_augmented_train),
            'warning': '外部增强集默认不进入测试集；病斑分割/虫体检测需框级指标另行评估。',
        },
        'classes': [{'code': code, 'name': DISPLAY_NAMES[code]} for code in CLASS_NAMES],
        'raw_images_seen': len(raw_samples),
        'prepared_images': len(metadata_rows),
        'rejected_count': len(rejected),
        'conflict_count': len(conflicts),
        'distribution': {split: dict(counter) for split, counter in distribution.items()},
        'source_distribution': {source: dict(counter) for source, counter in source_distribution.items()},
        'conflicts': conflicts[:100],
        'rejected_examples': rejected[:100],
    }
    (output_dir / 'reports' / 'dataset_audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    (output_dir / 'classes.json').write_text(json.dumps({'class_names': CLASS_NAMES, 'display_names': DISPLAY_NAMES}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
