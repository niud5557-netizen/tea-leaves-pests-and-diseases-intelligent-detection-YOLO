# AI茶查查 2.1｜茶园病虫害智能识别与绿色防控系统

本项目是面向中国国际大学生创新大赛展示的升级版交付包，已在原有茶叶病害识别基础上补齐虫害识别、三端联动、专家复核、处置复查、数据回流和模型证据链。

## 已交付能力

- **真实模型**：已训练 MobileNetV3-Small 分类模型并导出 ONNX，支持 13 类茶树健康/病害/虫害初筛。
- **PC 管理端**：http://127.0.0.1:8080/manager/，支持看板、地块、识别记录、专家复核、处置任务和模型证据中心。
- **移动网页端**：http://127.0.0.1:8080/mobile/，支持现场拍照上传、结果查看、复核和处置。
- **微信小程序端**：miniprogram/，保留拍照识别、首页看板、地块、历史和任务页面源码。
- **闭环流程**：上传图片 → 模型识别 → 低可信转复核 → 处置记录 → 复查闭环 → 数据留痕。

## 模型与数据

- 原始数据来源：C:\Users\刁金生\Desktop\tea sickness dataset
- 清洗后数据：dataset/prepared/imagefolder/
- 原始样本计数：1434
- 有效训练样本：1430
- 去重/剔除样本：2
- 跨类别冲突：2
- 最佳验证准确率：80.60%
- 测试集准确率：78.16%
- 模型文件：models/tea_disease_pest.onnx
- 指标文件：models/metrics.json

## 支持类别

healthy、lgal_leaf、nthracnose、ird_eye_spot、rown_blight、gray_blight、ed_leaf_spot、white_spot、	ea_white_scab、	ea_blister_blight、	ea_blister_blight_perforation、leaf_beetle、polygus_lucorum。

## 快速启动

`powershell
cd "C:\Users\刁金生\Desktop\tea test"
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
`

访问：

- PC 管理端：http://127.0.0.1:8080/manager/
- 移动网页端：http://127.0.0.1:8080/mobile/
- API 健康检查：http://127.0.0.1:8080/api/health

停止服务：

`powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop.ps1
`

## 重新训练

`powershell
cd "C:\Users\刁金生\Desktop\tea test"
$env:PYTHONPATH=$null
.\.venv\Scripts\python.exe .\scripts\prepare_dataset.py --source "C:\Users\刁金生\Desktop\tea sickness dataset" --output .\dataset\prepared
.\.venv\Scripts\python.exe .\scripts\train.py --data .\dataset\prepared\imagefolder --out .\models --epochs 12 --batch-size 48 --image-size 224
.\.venv\Scripts\python.exe .\scripts\export_model.py --checkpoint .\models\tea_disease_pest_mobilenetv3_best.pth --output .\models\tea_disease_pest.onnx
`

## 能力边界

- 当前模型是**图像分类模型**，不是虫体检测模型，也不是病斑分割模型。
- 页面中的疑似区域框和严重度用于演示辅助决策，未使用框级/掩膜级监督训练。
- 国赛答辩时应把当前指标表述为“公开+本地数据集初筛基线”，田间生产指标需要外部茶园盲测和专家签字样本继续验证。
