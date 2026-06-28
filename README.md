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
- 📣 一键邀请：生成开黑邀请文案，优先使用 `navigator.clipboard`，降级为 `execCommand('copy')`；活动已结束后该按钮自动隐藏

### 🔒 用户账号体系
- 以手机号为唯一标识，首次登录/报名自动注册
- 专属前台登录页 `/login`，登录后全站 Session 保持（7天有效）
- 密码使用 bcrypt 存储，多次错误自动触发 24 小时封禁
- 每个页面右上角可随时查看登录状态，支持一键登出

### 🏆 战绩查询页
- **未登录访问会引导到登录页**，登录后自动返回 `/stats`
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

#### 📊 年度活动热力图
- 后台仪表盘顶部（列表上方）展示 53 周窗口的活动热力图，7 行 × 53 列，周一为一周起点
- 按当日报名人数分 5 档着色（0 / 1–4 / 5–8 / 9–12 / ≥13 人），金色阶梯保持品牌风格；今天的格子带金色描边
- hover 显示日期 / 报名数 / 状态文字说明，点击有活动的格子跳转该活动详情页
- 同时支持键盘（Tab/Enter/Space）、横向滚动与 `prefers-reduced-motion`

#### 🏆 战绩排名（v2 增强版）
- **活动并集口径**：以"同一比赛中至少有 2 个报名玩家出现"作为活动局判定，得到活动并集 `eventMatches`；同时给每个玩家保留个人出勤局数 `attendanceCount`，避免缺席被算成"打得差"
- **基础统计**：场次 / 出勤率 / 击杀 / 死亡 / 助攻 / DBNO / 爆头 / Top10 / K/D / KPG / ADR / 总生存时长
- **遥测衍生**：基于 telemetry 解析 `damageTaken / fireCount / makeGroggy / revive`，得到 `场均承伤 / 换血比 / 命中效`
- **4 项分数（队内 min-max 后做压缩归一化）**：先做队内相对归一化，再对结果做立方根压缩，降低 4 人小样本活动里"第一名 80、后面全是 30"这类断层
  - 战斗分：K/D 30% + ADR 25% + KPG 20% + DBNO/场 15% + 爆头/场 10%
  - 承压分：有效承伤 40% + 换血比 35% + 命中效 15% + 前排参与 10%（无遥测时退化为 ADR/K/D）
  - 团队分：助攻率 35% + 拉人率 30% + 击倒协同 20% + 击倒转化 15%
  - 生存分：场均生存 40% + Top10 率 30% + 死亡率反向 30%，再按输出参与度修正，避免纯苟分
  - 综合分 = 战斗 45% + 承压 25% + 团队 20% + 生存 10%
- **多标签 + 主称号 + 评价 + 置信度**：v2 现有 14 个风格标签（钢枪王 / 突破手 / 架枪位 / 稳健吃鸡 / 运营大师 / 医疗兵 / 补枪位 / 战地记者 / 伏地老六 / 怂 / 打不过 / 夕阳红枪法 / 盒子精 / 均衡型），由后端按固定绝对阈值生成，不再按队内均值发强标签；前端优先直接消费后端 `Tags` / `PrimaryTitle` / `Comment`，旧 v1 数据才 fallback 到本地兼容逻辑；置信度按个人出勤场次分 5 档（极低 / 低 / 中 / 高 / 很高），样本不足时禁止贴强标签
- **前后台统一折叠榜单**：战绩表改为紧凑展示，首行只显示玩家信息、核心指标和综合分，点击展开后再看承伤 / 换血 / 四项子分 / 置信度 / 评价等详细项
- **标签可点击查看解释**：战绩表中的风格标签均可点击弹出「含义 + 触发条件」说明，点击其他位置自动关闭
- **两阶段任务状态机**：刷新过程拆为 `match_fetching → basic_ready → telemetry_processing → full_ready / partial_ready`。基础榜单一就绪就先写库，前端立即显示，承伤 / 换血比 / 命中效随后回填；telemetry 部分失败时显示"部分样本缺失"提示
- **缓存**：`pubg_match_cache_v2` 缓存 match payload，`pubg_player_match_features_v2` 缓存玩家单局遥测特征，`pubg_player_lookup_cache` 缓存玩家 → accountId + 最近 matchIds（5 分钟 TTL），重复刷新可大量跳过受限流的 players 接口
- 已记录实际开始/结束时间后，对应"记录时间"按钮自动隐藏

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
│   │   ├── rankingTags.ts   # 战绩多标签解析与置信度文案
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
│   │   ├── ranking_jobs.go  # 战绩刷新任务状态机（多阶段）
│   │   └── helpers.go       # 公用辅助函数
│   ├── config/              # 环境配置
│   ├── db/                  # SQLite 打开与迁移
│   ├── handler/             # 旧版 HTML 处理器（已弃用，保留兼容）
│   ├── middleware/           # 认证、限流、安全头、封禁
│   ├── model/               # 数据模型
│   ├── service/             # 业务逻辑
│   │   ├── queue.go              # 报名 / 离队 / 候补递补
│   │   ├── user.go               # 用户注册 / 登录
│   │   ├── pubg.go               # PUBG API 客户端 + 活动战绩刷新
│   │   ├── pubg_analysis_v2.go   # match / telemetry 解析与缓存
│   │   ├── pubg_lookup_cache.go  # players → accountId 短期缓存
│   │   ├── pubg_ranking.go       # 4 项分数 + 多标签 + 主称号 + 评价 + 置信度
│   │   └── pubg_ranking_test.go  # 评分与标签单元测试
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

