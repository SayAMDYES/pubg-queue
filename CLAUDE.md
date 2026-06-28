# CLAUDE.md

本文件是仓库唯一的项目说明和协作约束来源。开始任何新增或修改前必须先读取本文件；后续如需更新项目说明、开发约束或协作规则，也只能修改本文件。

## 项目概述

PUBG 活动排队系统 — Go + React 全栈 Web 应用。日历视图、活动报名/候补/递补、用户账号（手机号登录）、管理后台、PUBG 战绩查询。前端 SPA 通过 `//go:embed frontend/dist/*` 嵌入 Go 二进制，部署为单文件。

## 常用命令

```bash
# 本地运行（需先构建前端）
cd frontend && npm ci && npm run build && cd ..
go run . --admin-pass "<密码>"

# 本地运行（仅后端，使用已有 frontend/dist）
go run . --admin-pass "<管理员密码>"

# 前端开发模式（热重载，代理 /api → localhost:8080）
cd frontend && npm run dev

# 构建
make build          # 仅后端（依赖 frontend/dist）
make build-all      # 前端 + 后端
go build -o pubg-queue .
./pubg-queue --version

# 测试
make test                              # 全部 Go 测试
go test ./...                          # 全部 Go 测试
go test ./internal/service/...         # 单个包
go test ./internal/service/ -run TestX # 单个测试函数

# Docker
docker compose up -d --build
./docker-build.sh --compose -d         # 智能构建（自动检测中国区镜像加速）
# Docker Compose 依赖 ADMIN_PASS、SESSION_SECRET、CSRF_SECRET 等环境变量
```

## 架构

**后端** (`Go 1.21`, `chi` 路由, `modernc.org/sqlite` 纯 Go SQLite):

- `main.go` — 入口：解析 `--admin-pass` 并 bcrypt 哈希（不写磁盘）、加载配置、初始化 DB、注册路由、嵌入前端静态资源
- `internal/tmpl/` — 旧版 HTML 模板目录
- `static/` — 静态资源目录
- `internal/api/` — JSON API 处理器
  - `response.go` — 统一响应：`Success(w, data)` / `Error(w, code, msg)` / `JSON(w, code, data)`
  - `public.go` — 前台 API（日历、活动详情、报名、离队、战绩查询、赛季列表、用户登录/登出/me）
  - `admin.go` — 后台 API（活动 CRUD、手动报名/移除、用户管理、游戏名管理、战绩排名刷新、CSV 导出）
  - `ranking_jobs.go` — 战绩刷新多阶段任务状态机（`match_fetching → basic_ready → telemetry_processing → full_ready / partial_ready / failed`）
  - `helpers.go` — 公用辅助函数
- `internal/service/` — 业务逻辑
  - `queue.go` — 排队算法：`Register()`（事务内分配队伍槽位或入候补）、`LeaveByUser()`（离队 + 候补递补 `cancelAndPromote`）、每队固定 4 人
  - `user.go` — 用户注册/登录/密码验证
  - `pubg.go` — PUBG API 客户端 + `RefreshEventRankings()`（拆分两阶段：basic 写库 → telemetry 写库），含 `RankEntry` / `RankTag` 类型与 `persistRankingsV2`
  - `pubg_analysis_v2.go` — match / telemetry 解析、`pubg_match_cache_v2`、`pubg_player_match_features_v2`
  - `pubg_lookup_cache.go` — `pubg_player_lookup_cache`（5 分钟 TTL，跳过受限流的 `/players` 接口）
  - `pubg_ranking.go` — `FinalizeRankings()` 入口：4 项分数（队内 min-max 归一化，按 §11 权重）+ 多标签 + 主称号 + 评价文案 + 置信度（`computeConfidence`）
  - `pubg_ranking_test.go` — 评分 / 标签 / 置信度 / 出勤偏低 / 主称号优先级单元测试
- `internal/handler/` — 旧版 HTML 处理器，已弃用，仅保留兼容路径
- `internal/middleware/` — 认证与安全
  - `auth.go` — Session 认证（cookie `session_id`，存 SQLite `sessions` 表，7 天 TTL）、`AuthMiddleware`（区分 admin API 401 vs 页面重定向）、`BanManager`（持久化 IP/手机号封禁，5 次失败封 24 小时）
