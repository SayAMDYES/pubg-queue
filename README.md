# 🐔 趴布鸡排队

基于 Go + React + Ant Design 的 PUBG 活动排队系统，前后端分离架构，提供日历视图、报名候补、手机号账号登录、离队递补、管理后台、战绩排名和一键邀请。

## ✨ 功能概览

### 📅 日历首页
- 按月展示所有活动日期，高亮今日
- 每个活动显示：开始时间、报名状态（开放 / 满员 / 已关闭）、已报 / 总容量
- 右上角展示当前登录状态，支持一键登出

### 🎮 活动详情页
- 队伍分组以表格形式清晰展示：位置 / 游戏名 / 手机号（脱敏）
- 若配置了 PUBG API Key，自动展示每位玩家的赛季总场次和 KD/A；点击槽位名称或战绩 Tag 可弹出详细战绩面板
- 候补名单按报名顺序以表格列出
- **已登录且已报名**：隐藏报名表单，在队伍槽位旁直接显示"离队"按钮（assigned 状态）；候补状态在候补名单区域显示离队入口
- **截止判断**：活动已开始（当前时间 ≥ `eventDate + startTime`）后，自动隐藏所有报名/离队操作
- **报名表单（需登录）**：
  - 已登录：仅需填写游戏昵称，支持历史昵称下拉；手机号来自账号，无需重复输入
  - 未登录：显示登录入口，跳转登录后自动回到活动页
- **离队**：
  - 已登录（assigned）：槽位旁内联 Popconfirm 一键确认离队
  - 已登录（waitlist）：候补区域显示离队卡片
  - 未登录：手机号 + 密码离队（向后兼容）
- 📣 一键邀请：生成开黑邀请文案，优先使用 `navigator.clipboard`，降级为 `execCommand('copy')`

### 🔒 用户账号体系
- 以手机号为唯一标识，首次登录/报名自动注册
- 专属前台登录页 `/login`，登录后全站 Session 保持（7天有效）
- 密码使用 bcrypt 存储，多次错误自动触发 24 小时封禁
- 每个页面右上角可随时查看登录状态，支持一键登出

### 🏆 战绩查询页
- 输入任意 PUBG 游戏名查询赛季总览和近期对局
- **搜索历史**：浏览器本地保存最近 10 条搜索记录，下次输入时自动提示，点击即可填入
- **已登录时**：自动展示账号绑定的游戏 ID 快捷选择，点击即可填入搜索框
- 支持逐场加载详细对局数据，加载进度实时以进度条呈现
- 近期对局列表展示：排名、模式/地图（含中文翻译）、对局日期及时长、击杀、击倒、助攻、伤害、生存时间
- 统计摘要（场均伤害、场均击杀）实时累计，随对局数据加载自动更新
- **赛季切换**：切换按钮位于统计数据卡片内，切换后仅刷新赛季统计数据，近 20 场对局记录保持不变
- 赛季名称显示为"第 N 赛季"格式，而非原始 API ID（如 `pc-2018-40`）
- 移动端近期对局列表支持横向滚动，不再撑宽整个页面

### 📱 移动端优化
- 所有表格（队伍名单、候补名单、近期对局）在移动端均支持横向滚动，内容不再撑宽页面
- 近期对局时间列精简为日期 + 开始时间 + 时长，节省横向空间

### 🛡️ 管理后台

#### 📋 活动管理
- 创建、编辑、开关、清空、删除活动
- 每场活动可设置：活动日期、队伍数量、预计开始/结束时间、实际开战/结束时间、备注
- **快速记录时间**：后台活动详情页提供"记录开始时间"和"记录结束时间"按钮，一键写入当前时间（Asia/Shanghai）；记录结束时间后自动触发战绩刷新
- **新建活动时**：日期选择器自动禁用过去的日期，防止误选
- 查看完整手机号报名名单，导出 CSV
- 报名记录状态显示中文（已分配 / 候补 / 已取消）

#### 👤 账号管理
- 查看所有已注册用户：手机号、历史游戏名、报名次数、注册时间（均格式化为 `yyyy-MM-dd HH:mm:ss`）
- 编辑用户手机号（同步更新关联报名记录）
- **重命名游戏名**：点击铅笔图标可就地编辑游戏名，保存时同步更新该用户所有历史报名记录中的昵称
- 删除 / 添加用户历史游戏名
- 重置用户密码
- 查看用户报名历史

#### 🏆 战绩排名
- 若已配置实际开战/结束时间，刷新时精确查询该时段内的所有场次
- 未配置实际时间时，回退为赛季总数据统计
- 统计指标：场次 / 击杀 / 死亡 / 助攻 / KD/A / 场均伤害
- 综合评分公式：`KDA × 15 + 场均伤害 × 0.05`
- 多档称号：🔥 战神 / ⚔️ 精锐 / 🛡️ 骨干 / 🐣 菜鸟 / 💀 战犯 / 👻 缺席

