# AI茶查查 Runtime Image
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    ANALYZER_MODE=model \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN npm install --omit=dev
COPY requirements.runtime.txt ./
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.runtime.txt
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHON_PATH=/opt/venv/bin/python3

COPY server.mjs .env.example README.md DEPLOYMENT.md VERIFICATION_REPORT.md ./
COPY lib ./lib
COPY public ./public
COPY miniprogram ./miniprogram
COPY scripts/predict.py ./scripts/predict.py
COPY models/tea_disease_pest.onnx models/model_metadata.json ./models/
RUN mkdir -p data/uploads data/logs data/reports

EXPOSE 8080
CMD ["node", "server.mjs"]
