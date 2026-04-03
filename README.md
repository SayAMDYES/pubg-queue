# 🐔 趴布鸡排队

一个基于 Go + SQLite 的 PUBG 活动排队系统，提供日历视图、报名候补、手机号账号登录、离队递补、管理后台、战绩排名和一键邀请。

## ✨ 功能概览

### 📅 日历首页
- 按月展示所有活动日期，高亮今日
- 每个活动显示：开始时间、报名状态（开放 / 满员 / 已关闭）、已报 / 总容量

### 🎮 活动详情页
- 队伍分组以**表格形式**清晰展示：位置 / 游戏名 / 手机号（脱敏）
- 若配置了 PUBG API Key，自动展示每位玩家的**赛季总场次**和 **KD/A**，查不到账号时显示灰色提示
- 候补名单按报名顺序以表格列出
- 报名表单：手机号 + 密码（首次自动注册）+ 游戏昵称，支持历史昵称下拉
- 离队表单：手机号 + 密码一键退出，系统自动递补候补首位
- 📣 **一键邀请**：生成小红书风格的开黑邀请文案，一键复制到剪贴板，直达当日报名链接

### 🔒 用户账号体系
- 以手机号为唯一标识，首次报名自动注册
- 密码使用 bcrypt 存储，多次错误自动触发 24 小时封禁
- Session 登录状态保持，再次打开页面无需重新输入手机号

### 🛡️ 管理后台

#### 📋 活动管理
- 创建、编辑、开关、清空活动
- 每场活动可设置：活动日期、队伍数量、预计开始 / 结束时间、**实际开战时间 / 结束时间**（用于战绩精确查询）、备注
- 查看完整手机号报名名单，导出 CSV

#### 👤 账号管理（新功能）
- 查看所有已注册用户：手机号、历史游戏名、报名次数、注册时间
- 编辑用户手机号（同步更新关联报名记录）
- 删除 / 添加用户历史游戏名

#### 🏆 战绩排名（全新重构）
- 若已配置实际开战 / 结束时间，刷新时精确查询该**时段内**的所有场次
- 未配置实际时间时，回退为赛季总数据统计
- 统计指标：场次 / 击杀 / 死亡 / 助攻 / **KD/A** / 场均伤害
- 综合评分公式：`KDA × 15 + 场均伤害 × 0.05`
- 多档称号：🔥 战神 / ⚔️ 精锐 / 🛡️ 骨干 / 🐣 菜鸟 / 💀 战犯 / 👻 缺席
- 异步刷新，不阻塞页面，完成后刷新即可查看

## 🔧 技术栈

- **Go 1.21**
- [chi](https://github.com/go-chi/chi) — HTTP 路由
- **SQLite**（`modernc.org/sqlite`）— 嵌入式数据库
- `gorilla/csrf` — CSRF 防护
- `bcrypt` — 密码哈希

## 📁 项目结构

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
├── static                   # 静态资源（CSS）
├── data                     # 默认数据库目录
├── main.go                  # 程序入口
└── docker-compose.yml
```

## 🚀 本地运行

1. 配置环境变量（参考下方表格）
2. 使用明文管理员密码启动：

```bash
go run . --admin-pass "your-admin-password"
```

默认监听 `http://localhost:8080`。

## ⚙️ 环境变量

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 服务监听端口 |
| `DB_PATH` | `./data/pubg_queue.db` | SQLite 数据库文件路径 |
| `SESSION_SECRET` | 示例值 | Session 密钥，生产环境应替换 |
| `CSRF_SECRET` | 示例值 | CSRF 密钥，生产环境应替换 |
| `TZ` | `Asia/Shanghai` | 时区 |
| `ALLOW_DUPLICATE_NAME` | `false` | 是否允许同活动同名报名 |
| `RATE_LIMIT_REGISTER` | `5` | 报名接口限流阈值 |
| `RATE_LIMIT_LEAVE` | `5` | 离队接口限流阈值 |
| `SECURE_COOKIE` | `false` | 是否启用 HTTPS Cookie |
| `PUBG_API_KEY` | 空 | PUBG Developer API Key（可选） |
| `PUBG_SHARD` | `steam` | PUBG 平台分区（可选） |

> **说明**：管理员用户名固定为 `admin`，密码通过 `--admin-pass` 参数传入并在进程内即时哈希，不写磁盘。

## 🐳 Docker Compose

```bash
ADMIN_PASS=your-admin-password \
SESSION_SECRET=replace-with-random-string \
CSRF_SECRET=replace-with-another-random-string \
docker compose up -d --build
```

数据库持久化到宿主机 `./data` 目录。

## 🗺️ 主要路由

### 前台

| 路由 | 说明 |
| --- | --- |
| `GET /` | 日历首页 |
| `GET /date/{date}` | 活动详情页 |
| `POST /date/{date}/register` | 报名 |
| `POST /date/{date}/leave` | 手机号 + 密码离队 |
| `POST /leave` | 旧版 token 离队（向后兼容） |

### 后台

| 路由 | 说明 |
| --- | --- |
| `GET /admin` | 活动列表 |
| `GET /admin/events/{date}` | 活动报名详情 |
| `GET /admin/events/new` | 新建活动 |
| `POST /admin/events` | 创建活动 |
| `GET /admin/events/{date}/edit` | 编辑活动 |
| `POST /admin/events/{date}` | 更新活动 |
| `POST /admin/events/{date}/toggle` | 开关报名 |
| `POST /admin/events/{date}/clear` | 清空报名 |
| `GET /admin/events/{date}/export` | 导出 CSV |
| `POST /admin/events/{date}/refresh-rankings` | 刷新战绩排名 |
| `GET /admin/users` | 用户列表 |
| `GET /admin/users/{id}/edit` | 编辑用户 |
| `POST /admin/users/{id}` | 保存用户修改 |

## 📏 业务规则

- 活动唯一键是 `event_date`，前后台路由均基于日期
- 每队固定 4 个位置，总容量为 `team_count × 4`
- 满员后报名进入候补，离队时自动按报名时间递补
- 同一手机号在同一活动中只能报名一次
- 登录失败记录 IP 和手机号，连续失败后触发 24 小时封禁

## 🎯 PUBG 战绩说明

配置 `PUBG_API_KEY` 后启用两项功能：

### 报名时自动缓存战绩（前台展示）
- 玩家报名后异步查询其 PUBG 账号赛季数据，缓存总场次与 KD/A
- 活动页面自动展示，找不到账号时显示灰色提示

### 后台战绩排名刷新
- 若活动配置了**实际开战时间**和**实际结束时间**，按该时段内的历史场次统计
- 否则使用赛季总数据回退
- 评分：`KDA × 15 + 场均伤害 × 0.05`（KDA = (击杀+助攻) / max(死亡, 1)）
- 为适配免费限速（10 req/min），请求之间自动等待 6 秒

## 🛠️ 开发命令

```bash
go build -o pubg-queue .
go test ./...
go run . --admin-pass "your-admin-password"
```
