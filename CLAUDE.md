# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

PUBG 活动排队系统 — 基于 Go + React 的全栈 Web 应用。提供日历视图、活动报名/候补/递补、用户账号（手机号登录）、管理后台、PUBG 战绩查询。前端 SPA 嵌入 Go 二进制通过 `//go:embed` 部署为单文件。

## 常用命令

```bash
# 本地运行（需先构建前端）
cd frontend && npm ci && npm run build && cd ..
go run . --admin-pass "<密码>"

# 前端开发模式（热重载，代理 /api 到 8080）
cd frontend && npm run dev

# 构建
make build          # 仅后端（依赖 frontend/dist）
make build-all      # 前端 + 后端
make test           # Go 测试

# Docker
docker compose up -d --build
# 或使用智能构建脚本（自动检测中国区镜像加速）
./docker-build.sh --compose -d
```

## 架构

**后端** (`Go 1.21`, `chi` 路由):
- `main.go` — 入口，加载配置、初始化 DB、注册路由、嵌入前端静态资源
- `internal/api/` — JSON API 处理器，分为 `public.go`（前台）和 `admin.go`（后台）
- `internal/service/` — 业务逻辑层：排队算法（每队 4 人，超容量候补，离队自动递补）、用户管理、PUBG API 集成
- `internal/middleware/` — 认证（session-based，7 天有效期）、限流、安全头、登录封禁（5 次失败封 24 小时）
- `internal/model/` — 数据模型
- `internal/db/schema.go` — SQLite 自动迁移
- `internal/config/` — 环境变量配置加载

**前端** (`React 19`, `TypeScript`, `Ant Design 6`, `Vite 8`):
- `frontend/src/pages/` — 页面组件：`CalendarPage`, `EventDetailPage`, `StatsPage`, `UserLoginPage`, `admin/`
- `frontend/src/api.ts` — API 接口定义
- `frontend/src/request.ts` — Axios HTTP 客户端
- `frontend/src/hooks/useUserMe.ts` — 用户认证 hook

**关键约定**:
- 活动以 `event_date`（日期字符串）作为路由键，非数据库 ID
- 统一 API 响应格式：`{code, msg, data}`
- 中间件链：Logger → Recoverer → SecurityHeaders → RateLimiter → Auth
- 前端 Vite 开发服务器代理 `/api` 到后端 `localhost:8080`

## 开发约束

- 优先保持现有目录结构和代码风格，不做无关重构
- 修改代码时局部变更，避免调整无关文件
- 注释只解释代码行为，不复述需求
- commit message 使用简洁中文
- 不要在提交信息或代码署名中加入 AI、Claude、Anthropic 等相关标识
