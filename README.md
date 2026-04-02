# 趴布鸡排队 (pubg-queue)

PUBG 开黑排队报名系统。用户无需登录，通过日历查看排队安排并报名，管理员后台配置活动。

## 功能特性

- 📅 月历视图，颜色区分活动状态（可报名/满员/已关闭/历史）
- 👥 自动队伍分配（每队4人），满员后自动进入候补
- 📱 报名需填手机号，防止重复报名；公开页面展示脱敏手机号
- 🔑 6位数字离队码，简单易用
- ⏰ 活动可设置开始/结束时间
- 🔒 管理后台：创建活动、开关报名、查看报名详情（含完整手机号）、导出 CSV
- 🛡️ 安全：参数化查询、CSRF防护、限流、会话安全

## 快速启动

### 本地开发

```bash
# 编译
go build -o pubg-queue .

# 启动（必须指定管理员密码）
./pubg-queue --admin-pass 'yourpassword'

# 访问 http://localhost:8080
# 管理后台 http://localhost:8080/admin（用户名：admin）
```

### Docker Compose

```bash
# 复制环境变量文件
cp .env.example .env

# 编辑 .env，设置 ADMIN_PASS、SESSION_SECRET、CSRF_SECRET
vim .env

# 启动
docker-compose up -d
```

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | `8080` | 监听端口 |
| `DB_PATH` | `./data/pubg_queue.db` | SQLite 数据库路径 |
| `SESSION_SECRET` | *(弱默认值)* | Session 加密密钥（生产环境必须修改） |
| `CSRF_SECRET` | *(弱默认值)* | CSRF 令牌密钥（生产环境必须修改） |
| `TZ` | `Asia/Shanghai` | 时区 |
| `ALLOW_DUPLICATE_NAME` | `false` | 是否允许同名报名（手机号唯一性仍然强制） |
| `RATE_LIMIT_REGISTER` | `5` | 每IP每分钟最多报名次数 |
| `RATE_LIMIT_LEAVE` | `5` | 每IP每分钟最多离队次数 |
| `SECURE_COOKIE` | `false` | 是否强制 HTTPS Cookie（生产环境建议 true） |

**命令行参数：**

| 参数 | 说明 |
|------|------|
| `--admin-pass <密码>` | 管理员明文密码（必填，启动时哈希化，不写磁盘） |

## 路由

### 公开路由

| 路由 | 说明 |
|------|------|
| `GET /` | 日历首页，支持 `?month=2026-04` |
| `GET /date/{date}` | 活动详情页（date 格式：YYYY-MM-DD） |
| `POST /date/{date}/register` | 报名（name + phone 表单字段） |
| `POST /leave` | 离队（token 字段为6位离队码） |

### 管理路由（需登录）

| 路由 | 说明 |
|------|------|
| `GET /admin` | 活动列表 |
| `GET /admin/login` | 登录页 |
| `GET /admin/events/new` | 新建活动 |
| `POST /admin/events` | 创建活动（upsert by date） |
| `GET /admin/events/{date}/edit` | 编辑活动 |
| `POST /admin/events/{date}` | 更新活动 |
| `POST /admin/events/{date}/toggle` | 开关报名 |
| `POST /admin/events/{date}/clear` | 清空报名 |
| `GET /admin/events/{date}/export` | 导出 CSV |
| `GET /admin/events/{date}` | 查看报名详情（含完整手机号） |

## 离队码说明

报名成功后显示6位纯数字离队码（如 `123456`）。**仅显示一次，请截图保存**。

在活动详情页底部输入离队码即可离队，系统自动补位候补。

## 数据库备份

```bash
# SQLite 热备份（不需要停服）
sqlite3 data/pubg_queue.db ".backup data/backup_$(date +%Y%m%d).db"

# 或直接复制（服务停止时）
cp data/pubg_queue.db data/backup_$(date +%Y%m%d).db
```

## 技术栈

- Go 1.21 + `html/template`（SSR）
- `go-chi/chi` 路由
- `modernc.org/sqlite`（纯 Go SQLite，无 CGO）
- `gorilla/csrf` CSRF 防护
- `golang.org/x/crypto/bcrypt` 密码哈希