- `internal/model/` — 数据模型（`event.go`, `registration.go`, `user.go`）
- `internal/db/schema.go` — SQLite 自动迁移：启动时执行 `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN`（忽略"列已存在"错误），支持旧库平滑升级
- `internal/config/` — 环境变量配置加载
- `cmd/genhash/` — 历史密码哈希工具；当前主程序管理员密码以 `--admin-pass` 明文参数启动后即时哈希，不写磁盘

**前端** (`React 19`, `TypeScript`, `Ant Design 6`, `React Router v7`, `Vite 8`):

- `frontend/src/pages/` — 页面组件：`CalendarPage`, `EventDetailPage`, `StatsPage`, `UserLoginPage`, `admin/`
- `frontend/src/components/` — 共享组件：`CompactRankingTable`（前后台统一折叠榜单）、`EventHeatmap`（年度活动热力图）
- `frontend/src/api.ts` — 后端 API 接口定义；`RankEntry` / `RankTag` / `RankingPhase` / `RankingStatusData`
- `frontend/src/rankingTags.ts` — `resolveRankTags()` 优先消费后端 `Tags`；旧 v1 数据 fallback 到本地 `fallbackComputeTags`；`confidenceLabel` / `analysisStatusLabel` / `tagInfo` 文案表
- `frontend/src/request.ts` — Axios HTTP 客户端
- `frontend/src/hooks/useUserMe.ts` — 用户认证 hook（调用 `/api/user/me`）
- 暗色主题配置集中在 `App.tsx` 的 `ConfigProvider` 中

**关键约定**:

- 活动以 `event_date`（日期字符串，如 `2025-01-15`）作为路由键，非数据库 ID
- 统一 API 响应格式：`{code, msg, data}`，通过 `api.Success()` / `api.Error()` 输出
- 中间件链（`main.go`）：Logger → Recoverer → SecurityHeaders → RateLimiter → Auth
- 前端 Vite 开发服务器代理 `/api` 到后端 `localhost:8080`（见 `vite.config.ts`）
- 应用版本维护在根目录 `VERSION`；构建脚本会注入到二进制，Docker 构建脚本会使用该版本打镜像 tag
- 管理 API 使用 `authMW.RequireAdminAPI` 中间件返回 401 JSON；前台用户认证通过 `middleware.GetUserSession()` 获取
- 每队固定 4 个位置，超出容量后进入候补，离队时会按报名顺序自动递补
- 当前前台报名和离队依赖手机号 + 密码账号体系，并保留旧版 token 离队接口用于兼容
- 若配置 `PUBG_API_KEY`，后台可异步刷新活动成员战绩排名

## 开发约束

- 优先保持现有目录结构和代码风格，不做无关重构
- 理解变更原因和现有实现后再修改，不要直接动手改代码
- 修改代码时局部变更，避免调整无关文件
- 只修改明确指定的部分，不要自行修改无关代码
- 注释只解释代码行为，不复述需求
- 所有代码署名、`@author` 标签和文件头作者信息都必须使用 `Quasar`，不得使用 AI 相关署名
- 优先导入类并使用短类名；仅在命名冲突时使用完全限定类名
- 以降低复杂度为主要目标，没有现有复用场景时不要引入额外抽象或包装层
- 未被要求构建项目时，根据改动范围判断是否需要构建；100 行以内的小改动不要默认跑构建
- commit message 使用简洁中文
- 不要在提交信息或代码署名中加入 AI 或自动生成内容等相关标识
- 不要在 Git commit message 中添加 `Co-Authored-By` 行

## RTK 使用

Native Windows 环境中已安装 RTK。运行可能产生大量输出的命令时，优先使用 RTK 包装器减少上下文占用。

- Git：`rtk git status`、`rtk git diff`、`rtk git log -n 20`
- 文件和搜索：`rtk ls`、`rtk tree`、`rtk find`、`rtk grep <pattern> .`、`rtk read <file>`、`rtk diff`、`rtk wc`
- 错误和摘要：`rtk err <command>`、`rtk test <command>`、`rtk summary <command>`、`rtk smart <command>`
- Go：`rtk go`、`rtk golangci-lint`
- 前端：`rtk npm <args>`、`rtk npx <args>`、`rtk pnpm <args>`、`rtk tsc`、`rtk lint`、`rtk prettier`、`rtk format`、`rtk playwright`

不要在需要原始完整输出时使用 RTK；如果 RTK 隐藏了必要细节，直接重新运行原始命令。Native Windows 下透明 rewrite hook 不一定覆盖所有 shell 命令，因此需要显式调用 `rtk ...`。
