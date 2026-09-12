# 茶叶病虫害模型优化方案

## 0. 现状与边界

当前 `tea test` 的可运行模型是 `MobileNetV3-Small` 图像分类器，不是 YOLO 检测器。它只能回答“整张图最像哪一类”，不能产生经过监督学习的病斑、虫体或虫卵框。因此：

- 当前版本不计算 mAP、IoU、NMS，也不能通过增加 P2 头改善现有权重。
- 页面以前显示的病斑框和病斑占比属于演示启发式结果，现已移除。
- 小目标检测和田间定位必须补充框级标注，并单独训练 YOLO 检测模型。

已有分类数据训练分布中，`tea_white_scab` 18 张、`tea_blister_blight_perforation` 22 张、`leaf_beetle` 38 张，而 `tea_blister_blight` 192 张，类别不均衡明显；原数据没有健康叶片以外的系统负样本。

## 1. 数据集方案

### 1.1 负样本数量与目录

建议先采集至少 1,700 张独立原图，推荐目标如下：

| 负样本组 | 推荐原图数 | 最低可接受数 | 内容 |
| --- | ---: | ---: | --- |
| `healthy_leaf` | 500 | 300 | 不同品种、叶龄、正反面、完整和轻微机械损伤的健康茶叶 |
| `weeds` | 400 | 250 | 茶园常见杂草、草地、灌木和相似绿色纹理 |
| `soil` | 300 | 200 | 泥土、枯叶、树皮、石块、积水、农具和地膜 |
| `non_tea` | 500 | 300 | 其他植物叶片、蔬菜、果树、花卉及室内桌面/墙面 |

目录约定：

```text
negative_samples/
  healthy_leaf/
  weeds/
  soil/
  non_tea/
```

准备数据时使用 `--negative-source`。四组样本会统一训练为 `unknown`，但来源组会保留在 `metadata.csv`，便于分析“杂草误判”还是“桌面误判”。不要把负样本只做成纯背景；必须覆盖真实上传视角、距离、手机压缩和强光阴影。

训练/验证/测试按拍摄批次、地点、植株和视频片段分组拆分，推荐 70%/15%/15%，同一连拍序列不能跨 split。验证和测试集不做离线增强。

### 1.2 增强策略

当前分类训练已启用：

- `RandomResizedCrop`、水平/少量垂直翻转、轻微仿射和透视变化；
- 亮度、对比度、饱和度和色相扰动，覆盖强光、阴影和露水反光；
- 少量高斯模糊和 `RandomErasing`，模拟遮挡、叶片重叠和手机失焦；
- MixUp，默认 `alpha=0.20`，仅在训练 batch 使用。

分类任务不建议直接套 Mosaic，因为它会把四张不同叶片拼成不自然的整图。拿到框标注训练 YOLO 后再使用检测增强：Mosaic 前 70% 训练周期概率约 0.5，最后 10 到 15 个 epoch 关闭或降到 0.1；MixUp 约 0.1 到 0.2；HSV/亮度/对比度、随机阴影、轻微运动模糊、Cutout/遮挡概率控制在 0.1 到 0.3。所有几何增强必须同步变换框，露水反光不应被增强成病斑纹理。

### 1.3 类别均衡

- 训练集可以使用 `WeightedRandomSampler`，当前默认模式是 `--balance sampler`。
- 或使用加权交叉熵 `--balance loss`，权重建议先用 `N/(K*n_c)`，再限制最大权重不超过中位数权重的 3 倍。
- 不要同时启用强过采样和强损失加权，否则少数类会过拟合。
- 少数类优先补充真实拍摄样本；过采样只复制训练索引，验证/测试保持自然分布。
- 对 `tea_blister_blight` 等多数类可轻度欠采样，但不要删掉独特田间条件。最佳模型按宏平均 F1 保存，而不是按 accuracy 保存。

## 2. 训练方案

### 2.1 当前可运行分类基线

推荐命令：

```powershell
cd "C:\Users\刁金生\Desktop\tea test"
.\.venv\Scripts\python.exe .\scripts\prepare_dataset.py `
  --source "C:\Users\刁金生\Desktop\tea sickness dataset" `
  --negative-source "C:\Users\刁金生\Desktop\tea negative samples" `
  --output .\dataset\prepared
.\.venv\Scripts\python.exe .\scripts\train.py `
  --data .\dataset\prepared\imagefolder `
  --out .\models `
  --epochs 40 --batch-size 32 --image-size 320 `
  --balance sampler --mixup-alpha 0.20
.\.venv\Scripts\python.exe .\scripts\export_model.py `
  --checkpoint .\models\tea_disease_pest_mobilenetv3_best.pth `
  --output .\models\tea_disease_pest.onnx
