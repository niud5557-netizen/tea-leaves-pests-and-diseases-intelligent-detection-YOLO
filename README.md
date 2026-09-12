# AI茶查查

茶园病虫害智能识别与绿色防控辅助系统，包含 PC 管理端、移动网页端、微信小程序源码、模型推理 API、专家复核、处置和复查闭环。

## Public Demo

- [公开首页](https://niud5557-netizen.github.io/tea-leaves-pests-and-diseases-intelligent-detection-YOLO/)
- [管理网页](https://niud5557-netizen.github.io/tea-leaves-pests-and-diseases-intelligent-detection-YOLO/manager/)
- [移动网页](https://niud5557-netizen.github.io/tea-leaves-pests-and-diseases-intelligent-detection-YOLO/mobile/)

公开网页为 GitHub Pages 静态演示版：识别记录保存在当前浏览器本地，上传图片不会发送到 GitHub。需要真实 ONNX 推理、跨设备数据和图片服务时，请按部署说明运行后端并为小程序配置 HTTPS 合法请求域名。

## Current model boundary

当前运行模型是导出为 ONNX 的 MobileNetV3-Small 图像分类器，是开放集初筛基线，不是 YOLO 检测器，也不是病斑分割模型。加入 `unknown` 负样本后，推理会拒识非茶叶或不确定图片，而不是强行输出病害类别。

分类器 API 不返回病斑框、虫体框、病斑面积或严重程度；这些能力需要带框标注的 YOLO 检测模型或掩膜级分割模型重新训练。

## 本地运行

```powershell
cd "C:\Users\刁金生\Desktop\tea\tea test"
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

打开 `http://127.0.0.1:8080/manager/` 管理网页、`http://127.0.0.1:8080/mobile/` 移动网页，或访问 `http://127.0.0.1:8080/api/health` 检查服务。

停止本地服务：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop.ps1
```

## 重新训练拒识模型

建议准备 `healthy_leaf`、`weeds`、`soil`、`non_tea` 四组负样本，放在同一个目录下，例如 `C:\Users\刁金生\Desktop\tea negative samples`。

```powershell
cd "C:\Users\刁金生\Desktop\tea\tea test"
$env:PYTHONPATH=$null
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

训练脚本会把逐类 Precision、Recall、F1、宏平均 F1、balanced accuracy 和混淆矩阵写入 `models/metrics.json`，并从验证集校准拒识阈值后写入 `models/model_metadata.json`。

完整的数据策略、检测器迁移条件、推理阈值和评估方案见 [MODEL_OPTIMIZATION_PLAN.md](docs/MODEL_OPTIMIZATION_PLAN.md)。

## 微信小程序

在微信开发者工具中导入 `C:\Users\刁金生\Desktop\tea\tea test\miniprogram`。电脑与手机真机联调时，服务需监听局域网地址，小程序当前默认请求 `http://10.245.179.101:8080`；若电脑 Wi-Fi 地址变化，请同步修改 `miniprogram/app.js` 中的 `globalData.baseUrl`。开发者工具和真机调试还需关闭合法域名校验。正式使用必须切换为 HTTPS 后端，并在微信公众平台配置合法请求域名。当前小程序已包含首页统计、首次引导、帮助说明、拍照/相册识别、治理建议、历史记录和复查任务。
