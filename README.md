# PUBG Queue

一个基于 Go + SQLite 的 PUBG 活动排队系统，提供日历视图、报名候补、手机号账号登录、离队递补、管理后台和可选的 PUBG 战绩排名。

## 功能概览

- 日历首页按月展示活动日期、开始时间、是否开放、已报人数和容量。
- 玩家通过手机号 + 密码登录或自动注册后报名，支持记住最近使用的游戏昵称。
- 每个活动按 `队伍数 x 4` 计算容量，超出后自动进入候补队列。
- 已报名玩家可以通过手机号 + 密码离队，系统会自动递补最早进入候补的玩家。
- 兼容旧版离队 token 接口，便于迁移历史数据。
- 管理后台支持活动创建、编辑、开关、清空报名、查看完整手机号、导出 CSV。
- 配置 `PUBG_API_KEY` 后，后台可异步刷新活动成员战绩，生成战神/战犯排名。
- 内置限流、CSRF、防爆破封禁和基础安全响应头。

## 技术栈

- Go 1.21
- [chi](https://github.com/go-chi/chi)
- SQLite（`modernc.org/sqlite`）
- `gorilla/csrf`
- `bcrypt`

## 项目结构

```text
.
├── cmd/genhash              # 历史密码哈希工具
├── internal
│   ├── config               # 环境配置
│   ├── db                   # SQLite 打开与迁移
│   ├── handler              # HTTP 处理器
│   ├── middleware           # 认证、限流、安全头、封禁
│   ├── model                # 数据模型
│   ├── service              # 报名、用户、PUBG API 等业务逻辑
│   └── tmpl                 # HTML 模板
├── static                   # 静态资源
├── data                     # 默认数据库目录
├── main.go                  # 程序入口
└── docker-compose.yml
```

## 运行要求

- Go 1.21+
- Windows、Linux 均可运行
- 首次启动会自动创建 SQLite 数据库并执行迁移

## 本地运行

1. 配置环境变量，可以参考 `.env.example`
2. 使用明文管理员密码启动服务：

```bash
go run . --admin-pass "your-admin-password"
```

默认监听 `http://localhost:8080`。

## 环境变量

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 服务监听端口 |
| `DB_PATH` | `./data/pubg_queue.db` | SQLite 数据库文件路径 |
| `SESSION_SECRET` | 示例值 | Session 密钥，生产环境应替换 |
| `CSRF_SECRET` | 示例值 | CSRF 密钥，生产环境应替换 |
| `TZ` | `Asia/Shanghai` | 时区 |
| `ALLOW_DUPLICATE_NAME` | `false` | 是否允许同活动中同名报名 |
| `RATE_LIMIT_REGISTER` | `5` | 报名接口限流阈值 |
| `RATE_LIMIT_LEAVE` | `5` | 离队接口限流阈值 |
| `SECURE_COOKIE` | `false` | 是否启用 HTTPS Cookie |
| `PUBG_API_KEY` | 空 | PUBG Developer API Key，可选 |
| `PUBG_SHARD` | `steam` | PUBG 平台分区，可选 |

说明：

- 管理员用户名固定为 `admin`。
- 管理员密码不从环境变量读取，而是在启动时通过 `--admin-pass` 参数传入，并在进程内即时哈希。
- `.env.example` 中的 `ADMIN_PASS` 主要用于 Docker Compose 传参。

## Docker Compose

项目自带 `docker-compose.yml`，启动前请准备环境变量：

```bash
ADMIN_PASS=your-admin-password
SESSION_SECRET=replace-with-random-string
CSRF_SECRET=replace-with-another-random-string
docker compose up -d --build
```

容器启动命令等价于：

```bash
./pubg-queue --admin-pass "${ADMIN_PASS}"
```

数据库会持久化到宿主机 `./data` 目录。

## 主要路由

### 前台

- `GET /`：日历首页
- `GET /date/{date}`：活动详情页
- `POST /date/{date}/register`：报名
- `POST /date/{date}/leave`：按手机号 + 密码离队
- `POST /leave`：旧版 token 离队接口

### 后台

- `GET /admin/login`：管理员登录页
- `POST /admin/login`：管理员登录
- `GET /admin`：活动列表
- `GET /admin/events/{date}`：活动报名详情
- `GET /admin/events/new`：新建活动页
- `POST /admin/events`：创建或按日期覆盖活动
- `GET /admin/events/{date}/edit`：编辑活动页
- `POST /admin/events/{date}`：更新活动
- `POST /admin/events/{date}/toggle`：开关报名
- `POST /admin/events/{date}/clear`：清空活动报名
- `GET /admin/events/{date}/export`：导出报名 CSV
- `POST /admin/events/{date}/refresh-rankings`：刷新 PUBG 战绩排名

## 业务规则

- 活动唯一键是 `event_date`，前后台路由都基于日期。
- 每队固定 4 个位置，总容量为 `team_count * 4`。
- 活动未关闭且未满员时，报名状态为 `assigned`；满员后为 `waitlist`。
- 已分配席位的玩家离队时，会按报名时间顺序递补候补队列首位。
- 用户账号以手机号为唯一标识，密码使用 `bcrypt` 存储。
- 登录失败会记录 IP 和手机号，多次失败后触发 24 小时封禁。

## PUBG 排名说明

配置 `PUBG_API_KEY` 后，管理后台活动详情页可触发战绩刷新：

- 使用 PUBG Developer API 按游戏名查询玩家赛季数据
- 汇总 `squad-fpp`、`squad`、`duo-fpp`、`duo`、`solo-fpp`、`solo`
- 评分公式为：`kills * 10 + avgDamage * 0.5 + assists * 2`
- 第 1 名标记为“战神”，最后 1 名标记为“战犯”
- 为适配免费额度，请求之间会主动等待 6 秒

## 开发命令

```bash
go build -o pubg-queue .
go test ./...
go run . --admin-pass "your-admin-password"
```

如果需要整理依赖：

```bash
go mod tidy
```
