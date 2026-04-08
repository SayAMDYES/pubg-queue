#!/usr/bin/env bash
# docker-build.sh — 智能 Docker 构建脚本
# 功能：
#   1. 优先读取主机已配置的 GOPROXY / npm registry，其次通过网络探测自动选择镜像源
#   2. 读取主机 Go 模块缓存目录（go env GOMODCACHE）；若 Go 可用则生成 vendor 目录，
#      容器内构建时完全跳过模块下载
#   3. 读取主机 npm 缓存目录（npm config get cache）；BuildKit 持久缓存自动复用
#   4. 支持 --compose 标志：将构建参数导出为环境变量后调用 docker compose up --build
#      其余参数原样透传给 docker build 或 docker compose up
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-pubg-queue}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 解析参数 ─────────────────────────────────────────────────────────────────
COMPOSE_MODE=0
PASSTHROUGH_ARGS=()
for arg in "$@"; do
    if [ "$arg" = "--compose" ]; then
        COMPOSE_MODE=1
    else
        PASSTHROUGH_ARGS+=("$arg")
    fi
done

# ── 检测是否在中国大陆 ──────────────────────────────────────────────────────
# 可通过环境变量 IN_CHINA=1 或 IN_CHINA=0 直接指定，跳过网络探测
detect_china() {
    if [ -n "${IN_CHINA:-}" ]; then
        echo "${IN_CHINA}"
        return
    fi
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

# 1. 确定 GOPROXY
# 优先级：显式环境变量 > 主机 go env GOPROXY > 网络自动探测
echo "▶ 检测 Go 代理配置..."
if [ -n "${GOPROXY:-}" ]; then
    echo "  使用环境变量 GOPROXY：${GOPROXY}"
    GONOSUMDB="${GONOSUMDB:-}"
elif command -v go &>/dev/null; then
    HOST_GOPROXY=$(go env GOPROXY 2>/dev/null || true)
    # 若主机 GOPROXY 已指向国内镜像则直接复用
    if [ -n "$HOST_GOPROXY" ] && [ "$HOST_GOPROXY" != "off" ] && [ "$HOST_GOPROXY" != "direct" ]; then
        GOPROXY="$HOST_GOPROXY"
        GONOSUMDB=$(go env GONOSUMDB 2>/dev/null || true)
        echo "  读取主机 go env GOPROXY：${GOPROXY}"
        [ -n "$GONOSUMDB" ] && echo "  读取主机 go env GONOSUMDB：${GONOSUMDB}"
    else
        echo "  主机 GOPROXY 为默认值，通过网络探测自动选择..."
        IN_CHINA=$(detect_china)
        if [ "$IN_CHINA" = "1" ]; then
            GOPROXY="https://goproxy.cn,https://goproxy.io,direct"
            GONOSUMDB="*"
        else
            GOPROXY="${HOST_GOPROXY:-https://proxy.golang.org,direct}"
            GONOSUMDB=""
        fi
        echo "  最终 GOPROXY：${GOPROXY}"
    fi
else
    echo "  未检测到本地 Go，通过网络探测自动选择..."
    IN_CHINA=$(detect_china)
    if [ "$IN_CHINA" = "1" ]; then
        GOPROXY="https://goproxy.cn,https://goproxy.io,direct"
        GONOSUMDB="*"
    else
        GOPROXY="https://proxy.golang.org,direct"
        GONOSUMDB=""
    fi
    echo "  最终 GOPROXY：${GOPROXY}"
fi

# 2. 确定 NPM_REGISTRY
# 优先级：显式环境变量 > 主机 npm config get registry > 与 GOPROXY 来源一致的镜像
echo ""
echo "▶ 检测 npm 镜像配置..."
if [ -n "${NPM_REGISTRY:-}" ]; then
    echo "  使用环境变量 NPM_REGISTRY：${NPM_REGISTRY}"
elif command -v npm &>/dev/null; then
    HOST_NPM_REGISTRY=$(npm config get registry 2>/dev/null || true)
    # 去掉末尾斜杠方便比较
    HOST_NPM_REGISTRY="${HOST_NPM_REGISTRY%/}"
    if [ -n "$HOST_NPM_REGISTRY" ] && [ "$HOST_NPM_REGISTRY" != "https://registry.npmjs.org" ]; then
        NPM_REGISTRY="$HOST_NPM_REGISTRY"
        echo "  读取主机 npm config registry：${NPM_REGISTRY}"
    else
        # 跟随 GOPROXY 的地区判断结果
        if echo "$GOPROXY" | grep -q "goproxy.cn\|goproxy.io"; then
            NPM_REGISTRY="https://registry.npmmirror.com"
        else
            NPM_REGISTRY="https://registry.npmjs.org"
        fi
        echo "  最终 NPM_REGISTRY：${NPM_REGISTRY}"
    fi
else
    if echo "$GOPROXY" | grep -q "goproxy.cn\|goproxy.io"; then
        NPM_REGISTRY="https://registry.npmmirror.com"
    else
        NPM_REGISTRY="https://registry.npmjs.org"
    fi
    echo "  最终 NPM_REGISTRY：${NPM_REGISTRY}"
fi

# 3. 检测本地 Go 模块缓存，决定是否使用 vendor 模式
VENDOR_CREATED=0
USE_VENDOR="${USE_VENDOR:-0}"
echo ""
echo "▶ 检测本地 Go 模块缓存..."
GOMODCACHE=$(detect_go_modcache)
if [ -n "$GOMODCACHE" ]; then
    GO_VERSION=$(go version | awk '{print $3}')
    echo "  已找到本地 Go：$GO_VERSION"
    echo "  模块缓存目录：$GOMODCACHE"
    if [ "$USE_VENDOR" = "1" ]; then
        echo "  USE_VENDOR 已由环境变量强制设为 1，跳过重新生成检测"
    elif [ -f "vendor/modules.txt" ] && [ "vendor/modules.txt" -nt "go.sum" ]; then
        echo "  vendor 目录已是最新，跳过重新生成 ✓"
        USE_VENDOR=1
    else
        echo "  正在生成 vendor 目录（将跳过容器内模块下载）..."
        go mod vendor
        VENDOR_CREATED=1
        USE_VENDOR=1
        echo "  vendor 目录已生成 ✓"
    fi
else
    echo "  未找到本地 Go 模块缓存，构建时将在容器内下载模块"
    echo "  （后续构建将由 Docker BuildKit 缓存加速）"
fi

# 4. 检测本地 npm 缓存（信息展示）
echo ""
echo "▶ 检测本地 npm 缓存..."
NPMCACHE=$(detect_npm_cache)
if [ -n "$NPMCACHE" ]; then
    NPM_VERSION=$(npm --version 2>/dev/null || echo "未知")
    echo "  已找到本地 npm：v$NPM_VERSION（缓存：$NPMCACHE）"
    echo "  Docker BuildKit 将使用持久化缓存加速前端依赖安装"
else
    echo "  未找到本地 npm 环境，将使用 Docker BuildKit 缓存"
fi

# 5. 执行构建
echo ""
if [ "$COMPOSE_MODE" = "1" ]; then
    echo "▶ 开始构建并启动服务（docker compose 模式）..."
    echo "  GOPROXY     ：${GOPROXY}"
    echo "  NPM_REGISTRY：${NPM_REGISTRY}"
    echo "  USE_VENDOR  ：${USE_VENDOR}"
    echo ""
    DOCKER_BUILDKIT=1 \
    GOPROXY="$GOPROXY" \
    GONOSUMDB="$GONOSUMDB" \
    NPM_REGISTRY="$NPM_REGISTRY" \
    USE_VENDOR="$USE_VENDOR" \
        docker compose up --build ${PASSTHROUGH_ARGS[@]+"${PASSTHROUGH_ARGS[@]}"}
else
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
        ${PASSTHROUGH_ARGS[@]+"${PASSTHROUGH_ARGS[@]}"} \
        .
fi

# 6. 清理本脚本生成的 vendor 目录
if [ "$VENDOR_CREATED" = "1" ]; then
    echo ""
    echo "▶ 清理临时 vendor 目录..."
    rm -rf vendor/
    echo "  完成 ✓"
fi

echo ""
if [ "$COMPOSE_MODE" = "1" ]; then
    echo "✓ 服务已通过 docker compose 启动"
else
    echo "✓ Docker 镜像构建完成：${IMAGE_NAME}"
    echo ""
    echo "运行方式："
    echo "  docker run --rm -e ADMIN_PASS=xxx -p 8080:8080 ${IMAGE_NAME} --admin-pass xxx"
    echo "  或：docker compose up -d"
fi
echo ""
