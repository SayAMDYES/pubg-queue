# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

PUBG 活动排队系统 — Go + React 全栈 Web 应用。日历视图、活动报名/候补/递补、用户账号（手机号登录）、管理后台、PUBG 战绩查询。前端 SPA 通过 `//go:embed frontend/dist/*` 嵌入 Go 二进制，部署为单文件。

## 常用命令

```bash
# 本地运行（需先构建前端）
cd frontend && npm ci && npm run build && cd ..
go run . --admin-pass "<密码>"

# 前端开发模式（热重载，代理 /api → localhost:8080）
cd frontend && npm run dev

# 构建
make build          # 仅后端（依赖 frontend/dist）
make build-all      # 前端 + 后端

# 测试
make test                              # 全部 Go 测试
go test ./internal/service/...         # 单个包
go test ./internal/service/ -run TestX # 单个测试函数

# Docker
docker compose up -d --build
./docker-build.sh --compose -d         # 智能构建（自动检测中国区镜像加速）
```

## 架构

**后端** (`Go 1.21`, `chi` 路由, `modernc.org/sqlite` 纯 Go SQLite):

- `main.go` — 入口：解析 `--admin-pass` 并 bcrypt 哈希（不写磁盘）、加载配置、初始化 DB、注册路由、嵌入前端静态资源
- `internal/api/` — JSON API 处理器
  - `response.go` — 统一响应：`Success(w, data)` / `Error(w, code, msg)` / `JSON(w, code, data)`
  - `public.go` — 前台 API（日历、活动详情、报名、离队、战绩查询、用户登录/登出/me）
  - `admin.go` — 后台 API（活动 CRUD、用户管理、战绩排名刷新、CSV 导出）
  - `helpers.go` — 公用辅助函数
- `internal/service/` — 业务逻辑
  - `queue.go` — 排队算法：`Register()`（事务内分配队伍槽位或入候补）、`LeaveByUser()`（离队 + 候补递补 `cancelAndPromote`）、每队固定 4 人
  - `user.go` — 用户注册/登录/密码验证
  - `pubg.go` — PUBG API 集成（赛季数据、对局查询、战绩排名计算）
- `internal/middleware/` — 认证与安全
  - `auth.go` — Session 认证（cookie `session_id`，存 SQLite `sessions` 表，7 天 TTL）、`AuthMiddleware`（区分 admin API 401 vs 页面重定向）、`BanManager`（持久化 IP/手机号封禁，5 次失败封 24 小时）
- `internal/model/` — 数据模型（`event.go`, `registration.go`, `user.go`）
- `internal/db/schema.go` — SQLite 自动迁移：启动时执行 `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN`（忽略"列已存在"错误），支持旧库平滑升级
- `internal/config/` — 环境变量配置加载

**前端** (`React 19`, `TypeScript`, `Ant Design 6`, `React Router v7`, `Vite 8`):

- `frontend/src/pages/` — 页面组件：`CalendarPage`, `EventDetailPage`, `StatsPage`, `UserLoginPage`, `admin/`
- `frontend/src/api.ts` — 后端 API 接口定义
- `frontend/src/request.ts` — Axios HTTP 客户端
- `frontend/src/hooks/useUserMe.ts` — 用户认证 hook（调用 `/api/user/me`）
- 暗色主题配置集中在 `App.tsx` 的 `ConfigProvider` 中

**关键约定**:

- 活动以 `event_date`（日期字符串，如 `2025-01-15`）作为路由键，非数据库 ID
- 统一 API 响应格式：`{code, msg, data}`，通过 `api.Success()` / `api.Error()` 输出
- 中间件链（`main.go`）：Logger → Recoverer → SecurityHeaders → RateLimiter → Auth
- 前端 Vite 开发服务器代理 `/api` 到后端 `localhost:8080`（见 `vite.config.ts`）
- 管理 API 使用 `authMW.RequireAdminAPI` 中间件返回 401 JSON；前台用户认证通过 `middleware.GetUserSession()` 获取

## 开发约束

- 优先保持现有目录结构和代码风格，不做无关重构
- 修改代码时局部变更，避免调整无关文件
- 注释只解释代码行为，不复述需求
- commit message 使用简洁中文
- 不要在提交信息或代码署名中加入 AI、Claude、Anthropic 等相关标识