## 🔧 技术栈

### 后端
- **Go 1.21**
- [chi](https://github.com/go-chi/chi) — HTTP 路由
- **SQLite**（`modernc.org/sqlite`）— 嵌入式数据库
- `bcrypt` — 密码哈希
- RESTful JSON API

### 前端
- **React 19** + **TypeScript**
- **Ant Design 5** — UI 组件库
- **React Router v7** — 前端路由
- **Vite** — 构建工具
- **Axios** — HTTP 客户端

## 📁 项目结构

```text
.
├── frontend/                # React + AntD 前端 SPA
│   ├── src/
│   │   ├── hooks/           # 通用 React Hook
│   │   │   └── useUserMe.ts # 当前登录用户信息 Hook
│   │   ├── pages/           # 页面组件
│   │   │   ├── CalendarPage.tsx
│   │   │   ├── EventDetailPage.tsx
│   │   │   ├── StatsPage.tsx
│   │   │   ├── UserLoginPage.tsx   # 前台用户登录/注册
│   │   │   └── admin/       # 管理后台页面
│   │   ├── api.ts           # API 接口定义
│   │   ├── request.ts       # Axios 封装
│   │   ├── App.tsx          # 路由入口
│   │   └── main.tsx         # 应用入口
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── internal/
│   ├── api/                 # JSON API 处理器
│   │   ├── response.go      # 统一响应结构
│   │   ├── public.go        # 公共 API（日历、活动、报名、离队、用户登录）
│   │   ├── admin.go         # 管理 API
│   │   └── helpers.go       # 公用辅助函数
│   ├── config/              # 环境配置
│   ├── db/                  # SQLite 打开与迁移
│   ├── handler/             # 旧版 HTML 处理器（已弃用，保留兼容）
│   ├── middleware/           # 认证、限流、安全头、封禁
│   ├── model/               # 数据模型
│   ├── service/             # 业务逻辑（报名、用户、PUBG API）
│   └── tmpl/                # 旧版 HTML 模板（已弃用）
├── main.go                  # 程序入口（API 路由 + 嵌入前端）
├── Dockerfile               # 三阶段构建（Node → Go → Alpine）
├── docker-compose.yml       # 一键部署
├── Makefile                 # 构建命令
└── .env.example             # 环境变量模板
```

## 🚀 快速开始

### Docker Compose 一键部署（推荐）

1. 复制环境变量文件：
```bash
cp .env.example .env
```

2. 编辑 `.env`，设置 `ADMIN_PASS`、`SESSION_SECRET`、`CSRF_SECRET`：
```bash
vim .env
```

3. 启动服务：
```bash
docker compose up -d --build
```

> **中国大陆服务器**：`docker compose up -d` 默认使用官方 `proxy.golang.org`，在大陆可能超时。
> 有两种解决方式：
>
> **方式一（推荐）**：使用智能构建脚本，自动读取主机 `go env GOPROXY`、`npm config get registry`，并支持 vendor 模式完全跳过容器内下载：
> ```bash
> ./docker-build.sh --compose -d
> ```
>
> **方式二**：在 `.env` 中设置构建参数后再 `docker compose up -d --build`：
> ```env
> GOPROXY=https://goproxy.cn,https://goproxy.io,direct
> GONOSUMDB=*
> NPM_REGISTRY=https://registry.npmmirror.com
> ```

4. 访问 `http://localhost:8080`

**数据持久化**：数据库文件存储在宿主机 `./data/pubg_queue.db`，容器重建不会丢失数据。

### 本地开发

#### 后端
```bash
# 先构建前端（后端通过 embed 嵌入前端 dist）
cd frontend && npm ci && npm run build && cd ..

# 启动后端
go run . --admin-pass "your-admin-password"
```

#### 前端开发模式（带热更新）
```bash
# 终端 1：启动后端
go run . --admin-pass "your-admin-password"

# 终端 2：启动前端开发服务器（自动代理 /api 到 localhost:8080）
cd frontend && npm run dev
```

前端开发服务器默认运行在 `http://localhost:5173`，API 请求自动代理到后端。

### 完整构建
```bash
make build-all
./pubg-queue --admin-pass "your-admin-password"
```

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

## 🗺️ API 路由

### 公共 API

| 路由 | 方法 | 说明 |
| --- | --- | --- |
| `/api/calendar?month=YYYY-MM` | GET | 月历数据 |
| `/api/events/{date}` | GET | 活动详情（含当前登录用户信息） |
| `/api/events/{date}/register` | POST | 报名（需登录 session） |
| `/api/events/{date}/leave` | POST | 离队（session 或手机号+密码） |
| `/api/leave` | POST | 旧版 token 离队（向后兼容） |
| `/api/stats/player/{name}` | GET | 查询玩家战绩 |
| `/api/stats/match/{matchId}` | GET | 查询单场比赛详情 |

### 用户账号 API

| 路由 | 方法 | 说明 |
| --- | --- | --- |
| `/api/user/login` | POST | 用户登录（首次自动注册） |
| `/api/user/logout` | POST | 用户登出 |
| `/api/user/me` | GET | 查询当前登录用户信息（手机号、游戏名列表） |

### 管理 API（需 admin session）

| 路由 | 方法 | 说明 |
| --- | --- | --- |
| `/api/admin/login` | POST | 管理员登录 |
| `/api/admin/logout` | POST | 管理员登出 |
| `/api/admin/check` | GET | 检查登录状态 |
| `/api/admin/events` | GET | 活动列表 |
| `/api/admin/events` | POST | 创建活动 |
| `/api/admin/events/{date}` | GET | 活动详情 |
| `/api/admin/events/{date}` | PUT | 更新活动 |
| `/api/admin/events/{date}` | DELETE | 删除活动 |
| `/api/admin/events/{date}/toggle` | POST | 开关报名 |
| `/api/admin/events/{date}/clear` | POST | 清空报名 |
| `/api/admin/events/{date}/start` | POST | 记录活动开始时间（当前时间） |
| `/api/admin/events/{date}/end` | POST | 记录活动结束时间（当前时间，并自动触发战绩刷新） |
| `/api/admin/events/{date}/refresh-rankings` | POST | 刷新战绩排名 |
| `/api/admin/events/{date}/export` | GET | 导出 CSV |
| `/api/admin/users` | GET | 用户列表 |
| `/api/admin/users/{id}` | GET | 用户详情 |
| `/api/admin/users/{id}` | PUT | 更新用户 |
| `/api/admin/users/{id}` | DELETE | 删除用户 |
| `/api/admin/users/{id}/reset-password` | POST | 重置密码 |

### 前端路由（SPA）

| 路由 | 说明 |
| --- | --- |
| `/` | 日历首页 |
| `/date/{date}` | 活动详情页 |
| `/login` | 用户登录 / 注册 |
| `/stats` | 战绩查询页 |
| `/admin/login` | 管理员登录 |
| `/admin` | 管理后台仪表盘 |
| `/admin/events/new` | 新建活动 |
| `/admin/events/{date}` | 活动管理详情 |
| `/admin/events/{date}/edit` | 编辑活动 |
| `/admin/users` | 账号管理 |
| `/admin/users/{id}/edit` | 编辑用户 |

## 📏 业务规则

- 活动唯一键是 `event_date`，前后台路由均基于日期
- 每队固定 4 个位置，总容量为 `team_count × 4`
- 满员后报名进入候补，离队时自动按报名时间递补
- 同一手机号在同一活动中只能报名一次
- **报名必须先登录**（通过 `/login` 页面或之前的报名/离队操作自动获得 session）
- 未登录用户可通过手机号+密码方式离队（向后兼容）
- 登录失败记录 IP 和手机号，连续失败后触发 24 小时封禁

## 🎯 PUBG 战绩说明

配置 `PUBG_API_KEY` 后启用两项功能：

### 报名时自动缓存战绩（前台展示）
- 玩家报名后异步查询其 PUBG 账号赛季数据，缓存总场次与 KD/A
- 活动页面自动展示，找不到账号时显示灰色提示

### 后台战绩排名刷新
- 若活动配置了实际开战时间和实际结束时间，按该时段内的历史场次统计
- 否则使用赛季总数据回退
- 评分：`KDA × 15 + 场均伤害 × 0.05`（KDA = (击杀+助攻) / max(死亡, 1)）
- 为适配免费限速（10 req/min），请求之间自动等待 6 秒

## 🔄 数据迁移

系统使用 SQLite 数据库，文件路径由 `DB_PATH` 环境变量控制（默认 `./data/pubg_queue.db`）。

- **升级部署**：Docker Compose 挂载 `./data` 目录，数据库文件在容器重建时不会丢失
- **备份**：只需备份 `data/pubg_queue.db` 文件即可
- **迁移**：将旧版数据库文件复制到新部署的 `data/` 目录下，启动后自动完成 schema 迁移

## 🛠️ 开发命令

```bash
# 完整构建
make build-all

# 仅构建前端
make frontend

# 仅构建后端（需先构建前端）
make build

# 运行测试
make test

# 启动
./pubg-queue --admin-pass "your-admin-password"
```
