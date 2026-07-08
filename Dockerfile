# ImageLab — single self-contained image: nginx serves the Angular app and
# proxies /api to the FastAPI backend (VTracer + Tesseract + Real-ESRGAN)
# running in the same container. See docs in README.md and AGENTS.md.

# --- Stage 1: build the Angular app --------------------------------------
FROM node:24-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY angular.json tsconfig.json tsconfig.app.json ./
COPY public ./public
COPY src ./src
RUN npm run build -- --configuration production

# --- Stage 2: fetch the upscaler model (checksum-pinned) ------------------
# Real-ESRGAN ONNX weights for /upscale. Kept out of git; published as a
# GitHub release asset. Changing the model means updating both build args.
FROM debian:bookworm-slim AS model
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ARG MODEL_URL=https://github.com/giacoct/ImageLab/releases/download/models-v1/realesr-general-x4v3.onnx
ARG MODEL_SHA256=4f5a9ef782d8f5b8a9b431234d813bf837a6dfa790baa59b13a7a769ba944534
RUN curl -fSL --retry 3 -o /model.onnx "$MODEL_URL" \
 && echo "$MODEL_SHA256  /model.onnx" | sha256sum -c -

# --- Stage 3: runtime -----------------------------------------------------
FROM python:3.12-slim-bookworm

# tesseract-ocr ships English; each extra language is its own package and must
# stay in sync with OCR_LANGUAGES in src/app/tools/ocr/ocr.ts.
RUN apt-get update && apt-get install -y --no-install-recommends \
      nginx \
      tesseract-ocr \
      tesseract-ocr-ita \
      curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/imagelab/server
COPY server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server/app.py ./
# app.py resolves the model as <dir-of-app.py>/models/realesr-general-x4v3.onnx
COPY --from=model /model.onnx models/realesr-general-x4v3.onnx
COPY --from=web /app/dist/ImageLab/browser /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD curl -fsS http://127.0.0.1/api/health || exit 1

CMD ["entrypoint.sh"]
