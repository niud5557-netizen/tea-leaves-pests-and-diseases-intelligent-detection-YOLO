# 验证报告

生成日期：2026-08-14
项目目录：C:\Users\刁金生\Desktop\tea test

## 数据审计

- 原始图像：1434 张
- 清洗后有效图像：1430 张
- 同类重复剔除：2 张
- 跨类别冲突：2 组
- 数据划分：按类别分层随机划分 train/val/test，随机种子 20260814
- 外部增强集：默认不进入测试集，避免把增强副本当作田间泛化指标

## 模型训练

- 模型结构：MobileNetV3-Small
- 训练设备：cuda:0
- 预训练权重：True
- 训练轮数：12
- 训练集：1023 张
- 验证集：201 张
- 测试集：206 张
- 最佳验证准确率：80.60%
- 测试准确率：78.16%
- ONNX 文件：models/tea_disease_pest.onnx

## 运行验证

- API 健康检查：True
- 病害样本上传：True，返回类别 $(@{generatedAt=2026-08-14T11:45:35.430Z; base=http://127.0.0.1:8080; health=; model=; checks=; disease=; pest=; result=PASS}.disease.classCode)，置信度 $(@{generatedAt=2026-08-14T11:45:35.430Z; base=http://127.0.0.1:8080; health=; model=; checks=; disease=; pest=; result=PASS}.disease.confidence)
- 虫害样本上传：True，返回类别 $(@{generatedAt=2026-08-14T11:45:35.430Z; base=http://127.0.0.1:8080; health=; model=; checks=; disease=; pest=; result=PASS}.pest.classCode)，置信度 $(@{generatedAt=2026-08-14T11:45:35.430Z; base=http://127.0.0.1:8080; health=; model=; checks=; disease=; pest=; result=PASS}.pest.confidence)
- 专家复核：True
- 处置任务：True
- 复查闭环：True
- 验证结论：PASS

## 三端验证

- PC 管理端：http://127.0.0.1:8080/manager/，HTTP 200
- 移动网页端：http://127.0.0.1:8080/mobile/，HTTP 200
- 微信小程序端：miniprogram/app.json、project.config.json、sitemap.json 解析通过，5 个页面文件齐全

## 国赛答辩建议

- 强调从“单点识别工具”升级为“茶园病虫害早筛与绿色防控闭环平台”。
- 用数据审计报告说明去重、冲突样本剔除和防数据泄漏意识。
- 展示模型证据链：数据来源、训练脚本、指标、ONNX 模型、API 推理、专家复核记录。
- 诚实说明当前为分类基线，下一阶段用框级/掩膜级标注训练虫体检测和病斑分割模型。
