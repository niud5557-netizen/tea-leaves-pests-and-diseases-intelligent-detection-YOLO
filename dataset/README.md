# Dataset Notes

原始数据不随代码仓库提交，避免仓库过大和数据许可误用。

- 本地病害数据：8 类茶叶病害/健康图像。
- Kaggle 数据：`tea_pests_and_diseases`，原始目录包含茶树病害与虫害 YOLO 标签。
- 数据准备脚本：`scripts/prepare_dataset.py`。
- 清洗规则：SHA-256 去重、跨类别冲突剔除、按类别分层划分。
- 训练指标和审计结果见本地生成的 `models/metrics.json` 与 `dataset/prepared/reports/dataset_audit.json`。

使用前请根据数据集页面许可要求保留来源说明，不要把当前公开数据集指标直接等同于田间泛化指标。