```

默认使用 ImageNet 预训练、AdamW、初始学习率 `2e-4`、余弦退火、`weight_decay=1e-4`、label smoothing `0.03`。显存允许时优先把输入提高到 320 或 384；但这仍然只是整图分类，不能替代小目标检测。

### 2.2 YOLO 检测器迁移条件

先为每个病斑、虫体和虫卵画紧致框，并增加健康叶片/背景图的空标签。标注规范必须固定：被遮挡目标也标注可见区域，过小且无法确认的斑点标记为 ignore 或纳入专家复核集，不能随意当背景。

建议从预训练 YOLO 检测权重开始，输入尺寸 960；目标很小或原图分辨率足够时用 1280。增加 P2/stride-4 检测头，与 P3/P4/P5 并行，重点评估小目标 AP、Recall 和误检变化。YOLO11 默认是 anchor-free，通常不需要锚框重聚类；只有使用旧版 anchor-based 结构时，才在训练集框宽高上做 k-means，并用验证集比较聚类前后的召回率。

检测损失可先保持框回归 CIoU/DFL 与分类 BCE/Varifocal 的官方实现，避免同时改动过多变量。训练建议 200 到 300 epoch、warmup 3 epoch、最后 10 到 15 epoch 关闭 Mosaic、保存 patience 30；AdamW 可从 `lr=1e-3` 试起，SGD 可从 `lr=0.01` 试起，具体按有效 batch size 和曲线调整。每次实验只改变一个关键因素，并保留固定的田间外部测试集。

## 3. 推理与拒识

### 3.1 当前分类器

当前推理会读取验证集校准的 `confidence_threshold` 和 `margin_threshold`：当 top-1 置信度过低、top-1 与 top-2 间隔过小，或模型直接选中 `unknown` 时，统一输出 `unknown` 并进入专家复核。这样解决“任意图片强行归为某个病虫害”的开放集问题，但阈值必须用独立验证集重新校准。

阈值调优时扫描置信度 0.35 到 0.85、步长 0.01，并同时观察已知类接受率和 unknown 召回率。生产初筛更重视精确率时，可以约束非茶叶误报率，再选择满足约束的最高召回阈值。不要把测试集用来反复调阈值。

### 3.2 YOLO 检测器

若上传入口允许任意图片，建议使用两级门控：第一级茶叶/非茶叶分类器，第一级通过后才进入病虫害检测器。茶叶门控阈值从 0.70 起，在负样本验证集上调到非茶叶误接收率低于目标；茶园拍摄端也可增加“整株/叶片构图”质量检查。检测器本身仍需保留 unknown/背景硬负样本。

NMS 从 `conf=0.25, iou=0.45` 起做网格搜索，比较 `conf 0.15/0.25/0.35/0.50` 与 `iou 0.30/0.45/0.60`。小目标漏检时先降低 conf 并用验证集控制误报；叶片重叠时优先 class-wise NMS 或尝试 Soft-NMS，不能仅凭肉眼提高 IoU 阈值。最终参数由田间验证集上的 F1 或“Recall 约束下的 Precision”确定。

## 4. 评估与误检分析

分类模型重点报告：overall accuracy 仅作辅助；必须报告 macro/micro Precision、Recall、F1、balanced accuracy、每类 support、每类 F1，以及含 `unknown` 的混淆矩阵。当前训练脚本会保存逐类指标和宏平均 F1，并按宏平均 F1 选择 best checkpoint。

YOLO 检测模型重点报告：`mAP@0.5`、`mAP@0.5:0.95`、Precision、Recall、F1、每类 AP/Recall、不同目标尺寸（small/medium/large）的指标，以及独立非茶叶集上的 false positives/image。mAP@0.5 适合观察“有没有检出”，mAP@0.5:0.95 更能反映框的位置质量。

混淆矩阵按两种视角看：

1. 分类矩阵的行是真实类别、列是预测类别。重点检查 `anthracnose -> bird_eye_spot`、`tea_blister_blight -> tea_blister_blight_perforation` 等相邻症状混淆，并结合每类 support 判断是否只是少样本波动。
2. 检测误差矩阵要增加 `background` 行/列：背景到病害是误检，病害到 background 是漏检，病害 A 到病害 B 是类别混淆。按 `healthy_leaf/weeds/soil/non_tea` 分组统计 false positive，才能定位门控或纹理偏差。

上线前建议至少满足：负样本集误报率达到业务阈值、每个关键少数类 Recall 达标、外部茶园集指标不显著低于随机拆分集，并保留低置信度样本进入专家复核和后续训练回流。
