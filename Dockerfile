# syntax=docker/dockerfile:1

# ── 阶段 1：构建前端 ──
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
# NPM_REGISTRY 可由 docker-build.sh 注入；中国大陆传入 npmmirror 以加速依赖下载
ARG NPM_REGISTRY=https://registry.npmjs.org
COPY frontend/package.json frontend/package-lock.json ./
# --mount=type=cache 让 npm 包缓存在 Docker BuildKit 持久存储中，重复构建时跳过已下载的包
RUN --mount=type=cache,target=/root/.npm,id=pubg-npm \
    npm ci --registry="${NPM_REGISTRY}"
COPY frontend/ .
RUN npm run build

# ── 阶段 2：构建后端（嵌入前端 dist）──
FROM golang:1.21-alpine AS builder
WORKDIR /app
# GOPROXY：中国大陆传入 goproxy.cn；GONOSUMDB=* 跳过 sum.golang.org（在大陆可能被阻断）
# USE_VENDOR=1 时使用预生成的 vendor 目录，完全跳过容器内模块下载
ARG GOPROXY=https://proxy.golang.org,direct
ARG GONOSUMDB=
ARG USE_VENDOR=0
ENV GOPROXY=${GOPROXY} GONOSUMDB=${GONOSUMDB}
COPY go.mod go.sum ./
# 仅在非 vendor 模式下下载模块；--mount=type=cache 使模块缓存跨次构建复用
RUN --mount=type=cache,target=/go/pkg/mod,id=pubg-gomod \
    if [ "${USE_VENDOR}" != "1" ]; then go mod download; fi
COPY . .
COPY --from=frontend /app/frontend/dist ./frontend/dist
RUN --mount=type=cache,target=/go/pkg/mod,id=pubg-gomod \
    --mount=type=cache,target=/root/.cache/go-build,id=pubg-gobuild \
    if [ "${USE_VENDOR}" = "1" ]; then \
        CGO_ENABLED=0 go build -mod=vendor -ldflags="-s -w" -o pubg-queue .; \
    else \
        CGO_ENABLED=0 go build -ldflags="-s -w" -o pubg-queue .; \
    fi

# ── 阶段 3：运行 ──
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/pubg-queue .
RUN mkdir -p /data
VOLUME ["/data"]
ENV DB_PATH=/data/pubg_queue.db
EXPOSE 8080
ENTRYPOINT ["./pubg-queue"]
