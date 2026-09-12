# 部署说明

## 目录位置

最终项目目录：C:\Users\刁金生\Desktop\tea\tea test

## 环境要求

- Node.js：项目脚本会优先使用 Codex 内置 Node：C:\Users\刁金生\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
- Python：C:\Users\刁金生\Desktop\tea test\.venv\Scripts\python.exe
- Python 依赖：	orch、	orchvision、onnx、onnxruntime、Pillow、ultralytics 等已安装。
- Node 依赖：express、cors、multer、sharp 已安装。

## 一键部署

`powershell
cd "C:\Users\刁金生\Desktop\tea\tea test"
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
`

默认环境变量：

- PORT=8080
- HOST=0.0.0.0（真机调试需要监听局域网）
- ANALYZER_MODE=model
- PYTHON_PATH=.venv\Scripts\python.exe

## 验证命令

`powershell
cd "C:\Users\刁金生\Desktop\tea\tea test"
node .\scripts\verify.mjs
`

验证内容：

- API 健康检查
- 病害样本上传识别
- 虫害样本上传识别
- 专家复核
- 处置任务生成
- 复查闭环
- PC 管理端静态资源 HTTP 200
- 移动网页端静态资源 HTTP 200
- 微信小程序 JSON 和页面源码结构检查

## 微信小程序部署

1. 打开微信开发者工具。
2. 选择导入项目，目录选择：C:\Users\刁金生\Desktop\tea test\miniprogram。
3. 真机调试时，把 `miniprogram/app.js` 的 `globalData.baseUrl` 设置为电脑当前 Wi-Fi IPv4 地址，例如 `http://10.245.179.101:8080`；手机和电脑必须连接同一局域网。
4. 开发者工具和真机调试阶段关闭合法域名校验；若电脑防火墙拦截 8080 端口，需要允许 Node.js 通过专用网络。
5. 若部署到公网，需要把 `miniprogram/app.js` 的 `baseUrl` 改成 HTTPS 后端域名，并在微信公众平台配置合法请求域名。

## 生产化建议

- 后端建议部署到学校服务器、阿里云或腾讯云轻量服务器，使用 HTTPS 和对象存储保存图片。
- 模型建议保留版本号、训练数据哈希、混淆矩阵和专家复核记录。
- 国赛现场演示建议准备 2 张病害、2 张虫害、1 张健康样本，避免现场网络和拍照质量影响展示。
