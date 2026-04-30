# AGENTS.md

## 项目概览
- 这是一个基于 Go 的 PUBG 活动排队系统，提供日历首页、活动详情、报名、离队和管理后台。
- 启动入口是 `main.go`，HTTP 路由使用 `chi`，模板位于 `internal/tmpl`，静态资源位于 `static`。
- 数据存储使用 SQLite，自动迁移逻辑位于 `internal/db/schema.go`。

## 运行与验证
- 本地运行：`go run . --admin-pass "<管理员密码>"`
- 构建命令：`go build -o pubg-queue .`
- 测试命令：`go test ./...`
- Docker Compose 依赖 `ADMIN_PASS`、`SESSION_SECRET`、`CSRF_SECRET` 等环境变量。

## 代码结构
- `internal/api`：JSON API 处理器（前台 + 管理 + 战绩任务状态机 `ranking_jobs.go`）。
- `internal/handler`：旧版 HTML 处理器，已弃用，仅保留兼容路径。
- `internal/service`：业务逻辑。
  - `queue.go` / `user.go`：排队和用户。
  - `pubg.go`：PUBG API 客户端，`RefreshEventRankings` 拆分两阶段写库。
  - `pubg_analysis_v2.go`：match / telemetry 解析与缓存（`pubg_match_cache_v2`、`pubg_player_match_features_v2`）。
  - `pubg_lookup_cache.go`：玩家 → accountId 短期缓存（`pubg_player_lookup_cache`，5 分钟 TTL）。
  - `pubg_ranking.go` / `pubg_ranking_test.go`：4 项分数 + 多标签 + 主称号 + 评价 + 置信度。
- `internal/middleware`：认证、限流、安全头和封禁逻辑。
- `internal/model`：数据模型定义。
- `frontend/src/rankingTags.ts`：前端战绩多标签解析（优先后端 `Tags`，v1 旧数据 fallback 本地），并提供 `tagInfo` 字典（每个 tag 的含义 + 触发条件文案）。
- `frontend/src/components/CompactRankingTable.tsx`：紧凑战绩榜单，标签外层用 antd `Popover` 包裹，点击弹出含义/触发条件，点击其他位置自动关闭。
- `frontend/src/components/EventHeatmap.tsx`：后台首页年度活动热力图，53 周 × 7 天，按日报名数分 5 档着色。
- `cmd/genhash`：历史密码哈希工具，当前主程序管理员密码以 `--admin-pass` 明文参数启动后即时哈希。

## 开发约束
- 优先保持现有目录结构和代码风格，不做无关重构。
- 修改代码时尽量局部变更，避免顺手调整无关文件。
- 注释只解释代码行为，不复述需求。

## 业务注意点
- 活动以 `event_date` 作为主要路由键，前台路由为 `/date/{date}`，后台活动路由也基于日期。
- 每队固定 4 个位置，超出容量后进入候补，离队时会按报名顺序自动递补。
- 当前前台报名和离队依赖手机号 + 密码账号体系，并保留旧版 token 离队接口用于兼容。
- 若配置 `PUBG_API_KEY`，后台可异步刷新活动成员战绩排名。

## 提交要求
- commit message 使用简洁中文。
- 不要在提交信息或代码署名中加入 AI、Claude、Anthropic 等相关标识。
