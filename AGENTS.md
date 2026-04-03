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
- `internal/handler`：HTTP 处理器，包含日历页、活动页、离队、管理后台等逻辑。
- `internal/service`：业务逻辑，包括报名排队、用户账号、PUBG API 集成。
- `internal/middleware`：认证、限流、安全头和封禁逻辑。
- `internal/model`：数据模型定义。
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
