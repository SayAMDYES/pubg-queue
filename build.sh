#!/usr/bin/env bash
# 趴布鸡排队 — 交互式打包脚本
set -e

APP_NAME="pubg-queue"
OUTPUT_DIR="$(pwd)"

echo ""
echo "╔══════════════════════════════════╗"
echo "║   趴布鸡排队 — 选择打包环境       ║"
echo "╚══════════════════════════════════╝"
echo ""
echo "  1) Linux   amd64（服务器 / x86_64）"
echo "  2) Linux   arm64（ARM 服务器 / NAS）"
echo "  3) macOS   amd64（Intel Mac）"
echo "  4) macOS   arm64（Apple Silicon M 系列）"
echo "  5) Windows amd64（x86_64 .exe）"
echo "  0) 退出"
echo ""
read -r -p "请输入选项 [0-5]: " choice

case "$choice" in
  1) GOOS=linux;   GOARCH=amd64; EXT="" ;;
  2) GOOS=linux;   GOARCH=arm64; EXT="" ;;
  3) GOOS=darwin;  GOARCH=amd64; EXT="" ;;
  4) GOOS=darwin;  GOARCH=arm64; EXT="" ;;
  5) GOOS=windows; GOARCH=amd64; EXT=".exe" ;;
  0) echo "已取消。"; exit 0 ;;
  *) echo "无效选项，已退出。"; exit 1 ;;
esac

OUTPUT="${OUTPUT_DIR}/${APP_NAME}-${GOOS}-${GOARCH}${EXT}"

echo ""
echo "→ 目标平台：${GOOS}/${GOARCH}"
echo "→ 输出路径：${OUTPUT}"
echo ""

GOOS=$GOOS GOARCH=$GOARCH go build -ldflags="-s -w" -o "$OUTPUT" .

echo "✓ 打包完成：$OUTPUT"