### 版本号

当前版本维护在 `VERSION`，当前值为 `1.2.1`。`make build`、`build.sh` 和 `docker-build.sh` 会把该版本注入二进制；`docker-build.sh` 会同时打出 `pubg-queue:1.2.1` 和 `pubg-queue:latest`。

### 更新日志

- **1.2.1** — 页面背景由 48px 网格纹理改为氛围径向光晕（顶部暖金 + 右上淡青 + 暗角），登录页同步，去除「一格一格」的网格观感。
- **1.2.0** — 战绩详情页彻底重构，提升可读性：
  - 队伍总览由「14 项指标分 3 组 + 独立贡献卡」合并为单卡（6 项关键指标 + 贡献占比条）。
  - 排名榜单由「每行 7 个指标卡片」精简为三列：名次 + 选手（含主指标行）+ 综合评分。
  - 展开详情以六维能力雷达为主，移除与折叠态重复的指标，新增进阶指标分组与轻量元信息脚注。
  - 收敛视觉：金色仅用于榜首评分、红色仅用于风险项，移除逐项信息图标与冗余标签。
- **1.1.0** — 战绩展示优化与版本管理。

## ⚙️ 环境变量

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `APP_VERSION` | `1.2.1` | 应用版本 / Docker 镜像标签 |
| `IMAGE_NAME` | `pubg-queue` | Docker 镜像名 |
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
| `/api/admin/events/{date}/refresh-rankings` | POST | 刷新战绩排名（异步） |
| `/api/admin/events/{date}/ranking-status` | GET | 战绩刷新任务状态（status / phase / 进度） |
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
- 每队固定 4 个位置，总容量为 `team_count × 4`（新建活动默认 1 队，可在表单中调整）
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

### 后台战绩排名刷新（v2 流水线）
- 整体流程：批量 players → 候选 matchIds → 并集判定 → match 详情 + telemetry → 压缩归一化 4 项分数 + 固定阈值多标签 → 两阶段写库
- **限流策略**：仅 `players` 接口受 10 req/min 限制，`/matches` 与 telemetry 不计入限流；首次刷新批与批之间间隔 6 秒，5 分钟内重复刷新通过 `pubg_player_lookup_cache` 直接复用，几乎零 players 调用
- **缓存层**：
  - `pubg_match_cache_v2`：缓存 match 元信息 + 完整 payload + telemetry URL
  - `pubg_player_match_features_v2`：缓存单局玩家的承伤、换血、开火、拉人特征
  - `pubg_player_lookup_cache`：5 分钟 TTL，缓存 `playerName → accountId + matchIds`
- **任务阶段**：基础聚合完成立刻写一次库（`analysis_status='basic_ready'`），前端先看到基础榜单；遥测全部跑完再写一次最终库（`full_ready` 或 `partial_ready`）。状态接口 `/admin/events/{date}/ranking-status` 返回 `phase` 字段供前端展示
- **数据范围**：默认基于活动 `actual_start ~ actual_end` 时间窗内的历史比赛（PUBG API 仅保留 14 天）
- **评分与标签口径**：综合分权重为战斗 45% / 承压 25% / 团队 20% / 生存 10%，且队内相对值会先做压缩归一化；标签按 ADR、K/D、KPG、承伤、换血比、拉人率等固定绝对阈值生成，避免弱队内相对领先被误判为高质量称号
- **结果展示**：前台活动页和后台详情页统一使用折叠式紧凑榜单，默认只展示核心指标，展开后查看详细分项、分析状态和评价
- **置信度**：按个人出勤场次（不是活动并集）分 5 档，1–2 局只显示数据不贴强标签

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
