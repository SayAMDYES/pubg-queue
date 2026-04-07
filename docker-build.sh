#!/usr/bin/env bash
# docker-build.sh — 智能 Docker 构建脚本
# 功能：
#   1. 检测网络环境（中国大陆 / 海外），自动选择合适的 Go/npm 镜像源
#   2. 检测本地 Go 环境；若存在则生成 vendor 目录，容器内构建时完全跳过模块下载
#   3. 检测本地 npm 环境（信息展示；BuildKit 缓存自动处理 npm 包）
#   4. 启用 Docker BuildKit，传入构建参数后执行 docker build
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-pubg-queue}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 检测是否在中国大陆 ──────────────────────────────────────────────────────
detect_china() {
    # 尝试连接 Google；3 秒超时，失败则认为在中国大陆
    if curl -s --connect-timeout 3 -m 5 -o /dev/null https://www.google.com 2>/dev/null; then
        echo "0"
    else
        echo "1"
    fi
}

# ── 检测本地 Go 环境并返回模块缓存目录 ────────────────────────────────────────
detect_go_modcache() {
    if command -v go &>/dev/null; then
        local cache
        cache=$(go env GOMODCACHE 2>/dev/null || true)
        if [ -n "$cache" ] && [ -d "$cache" ]; then
            echo "$cache"
        fi
    fi
}

# ── 检测本地 npm 缓存目录 ─────────────────────────────────────────────────────
detect_npm_cache() {
    if command -v npm &>/dev/null; then
        local cache
        cache=$(npm config get cache 2>/dev/null || true)
        if [ -n "$cache" ] && [ -d "$cache" ]; then
            echo "$cache"
        fi
    fi
}

# ── 主流程 ────────────────────────────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║   趴布鸡排队 — Docker 智能构建脚本             ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# 1. 检测地区
echo "▶ 正在检测网络环境..."
IN_CHINA=$(detect_china)
if [ "$IN_CHINA" = "1" ]; then
    echo "  结果：中国大陆（将使用国内镜像源）"
    GOPROXY="https://goproxy.cn,https://goproxy.io,direct"
    GONOSUMDB="*"
    NPM_REGISTRY="https://registry.npmmirror.com"
else
    echo "  结果：非中国大陆（使用官方镜像源）"
    GOPROXY="https://proxy.golang.org,direct"
    GONOSUMDB=""
    NPM_REGISTRY="https://registry.npmjs.org"
fi

# 2. 检测本地 Go 环境
VENDOR_CREATED=0
USE_VENDOR=0
echo ""
echo "▶ 检测本地 Go 环境..."
GOMODCACHE=$(detect_go_modcache)
if [ -n "$GOMODCACHE" ]; then
    GO_VERSION=$(go version | awk '{print $3}')
    echo "  已找到本地 Go：$GO_VERSION"
    echo "  模块缓存目录：$GOMODCACHE"
    echo "  正在生成 vendor 目录（将跳过容器内模块下载）..."
    go mod vendor
    USE_VENDOR=1
    VENDOR_CREATED=1
    echo "  vendor 目录已生成 ✓"
else
    echo "  未找到本地 Go 环境，构建时将在容器内下载模块"
    echo "  （后续构建将由 Docker BuildKit 缓存加速）"
fi

# 3. 检测本地 npm 环境
echo ""
echo "▶ 检测本地 npm 环境..."
NPMCACHE=$(detect_npm_cache)
if [ -n "$NPMCACHE" ]; then
    NPM_VERSION=$(npm --version 2>/dev/null || echo "未知")
    echo "  已找到本地 npm：v$NPM_VERSION（缓存：$NPMCACHE）"
    echo "  Docker BuildKit 将使用持久化缓存加速前端依赖安装"
else
    echo "  未找到本地 npm 环境，将使用 Docker BuildKit 缓存"
fi

# 4. 构建 Docker 镜像
echo ""
echo "▶ 开始构建 Docker 镜像..."
echo "  镜像名称    ：${IMAGE_NAME}"
echo "  GOPROXY     ：${GOPROXY}"
echo "  NPM_REGISTRY：${NPM_REGISTRY}"
echo "  USE_VENDOR  ：${USE_VENDOR}"
echo ""

DOCKER_BUILDKIT=1 docker build \
    --build-arg "GOPROXY=${GOPROXY}" \
    --build-arg "GONOSUMDB=${GONOSUMDB}" \
    --build-arg "NPM_REGISTRY=${NPM_REGISTRY}" \
    --build-arg "USE_VENDOR=${USE_VENDOR}" \
    -t "${IMAGE_NAME}" \
    "$@" \
    .

# 5. 清理本脚本生成的 vendor 目录
if [ "$VENDOR_CREATED" = "1" ]; then
    echo ""
    echo "▶ 清理临时 vendor 目录..."
    rm -rf vendor/
    echo "  完成 ✓"
fi

echo ""
echo "✓ Docker 镜像构建完成：${IMAGE_NAME}"
echo ""
echo "运行方式："
echo "  docker run --rm -e ADMIN_PASS=xxx -p 8080:8080 ${IMAGE_NAME} --admin-pass xxx"
echo "  或：docker-compose up -d"
echo ""
