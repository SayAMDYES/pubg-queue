# PUBG 队伍成员水平与风格评估设计方案

## 1. 设计目标

基于 PUBG 官方开放 API，对一个队伍内所有成员进行统一统计，输出类似排行榜的列表，用来判断每个人的：

1. 基础水平：击杀、死亡、助攻、K/D、场均击杀、场均伤害。
2. 战斗效率：造成伤害、承受伤害、换血比、命中效率。
3. 游戏风格：刚枪、稳健、怂、菜、架枪、突破、医疗兵、盒子精等。
4. 团队贡献：助攻、击倒、拉人、伤害占比、击杀参与。
5. 多标签画像：一个人不只一个称号，符合多个规则就打多个标签。

最终页面参考你给的截图，但字段增强为：

| 排名 | 称号/标签 | 游戏名 | 场次 | 击杀 | 死亡 | 助攻 | K/D | KPG | ADR | 承伤 | 换血比 | 命中效 | 生存 | 评价 |
| -- | ----- | --- | -: | -: | -: | -: | --: | --: | --: | -: | --: | --: | -: | -- |

---

## 2. 官方 API 约束说明

PUBG API 按平台分片，URL 里需要指定 `shards/{platform}`，例如 `steam`、`kakao`、`xbox`、`psn`。玩家接口返回的 player 对象中可以拿到最近 matchIds，后续再用 matchId 查询单局比赛。官方文档也说明，match 数据保留期是 14 天，超过 14 天的 match 数据不可用；赛季统计响应里的 matchIds 最多 32 场且只包含 14 天内比赛。([PUBG 文档][1])

PUBG API 默认开发限流是 10 requests/min，超过后返回 HTTP 429；但官方明确说明 `/matches` 和 telemetry endpoints 不受 API Key 限流影响，也不会计入应用的 API Key rate limit。([PUBG 文档][2])

Telemetry 数据需要先查询 match，再从 match 的 asset 对象里拿 telemetry 文件 URL，然后下载 gzip 压缩的 telemetry 事件文件；下载 telemetry 不需要 API Key。([PUBG 文档][3])

---

## 3. 输入参数设计

### 3.1 必填参数

| 参数          | 类型       | 说明                   |
| ----------- | -------- | -------------------- |
| `platform`  | string   | PUBG 平台分片，例如 `steam` |
| `playerIds` | string[] | 队伍成员 accountId 列表    |
| `startTime` | datetime | 统计开始时间               |
| `endTime`   | datetime | 统计结束时间               |

### 3.2 可选参数

| 参数                    | 类型       | 默认值  | 说明                            |
| --------------------- | -------- | ---- | ----------------------------- |
| `gameModes`           | string[] | 空    | 指定模式，例如 `squad-fpp`、`duo-fpp` |
| `enableTelemetry`     | boolean  | true | 是否启用战斗效率分析                    |
| `telemetryMaxMatches` | number   | 40   | 最多分析多少场 telemetry             |
| `matchWorkers`        | number   | 6    | match 并发查询 worker 数           |
| `telemetryWorkers`    | number   | 3    | telemetry 并发下载解析 worker 数     |
| `minMatches`          | number   | 3    | 少于该场次时提示样本不足                  |

### 3.3 结合当前仓库的输入现实

当前项目里，战绩刷新不是一个“任意传 `playerIds + startTime + endTime` 的通用分析接口”，而是围绕单个活动展开：

1. 已有触发入口：后台已经有刷新接口和异步任务状态查询。
2. 已有统计时间窗：活动表已经保存 `actual_start`、`actual_end`。
3. 已有玩家集合来源：报名表当前保存的是游戏名 `registrations.name`。
4. 已有平台配置：服务端已经通过 `PUBGShard` 统一指定默认分片。

因此这套方案在当前仓库里的第一版，建议把输入模型落到“活动维度”而不是“自由查询维度”：

| 设计稿字段 | 当前仓库里的 MVP 对应物 |
| ------- | ---------------- |
| `platform` | `config.PUBGShard` |
| `playerIds` | `registrations.name` 解析出的玩家集合 |
| `startTime` | `events.actual_start` |
| `endTime` | `events.actual_end` |

这样做的好处是可以直接复用现有的活动详情页、结束活动自动刷新、排行榜缓存表和后台刷新入口，先把“活动结束后自动生成增强榜单”做通。

需要明确的现实限制是：当前库里没有持久化 `accountId`，只有游戏名。因此：

1. 第一版可以继续按游戏名查玩家，成本最低。
2. 第二版建议补 `player_name -> account_id + platform` 映射缓存，解决改名和重复查玩家接口的问题。
3. 如果后续要支持“临时组队分析”“跨活动历史画像”，再开放通用查询输入，而不是一开始就把前台入口做成自由组合查询。

---

## 4. 接口使用方案

## 4.1 必用接口

### 4.1.1 玩家接口

用于批量获取队伍成员最近 matchIds。

| 项目    | 内容                                                 |
| ----- | -------------------------------------------------- |
| 接口    | `/shards/{platform}/players?filter[playerNames]=...` 或 `/shards/{platform}/players?filter[playerIds]=...` |
| 是否受限流 | 是                                                  |
| 调用频率  | 尽量少                                                |
| 优化方式  | 一次最多查 10 个玩家；当前仓库第一版先按 `playerNames` 批量查询，后续有 `accountId` 映射后再切到 `playerIds` |
| 缓存建议  | 5～10 分钟                                            |

官方建议 players 和 stats 的批量请求最多 10 个玩家，能批量时应尽量批量，以减少受限流请求数量。([PUBG 文档][1])

---

### 4.1.2 Match 接口

用于查询单局比赛详情，拿 participant stats 和 telemetry asset。

| 项目    | 内容                                           |
| ----- | -------------------------------------------- |
| 接口    | `/shards/{platform}/matches/{matchId}`       |
| 是否受限流 | 否                                            |
| 调用频率  | 可并发                                          |
| 主要用途  | 单局玩家基础数据、match 创建时间、gameMode、telemetry asset |
| 缓存建议  | 14 天或永久                                      |

Match 接口不计入 API Key 限流，可以并发查询，但仍建议控制并发，避免网络抖动和服务端连接异常。([PUBG 文档][2])

---

### 4.1.3 Telemetry 文件

用于分析承受伤害、换血比、命中效率、开火次数、首次接敌时间等。

| 项目             | 内容                          |
| -------------- | --------------------------- |
| 来源             | match included 中的 asset URL |
| 是否受 API Key 限流 | 否                           |
| 是否需要 API Key   | 否                           |
| 文件格式           | gzip 压缩 JSON                |
| 调用策略           | 只分析有效 match，2～4 个 worker 并发 |
| 缓存建议           | 原始文件可选缓存，解析后的玩家单局特征必须缓存     |

Telemetry 事件中包含 `LogPlayerAttack`、`LogPlayerTakeDamage`、`LogWeaponFireCount`、`LogPlayerMakeGroggy`、`LogPlayerKillV2`、`LogPlayerPosition`、`LogPlayerRevive` 等事件，可用于细化玩家行为分析。([PUBG 文档][4])

---

## 4.2 不推荐默认使用的接口

| 接口                    |  是否使用 | 原因                  |
| --------------------- | ----: | ------------------- |
| `/seasons/{seasonId}` | 不默认使用 | 适合查整个赛季，不适合自定义时间段   |
| `/ranked`             | 不默认使用 | 排位聚合数据，不返回 matchIds |
| `/samples`            |   不使用 | 随机样本，不是玩家个人战绩查询     |
| `/weapon_mastery`     |    可选 | 用于长期武器画像，不适合核心榜单    |
| `/survival_mastery`   |    可选 | 用于长期生存画像，不适合核心榜单    |

---

## 5. 数据处理流程

## 5.1 总流程

1. 接收 `platform + playerIds + startTime + endTime`。
2. 校验时间范围是否超过官方可查范围。
3. 批量调用 players 接口，获取所有玩家最近 matchIds。
4. 合并所有 matchIds，并去重。
5. 并发查询 `/matches/{matchId}`。
6. 根据 `match.attributes.createdAt` 过滤时间范围。
7. 根据 `gameMode` 过滤指定模式。
8. 从 match included 中解析目标玩家的 participant stats。
9. 汇总基础战绩：击杀、死亡、助攻、DBNO、伤害、生存、移动、拉人等。
10. 从有效 match 中提取 telemetry asset URL。
11. 使用 2～4 个 worker 并发下载和解析 telemetry。
12. 汇总增强指标：承受伤害、换血比、开火次数、命中效率、首次接敌时间。
13. 计算分数、标签、主称号、评价文案。
14. 返回榜单列表。

---

## 5.2 两阶段响应建议

为了页面体验，可以设计成两阶段。

### 阶段一：基础榜单

只依赖 `/players + /matches`。

返回字段：

| 字段   | 说明           |
| ---- | ------------ |
| 总局   | 活动并集总局数   |
| 出勤   | `attendanceCount / eventMatchCount` |
| 场次   | 如只展示一个场次列，默认显示出勤局数 |
| 击杀   | 总 kills      |
| 死亡   | 非 alive 结算次数 |
| 助攻   | assists      |
| DBNO | 击倒数          |
| K/D  | 击杀 / 死亡      |
| KPG  | 击杀 / 出勤局数      |
| ADR  | 总伤害 / 出勤局数     |
| 场均生存 | 总生存时长 / 出勤局数   |
| 基础标签 | 基于基础战绩生成的标签  |

### 阶段二：战斗效率榜单

增加 telemetry 分析。

回填字段：

| 字段     | 说明                       |
| ------ | ------------------------ |
| 承受伤害   | 作为 victim 承受的总伤害         |
| 场均承伤   | 承受伤害 / 出勤局数                |
| 换血比    | 造成伤害 / 承受伤害              |
| 开火次数   | telemetry 中统计的 fireCount |
| 命中效率   | 基于伤害事件和 fireCount 的近似值   |
| 首次接敌时间 | 第一次开火、造成伤害或承受伤害的时间       |
| 增强标签   | 刚枪、架枪、避战、菜、夕阳红枪法等        |

### 5.3 活动总场次并集与个人出勤模型

这里需要把两个概念拆开，否则“缺席”和“打得差”会被算成一回事。

#### 5.3.1 先定义活动总场次

对一个活动来说，总局数不应该按某个玩家个人的 `matchCount` 来看，而应该按活动内所有有效比赛的并集来定义：

| 字段 | 含义 |
| -- | -- |
| `eventMatchCount` | 本次活动确认打过的总局数，即所有有效比赛 `matchId` 的并集 |
| `attendanceCount` | 某个玩家实际参加了多少局 |
| `missedCount` | `eventMatchCount - attendanceCount` |
| `attendanceRate` | `attendanceCount / eventMatchCount` |

你的思路在这一步是对的：

1. 活动总局数应该是并集。
2. 每个玩家的单局数据，也应该只从这个并集里的比赛去取。
3. 没进入并集的比赛，不应该算进这次活动分析。

#### 5.3.2 但不能把所有指标都直接除以并集场次

如果把 ADR、KPG、K/D、命中效这类“能力指标”也全部拿 `eventMatchCount` 当分母，会把缺席直接算成菜。

例如：

1. 活动一共打了 8 局。
2. 某玩家只到场 4 局，打了 8 杀、600 伤害。
3. 如果除以并集，他的 KPG = 1.0、ADR = 75。
4. 如果除以出勤局，他的 KPG = 2.0、ADR = 150。

这两个口径表达的是两件不同的事：

1. 前者反映“对整场活动的总体贡献”。
2. 后者反映“人来了以后打得怎么样”。

所以推荐口径是：

| 指标类型 | 分母 |
| -- | -- |
| 活动总局、缺席局、出勤率 | `eventMatchCount` |
| K/D、KPG、ADR、DPM、命中效、换血比 | `attendanceCount` |
| 活动总贡献类指标 | 可同时保留总量值，不强制做场均 |

#### 5.3.3 怎样确认“并集里的比赛真的是这次活动”

这里需要比“时间范围内任意一个报名玩家打过的比赛”更严格，否则会把有人临时单排、双排、加塞的局也混进来。

推荐第一版规则：

1. 比赛时间落在 `actual_start ~ actual_end`。
2. 同一场 match 里，至少出现 2 个报名玩家，才默认视为活动局。
3. 如果后续活动内固定队伍关系维护得更细，可以升级为“同一 roster 中至少 2 个报名玩家”或更高阈值。
4. 只有 1 个报名玩家出现的 match，默认不纳入活动并集，或标记为低置信度候选局。

这样能避免一个人中途单排两把，把所有人都被动算成“缺席两局”。

#### 5.3.4 页面与评分如何体现

推荐把“出勤”和“能力”拆开展示：

| 展示项 | 建议口径 |
| -- | -- |
| 总局数 | `eventMatchCount` |
| 出勤 | `attendanceCount / eventMatchCount` |
| K/D、KPG、ADR | 按 `attendanceCount` 算 |
| 综合分 | 能力分 + 团队分 + 单独的出勤分 |

也就是说，缺席应该被单独惩罚，而不是偷偷塞进 ADR、KPG 这些能力指标里。

---

## 6. Go 后台并发设计

## 6.1 并发原则

Go 后台可以用 goroutine + worker pool 处理，但不要无限制开 goroutine。

虽然 `/matches` 和 telemetry 不计入 API Key 限流，但 telemetry 文件本身可能较大，瓶颈会转移到：

1. 网络下载。
2. gzip 解压。
3. JSON 解析。
4. CPU 占用。
5. 内存峰值。
6. 数据库写入。

因此建议：

| 任务             | 推荐 worker 数 | 说明                |
| -------------- | ----------: | ----------------- |
| players 查询     |           1 | 受 API Key 限流，尽量少调 |
| matches 查询     |         4～8 | 不计入限流，可适当并发       |
| telemetry 下载解析 |         2～4 | 文件较大，建议保守         |
| 数据聚合           |         1～2 | 内存内聚合，不需要太高并发     |

推荐默认配置：

| 配置项                      | 建议值 |
| ------------------------ | --: |
| `matchWorkers`           |   6 |
| `telemetryWorkers`       |   3 |
| `requestTimeoutSeconds`  |  10 |
| `analysisTimeoutSeconds` |  60 |
| `telemetryMaxMatches`    |  40 |

---

## 6.2 并发策略

### Match 查询

`/matches` 不计入 API Key 限流，可以并发查询。

建议策略：

1. matchId 去重。
2. 先查本地缓存。
3. 缓存未命中才请求 PUBG API。
4. 并发数控制在 4～8。
5. 单个请求设置超时。
6. 失败的 match 允许跳过，但要记录 warning。

### Telemetry 分析

Telemetry 不计入 API Key 限流，但不建议高并发。

建议策略：

1. 只对有效时间段内的 match 拉 telemetry。
2. 只对未缓存的 telemetry 特征进行解析。
3. worker 数控制在 2～4。
4. 下载后直接流式解压和解析，避免整文件长期驻留内存。
5. 解析结果落库为“玩家单局特征”。
6. 后续重复查询直接读特征表，不再重新解析 telemetry。

---

## 7. 缓存设计

| 缓存对象           | Key 示例                                      |     TTL | 说明               |
| -------------- | ------------------------------------------- | ------: | ---------------- |
| 玩家 matchIds    | `pubg:player_matches:{platform}:{playerId}` | 5～10 分钟 | 减少 players 接口调用  |
| match 明细       | `pubg:match:{platform}:{matchId}`           | 14 天或永久 | match 数据历史不变     |
| telemetry URL  | `pubg:telemetry_url:{matchId}`              | 14 天或永久 | 从 match asset 解析 |
| telemetry 原始文件 | `pubg:telemetry_raw:{matchId}`              |      可选 | 文件大，不一定保存        |
| 玩家单局特征         | `pubg:feature:{matchId}:{playerId}`         |      永久 | 强烈建议保存           |
| 队伍榜单结果         | `pubg:team_rank:{queryHash}`                |  1～5 分钟 | 防止重复计算           |

最重要的是保存“玩家单局特征”，不要每次都重新解析 telemetry。

---

## 8. 数据模型设计

## 8.1 玩家单局基础特征

| 字段                | 说明           | 来源                |
| ----------------- | ------------ | ----------------- |
| `matchId`         | 比赛 ID        | Match             |
| `playerId`        | 玩家 accountId | Participant       |
| `playerName`      | 游戏名          | Participant       |
| `createdAt`       | 比赛时间         | Match             |
| `gameMode`        | 游戏模式         | Match             |
| `mapName`         | 地图           | Match             |
| `winPlace`        | 排名           | Participant stats |
| `kills`           | 击杀           | Participant stats |
| `deaths`          | 是否死亡         | Participant stats |
| `assists`         | 助攻           | Participant stats |
| `dbnos`           | 击倒           | Participant stats |
| `damageDealt`     | 造成伤害         | Participant stats |
| `timeSurvived`    | 生存时长         | Participant stats |
| `walkDistance`    | 步行距离         | Participant stats |
| `rideDistance`    | 载具距离         | Participant stats |
| `swimDistance`    | 游泳距离         | Participant stats |
| `heals`           | 治疗次数         | Participant stats |
| `boosts`          | 能量物品使用       | Participant stats |
| `revives`         | 拉人次数         | Participant stats |
| `headshotKills`   | 爆头击杀         | Participant stats |
| `weaponsAcquired` | 捡枪数          | Participant stats |
| `deathType`       | 死亡类型         | Participant stats |

---

## 8.2 玩家单局 Telemetry 特征

| 字段                       | 说明                | 来源                                       |
| ------------------------ | ----------------- | ---------------------------------------- |
| `damageTaken`            | 承受伤害              | `LogPlayerTakeDamage` victim             |
| `damageDealtByTelemetry` | telemetry 统计的造成伤害 | `LogPlayerTakeDamage` attacker           |
| `tradeRatio`             | 换血比               | 造成伤害 / 承受伤害                              |
| `fireCount`              | 开火次数              | `LogWeaponFireCount`                     |
| `attackCount`            | 攻击事件次数            | `LogPlayerAttack`                        |
| `damageHitEvents`        | 有效伤害事件数           | `LogPlayerTakeDamage` attacker           |
| `damagePerFire`          | 每次开火伤害            | 造成伤害 / fireCount                         |
| `hitEventRate`           | 有效伤害事件率           | damageHitEvents / fireCount              |
| `firstAttackTime`        | 首次攻击时间            | `LogPlayerAttack`                        |
| `firstDamageDealtTime`   | 首次造成伤害时间          | `LogPlayerTakeDamage` attacker           |
| `firstDamageTakenTime`   | 首次承伤时间            | `LogPlayerTakeDamage` victim             |
| `makeGroggyCount`        | 击倒次数              | `LogPlayerMakeGroggy` attacker           |
| `reviveCountByTelemetry` | 拉人次数              | `LogPlayerRevive` reviver                |
| `grenadeDamage`          | 投掷物伤害             | `LogPlayerTakeDamage` damageCauserName   |
| `blueZoneDamageTaken`    | 蓝圈承伤              | `LogPlayerTakeDamage` damageTypeCategory |
| `vehicleDamageTaken`     | 载具相关承伤            | `LogPlayerTakeDamage` damageCauserName   |
| `closeRangeDamage`       | 近距离伤害             | damage distance 分段                       |
| `midRangeDamage`         | 中距离伤害             | damage distance 分段                       |
| `longRangeDamage`        | 远距离伤害             | damage distance 分段                       |

Telemetry 事件里的 `LogPlayerTakeDamage` 包含 attacker、victim、damage、damageReason、damageCauserName 等字段；`LogWeaponFireCount` 包含 weaponId 和 fireCount，且 fireCount 是按 10 递增，不是严格逐发子弹数。([PUBG 文档][4])

---

## 9. 命中率设计说明

PUBG 官方 Telemetry 不适合做严格意义上的“真实命中率”。

原因：

1. `LogWeaponFireCount.fireCount` 是按 10 递增。
2. 伤害事件不是逐发命中事件。
3. 投掷物、车辆、蓝圈、爆炸、穿墙等 damage 类型需要排除或分类。
4. 部分命中可能被护甲、倒地状态、队友伤害等影响。

因此页面上不建议直接叫“命中率”，建议叫：

| 展示名   | 英文字段            | 说明                 |
| ----- | --------------- | ------------------ |
| 命中效率  | `hitEfficiency` | 综合开火和伤害产出          |
| 有效命中率 | `hitEventRate`  | 有效伤害事件 / fireCount |
| 开火收益  | `damagePerFire` | 造成伤害 / fireCount   |

推荐前端展示“命中效”，而不是“命中率”。

---

## 10. 核心指标体系

## 10.1 基础指标

| 指标    | 公式                            | 说明     |
| ----- | ----------------------------- | ------ |
| 活动总场次 | `eventMatchCount`              | 本次活动确认打过的总局数 |
| 出勤场次 | `attendanceCount`              | 玩家实际参加局数 |
| 出勤率  | `attendanceCount / eventMatchCount` | 是否存在缺席 |
| 击杀    | sum(kills)                    | 击杀能力   |
| 死亡    | deathType != alive 的次数        | K/D 分母 |
| 助攻    | sum(assists)                  | 团队参与   |
| DBNO  | sum(dBNOs)                    | 击倒能力   |
| K/D   | kills / deaths                | 传统 K/D |
| KPG   | kills / attendanceCount       | 按出勤局计算的场均击杀 |
| ADR   | damageDealt / attendanceCount | 按出勤局计算的场均伤害 |
| DPM   | damageDealt / survivalMinutes | 每分钟输出  |
| 场均生存  | timeSurvived / attendanceCount | 运营与生存  |
| Top 率 | 高排名局数 / attendanceCount      | 个人参战后的进圈能力 |
| 拉人率   | revives / attendanceCount     | 团队救援能力 |

---

## 10.2 战斗效率指标

| 指标      | 公式                                                   | 说明      |
| ------- | ---------------------------------------------------- | ------- |
| 造成伤害    | sum(damageDealt)                                     | 主输出指标   |
| 承受伤害    | sum(damageTaken)                                     | 被攻击压力   |
| 场均承伤    | damageTaken / matches                                | 每局承受压力  |
| 换血比     | damageDealt / damageTaken                            | 对枪是否赚   |
| 开火次数    | sum(fireCount)                                       | 主动攻击频率  |
| 命中效率    | damageDealt / fireCount                              | 开火收益    |
| 有效伤害事件率 | damageHitEvents / fireCount                          | 近似命中效率  |
| 首次接敌时间  | min(firstAttack, firstDamageDealt, firstDamageTaken) | 是否避战    |
| 早期接战率   | 前 5/10 分钟发生战斗的局数占比                                   | 跳点/打法风格 |

---

## 10.3 生存运营指标

| 指标       | 公式                          | 说明     |
| -------- | --------------------------- | ------ |
| 场均生存时间   | timeSurvived / matches      | 基础生存能力 |
| 早死率      | 前 5 或 10 分钟死亡局数 / matches   | 落地成盒倾向 |
| 高排名低伤局比例 | 高排名且 ADR 很低的局数 / matches    | 苟分或避战  |
| 移动距离     | walkDistance + rideDistance | 活动与转移  |
| 载具距离     | rideDistance / matches      | 转移倾向   |
| 蓝圈承伤     | blueZoneDamageTaken         | 跑圈质量   |
| 蓝圈死亡率    | 蓝圈相关死亡 / deaths             | 运营失误   |

---

## 10.4 团队贡献指标

| 指标     | 公式                     | 说明      |
| ------ | ---------------------- | ------- |
| 助攻率    | assists / attendanceCount | 团队参与    |
| 拉人率    | revives / attendanceCount | 救援贡献    |
| 伤害占比   | 玩家伤害 / 队伍总伤害           | 队内输出份额  |
| 击杀占比   | 玩家击杀 / 队伍总击杀           | 队内击杀份额  |
| 击倒占比   | 玩家 DBNO / 队伍总 DBNO     | 打开局面能力  |
| 击杀参与率  | kills + assists / 队伍击杀 | 团队击杀参与  |
| 倒地转击杀率 | kills / DBNO           | 收割与补人能力 |
| 出勤贡献分  | attendanceRate         | 是否稳定到场 |

---

## 11. 评分体系

建议不要使用固定绝对值判断，因为不同队伍水平差异很大。更合理的是：

1. 队内相对分。
2. 与历史均值对比。
3. 与全局样本库对比，后期再做。

第一版建议用队内相对分。

---

## 11.1 综合评分

| 分数  |  权重 | 说明           |
| --- | --: | ------------ |
| 战斗分 | 35% | 击杀、伤害、击倒、K/D |
| 效率分 | 25% | 换血比、命中效率、DPM |
| 生存分 | 20% | 生存时间、排名、早死率  |
| 团队分 | 15% | 助攻、拉人、伤害占比   |
| 稳定分 |  5% | 低伤局、波动、样本稳定性 |

总分：

| 项目              | 权重 |
| --------------- | -: |
| CombatScore     | 35 |
| EfficiencyScore | 25 |
| SurvivalScore   | 20 |
| TeamScore       | 15 |
| StabilityScore  |  5 |

---

## 11.2 战斗分 CombatScore

| 指标                  |  权重 |
| ------------------- | --: |
| ADR                 | 30% |
| KPG                 | 20% |
| K/D                 | 15% |
| DBNO/match          | 15% |
| DPM                 | 10% |
| HeadshotKills/match | 10% |

说明：

* 战斗分高，代表这个人能打。
* 但战斗分高不一定是稳健玩家。
* 可能是刚枪强，也可能是莽夫。

---

## 11.3 效率分 EfficiencyScore

| 指标             |  权重 |
| -------------- | --: |
| 换血比            | 35% |
| 命中效率           | 25% |
| 有效伤害事件率        | 15% |
| 造成伤害 / 承受伤害稳定性 | 15% |
| 首次接敌后输出效率      | 10% |

说明：

* 效率分高，代表接战质量高。
* 如果承伤低、输出高，多半是架枪位或聪明打法。
* 如果承伤高、输出也高，多半是突破位或刚枪位。
* 如果承伤高、输出低，多半是打不过。

---

## 11.4 生存分 SurvivalScore

| 指标       |  权重 |
| -------- | --: |
| 场均生存时间   | 35% |
| 高排名率     | 25% |
| 早死率反向分   | 20% |
| 蓝圈死亡率反向分 | 10% |
| 移动/转移合理性 | 10% |

说明：

* 生存分高不一定代表强。
* 需要结合输出和承伤判断。
* 生存高 + 输出高 = 稳健。
* 生存高 + 输出低 + 承伤低 = 避战/战地记者。

---

## 11.5 团队分 TeamScore

| 指标    |  权重 |
| ----- | --: |
| 助攻率   | 25% |
| 拉人率   | 25% |
| 伤害占比  | 20% |
| 击倒占比  | 15% |
| 击杀参与率 | 15% |

说明：

* 击杀不高但团队分高的人，可能是辅助位。
* 不能简单归类为菜。
* 组排中 DBNO 和 assist 很重要。

---

## 12. 风格标签体系

## 12.1 多标签原则

一个玩家可以同时拥有多个标签。

例如：

| 玩家      | 标签              |
| ------- | --------------- |
| PlayerA | 钢枪王、突破手、高输出、换血赚 |
| PlayerB | 稳健吃鸡、运营大师、架枪位   |
| PlayerC | 伏地老六、战地记者、避战型   |
| PlayerD | 盒子精、夕阳红枪法、打不过   |

返回时建议分为：

| 字段             | 说明            |
| -------------- | ------------- |
| `primaryTitle` | 主称号，取最有代表性的一个 |
| `tags`         | 所有符合条件的标签     |
| `comment`      | 人话评价          |

---

## 12.2 标签优先级

如果一个人符合多个标签，主称号按以下优先级选择：

1. 明显强势标签：钢枪王、稳健吃鸡、运营大师。
2. 明确团队定位：突破手、架枪位、医疗兵。
3. 明显问题标签：盒子精、夕阳红枪法、战地记者、伏地老六。
4. 普通标签：均衡型、补枪位、转移型。

原因：主称号要更像榜单展示，标签可以展示更多细节。

---

## 13. 标签判断规则

## 13.1 钢枪王

### 判断条件

| 指标         | 条件            |
| ---------- | ------------- |
| ADR        | 高于队伍均值 20% 以上 |
| KPG        | 高于队伍均值 20% 以上 |
| DBNO/match | 高于队伍均值        |
| 战斗分        | 队内前 30%       |

### 增强条件

| 指标   | 条件      |
| ---- | ------- |
| 换血比  | ≥ 1.0   |
| 命中效率 | 不低于队伍均值 |

### 评价文案

正面对抗能力强，输出和击杀都高，适合作为队伍主要火力点。

---

## 13.2 突破手

### 判断条件

| 指标         | 条件 |
| ---------- | -- |
| DBNO/match | 高  |
| 承受伤害       | 中高 |
| 造成伤害       | 高  |
| 早期接战率      | 高  |

### 评价文案

主动接战多，经常负责打开局面。承伤高不是问题，关键看换血是否亏。

---

## 13.3 架枪位

### 判断条件

| 指标      | 条件        |
| ------- | --------- |
| ADR     | 中高或高      |
| 承受伤害    | 低         |
| 换血比     | 高         |
| KPG     | 中等或中高     |
| 远距离伤害占比 | 高，增强模式可判断 |

### 评价文案

输出稳定，暴露少，偏远点压制或架枪打法，不一定冲得多，但打得有效。

---

## 13.4 稳健吃鸡

### 判断条件

| 指标   | 条件          |
| ---- | ----------- |
| 生存分  | 高           |
| ADR  | 不低于队伍均值 90% |
| 死亡率  | 低           |
| 换血比  | ≥ 1.0       |
| 高排名率 | 高           |

### 评价文案

打法稳健，不是无脑刚枪，但能活、能输出、能进入后期。

---

## 13.5 运营大师

### 判断条件

| 指标   | 条件 |
| ---- | -- |
| 生存时间 | 高  |
| 蓝圈承伤 | 低  |
| 早死率  | 低  |
| 移动距离 | 合理 |
| 高排名率 | 高  |

### 评价文案

进圈和转移质量较好，能稳定把队伍带到中后期。

---

## 13.6 医疗兵 / 救火队长

### 判断条件

| 指标            | 条件            |
| ------------- | ------------- |
| revives/match | 高于队伍均值 30% 以上 |
| assists/match | 不低            |
| TeamScore     | 高             |

### 评价文案

击杀不一定最高，但拉人和团队参与较多，属于队伍支撑位。

---

## 13.7 补枪位 / 收割者

### 判断条件

| 指标        | 条件 |
| --------- | -- |
| kills     | 中高 |
| DBNO      | 不高 |
| assists   | 中高 |
| ADR       | 中等 |
| 击杀 / DBNO | 偏高 |

### 评价文案

收割能力不错，但主动击倒能力未必强，适合跟枪和补枪。

---

## 13.8 雷神 / 投掷物大师

### 判断条件

| 指标       | 条件 |
| -------- | -- |
| 投掷物伤害    | 高  |
| 投掷物击倒/击杀 | 高  |
| 房区战参与    | 高  |

### 说明

该标签必须依赖 telemetry。

### 评价文案

投掷物使用效果好，适合房区清点和压制。

---

## 13.9 伏地老六

### 判断条件

| 指标   | 条件 |
| ---- | -- |
| 生存时间 | 高  |
| ADR  | 低  |
| 承受伤害 | 低  |
| 开火次数 | 低  |
| KPG  | 低  |

### 评价文案

能活，但战斗参与度偏低，更像避战或蹲点打法。

---

## 13.10 战地记者

### 判断条件

| 指标      | 条件   |
| ------- | ---- |
| 生存时间    | 中高或高 |
| ADR     | 很低   |
| 承受伤害    | 低    |
| 开火次数    | 低    |
| assists | 低    |
| DBNO    | 低    |

### 评价文案

活得久，但几乎不参与战斗，像在旁边观战。

---

## 13.11 怂 / 避战型

### 判断条件

| 指标       | 条件 |
| -------- | -- |
| 生存时间     | 高  |
| ADR      | 低  |
| 承受伤害     | 低  |
| 开火次数     | 低  |
| 首次接敌时间   | 晚  |
| 高排名低伤局比例 | 高  |

### 评价文案

主要问题不是打不过，而是接战意愿低。需要更多主动输出和跟队参战。

---

## 13.12 菜 / 打不过

### 判断条件

| 指标   | 条件 |
| ---- | -- |
| 承受伤害 | 高  |
| 造成伤害 | 低  |
| 换血比  | 低  |
| K/D  | 低  |
| ADR  | 低  |
| 早死率  | 中高 |

### 评价文案

不是完全不接战，而是接战后打不出有效伤害，正面对抗能力偏弱。

---

## 13.13 夕阳红枪法

### 判断条件

| 指标            | 条件   |
| ------------- | ---- |
| 开火次数          | 中高或高 |
| 命中效率          | 低    |
| DamagePerFire | 低    |
| ADR           | 低    |
| DBNO          | 低    |

### 评价文案

开火不少，但有效伤害偏低，可能是压枪、瞄准或开枪时机问题。

---

## 13.14 盒子精

### 判断条件

| 指标   | 条件 |
| ---- | -- |
| 生存时间 | 低  |
| ADR  | 低  |
| K/D  | 低  |
| 死亡率  | 高  |
| 早死率  | 高  |

### 评价文案

容易过早阵亡，队伍还没进入中后期就已经掉人。

---

## 13.15 快递员

### 判断条件

| 指标              | 条件 |
| --------------- | -- |
| 移动距离            | 中高 |
| weaponsAcquired | 中高 |
| 生存时间            | 中低 |
| ADR             | 低  |
| 死亡率             | 高  |

### 评价文案

活动不少，但转化不成战斗收益，容易给对面送装备。

---

## 13.16 均衡型

### 判断条件

| 指标     | 条件   |
| ------ | ---- |
| 战斗分    | 中等以上 |
| 生存分    | 中等以上 |
| 团队分    | 中等以上 |
| 明显负面标签 | 无    |

### 评价文案

各项比较均衡，没有明显短板，也没有特别突出的单项。

---

## 14. “怂”和“菜”的区分逻辑

这是整个画像系统最关键的部分。

| 类型      | 造成伤害 | 承受伤害 | 开火次数 |  生存 |  换血比 | 结论      |
| ------- | ---: | ---: | ---: | --: | ---: | ------- |
| 怂 / 避战  |    低 |    低 |    低 |   高 | 不一定低 | 不怎么打    |
| 菜 / 打不过 |    低 |    高 |   中高 | 低或中 |    低 | 打了但打不过  |
| 稳健      |   中高 |  低或中 |    中 |   高 |    高 | 会打也会活   |
| 刚枪      |    高 |    高 |    高 |   中 |  ≥ 1 | 接战多且能换  |
| 架枪      |    高 |    低 |    中 |  中高 |    高 | 暴露少，输出好 |
| 战地记者    |   极低 |    低 |   极低 |   高 |  无意义 | 旁观型     |
| 夕阳红枪法   |    低 |    中 |    高 |  中低 |    低 | 开枪多但没伤害 |

---

## 15. 榜单字段设计

## 15.1 推荐主列表字段

| 字段                | 展示名 | 说明          |
| ----------------- | --- | ----------- |
| `rank`            | 排名  | 综合评分排名      |
| `eventMatches`    | 总局  | 活动并集总局数     |
| `attendanceMatches` | 出勤  | 实际参加局数      |
| `attendanceRate`  | 出勤率 | 实际参加局数 / 总局数 |
| `primaryTitle`    | 主称号 | 最代表该玩家的标签   |
| `tags`            | 标签  | 多个风格标签      |
| `playerName`      | 游戏名 | PUBG name   |
| `matches`         | 场次  | 如页面只保留一个“场次”列，默认显示 `attendanceMatches` |
| `kills`           | 击杀  | 总击杀         |
| `deaths`          | 死亡  | 总死亡         |
| `assists`         | 助攻  | 总助攻         |
| `dbnos`           | 击倒  | 总击倒         |
| `kd`              | K/D | 击杀 / 死亡     |
| `kpg`             | KPG | 场均击杀        |
| `adr`             | ADR | 场均伤害        |
| `damageTakenAvg`  | 承伤  | 场均承受伤害      |
| `tradeRatio`      | 换血比 | 造成伤害 / 承受伤害 |
| `hitEfficiency`   | 命中效 | 近似命中效率      |
| `avgSurvival`     | 生存  | 场均生存时间      |
| `combatScore`     | 战斗  | 战斗分         |
| `efficiencyScore` | 效率  | 战斗效率分       |
| `survivalScore`   | 生存  | 生存分         |
| `teamScore`       | 团队  | 团队分         |
| `comment`         | 评价  | 简短人话评价      |

---

## 15.2 页面展示示例

| 排名 | 称号/标签       | 游戏名          | 场次 | 击杀 | 死亡 |  K/D |  KPG | ADR |  承伤 |  换血比 | 命中效 |    生存 | 评价             |
| -- | ----------- | ------------ | -: | -: | -: | ---: | ---: | --: | --: | ---: | --: | ----: | -------------- |
| 1  | 钢枪王、突破手、高输出 | Jesus331     | 19 | 28 | 18 | 1.56 | 1.47 | 184 | 142 | 1.30 |   高 | 16:20 | 主动接战多，输出高，换血不亏 |
| 2  | 医疗兵、均衡型     | 1A6c         | 34 | 39 | 34 | 1.15 | 1.15 | 172 | 168 | 1.02 |   中 | 17:10 | 输出稳定，团队参与高     |
| 3  | 运营型、架枪位     | AMD____YES   | 34 | 37 | 33 | 1.12 | 1.09 | 146 | 102 | 1.43 |  中高 | 19:40 | 承伤低，输出稳定，偏稳健   |
| 4  | 盒子精、夕阳红枪法   | theming-0315 | 34 | 15 | 33 | 0.45 | 0.44 |  65 | 155 | 0.42 |   低 | 13:50 | 承伤高但输出低，接战质量差  |

注意：K/D 和 KPG 必须分开。你之前截图里的 K/D 很可能实际是 KPG，也就是 `kills / matches`，正式设计不要混用。

---

## 16. 评价文案生成规则

## 16.1 强势玩家文案

| 条件                   | 文案                     |
| -------------------- | ---------------------- |
| 高 ADR + 高 KPG + 高换血比 | 输出和击杀都明显高于队伍均值，正面对抗能力强 |
| 高 ADR + 低承伤 + 高换血比   | 输出效率好，暴露少，适合架枪和压制      |
| 高 DBNO + 高承伤 + 高输出   | 经常负责打开局面，偏突破手打法        |
| 高生存 + 中高输出           | 打法稳健，能活到后期，也能提供稳定输出    |

---

## 16.2 问题玩家文案

| 条件               | 文案                     |
| ---------------- | ---------------------- |
| 低输出 + 低承伤 + 高生存  | 战斗参与偏低，疑似避战打法          |
| 低输出 + 高承伤 + 低换血比 | 接战后换血明显吃亏，正面对抗能力偏弱     |
| 高开火 + 低命中效率      | 开枪不少，但有效伤害不足，需要提升压枪和瞄准 |
| 低生存 + 低输出        | 容易过早阵亡，死前贡献不足          |
| 高排名 + 低伤害        | 能活到后期，但对团队战斗帮助有限       |

---

## 17. 性能估算

以 4 人队伍、最近 20～40 场有效比赛为例：

| 模式                | 接口/处理                         |        预计耗时 |
| ----------------- | ----------------------------- | ----------: |
| 缓存命中              | 直接读取榜单结果                      | 100ms～500ms |
| 基础榜单首次查询          | 1 次 players + 20～40 次 matches |      3～10 秒 |
| 战斗效率首次分析          | 增加 20～40 个 telemetry          |     15～60 秒 |
| 全量 telemetry 串行处理 | 不推荐                           |         数分钟 |

如果 telemetry 开 2～4 个 worker，并且 match、feature 有缓存，后续同样查询会很快。

---

## 18. 异步任务设计

由于 telemetry 分析可能比较慢，建议接口设计为异步任务。

### 18.1 查询发起

前端发起队伍分析请求后，后端立即返回：

| 字段                | 说明             |
| ----------------- | -------------- |
| `taskId`          | 分析任务 ID        |
| `basicStatus`     | 基础榜单状态         |
| `telemetryStatus` | telemetry 状态   |
| `basicResult`     | 如果已完成，直接返回基础结果 |

### 18.2 状态枚举

| 状态                     | 说明                      |
| ---------------------- | ----------------------- |
| `PENDING`              | 等待执行                    |
| `MATCH_FETCHING`       | 正在查询 match              |
| `BASIC_READY`          | 基础榜单完成                  |
| `TELEMETRY_PROCESSING` | 正在分析 telemetry          |
| `FULL_READY`           | 完整分析完成                  |
| `PARTIAL_READY`        | 部分 match 或 telemetry 失败 |
| `FAILED`               | 任务失败                    |

### 18.3 前端展示

1. 先显示基础榜单。
2. 承伤、换血比、命中效显示“分析中”。
3. telemetry 完成后自动回填。
4. 如果部分 telemetry 失败，显示“部分样本缺失”。

---

## 19. 异常与边界处理

| 场景             | 处理方式                              |
| -------------- | --------------------------------- |
| 时间范围超过 14 天    | 提示官方仅能查询最近 14 天，除非本系统已落库历史数据      |
| 玩家 matchIds 为空 | 返回空榜单，并提示近期无比赛                    |
| 有效场次过少         | 标记“样本不足”，不强行贴负面标签                 |
| match 查询失败     | 记录 warning，继续处理其他 match           |
| telemetry 下载失败 | 基础榜单仍返回，增强字段标记缺失                  |
| 承伤为 0          | 换血比特殊处理，不直接显示无限大                  |
| fireCount 为 0  | 命中效显示无数据                          |
| 玩家中途掉线         | 仍按 participant stats 统计，但评价中降低置信度 |
| 自定义比赛          | 根据业务决定是否排除                        |

---

## 20. 样本置信度设计

评价必须带置信度，避免 1～2 场就乱贴标签。

这里的“有效场次”应按 `attendanceCount` 计算，而不是按 `eventMatchCount` 计算；否则一个只来了 2 局的人，可能因为队伍总共打了 10 局而被误判成高置信度。

|   有效场次 | 置信度 | 处理          |
| -----: | --- | ----------- |
|  1～2 场 | 极低  | 只展示数据，不贴强标签 |
|  3～5 场 | 低   | 可贴轻量标签      |
| 6～10 场 | 中   | 可以生成评价      |
| 10 场以上 | 高   | 可以生成完整画像    |
| 20 场以上 | 很高  | 可以用于稳定排名    |

标签展示建议：

| 置信度 | 展示      |
| --- | ------- |
| 低   | “疑似避战型” |
| 中   | “偏避战型”  |
| 高   | “避战型”   |

---

## 21. 最终推荐 MVP

第一版就做完整战斗效率榜单，但采用异步回填 telemetry。

### 21.1 MVP 接口范围

| 接口                  | 是否使用 |
| ------------------- | ---: |
| `/players`          |    是 |
| `/matches`          |    是 |
| telemetry asset URL |    是 |
| `/seasons`          |    否 |
| `/ranked`           |    否 |
| `/samples`          |    否 |
| `/weapon_mastery`   |    否 |

### 21.2 MVP 字段

| 类型   | 字段                      |
| ---- | ----------------------- |
| 基础字段 | 游戏名、场次、击杀、死亡、助攻、DBNO    |
| 出勤字段 | 总局数、出勤局数、出勤率、缺席局数 |
| 战绩字段 | K/D、KPG、ADR、DPM、场均生存    |
| 战斗效率 | 造成伤害、承受伤害、换血比、开火次数、命中效率 |
| 团队贡献 | 伤害占比、击杀占比、助攻、拉人         |
| 评价字段 | 主称号、多标签、综合评价、置信度        |

### 21.3 MVP 标签

第一版建议只做这些标签：

1. 钢枪王
2. 突破手
3. 架枪位
4. 稳健吃鸡
5. 运营大师
6. 医疗兵
7. 伏地老六
8. 战地记者
9. 菜 / 打不过
10. 夕阳红枪法
11. 盒子精
12. 快递员
13. 均衡型

### 21.4 基于当前仓库的可行性评估

结论先说：

1. 如果目标是“按活动时间窗生成增强版排行榜”，可行性高。
2. 如果目标是“任意队伍任意时间段的通用分析平台”，当前仓库只能算中等可行，还需要补数据模型。
3. 如果目标包含“超过 14 天的历史回溯”或“严格命中率”，单靠现有数据源不可行，必须依赖本地长期落库或接受指标降级。

当前仓库已经具备的基础能力：

| 能力 | 当前现状 | 可直接复用程度 |
| -- | -- | -- |
| PUBG API 客户端 | 已有 `PUBGClient`、玩家查询、比赛查询、按时间范围聚合 | 高 |
| 活动时间窗 | `events.actual_start/actual_end` 已落库 | 高 |
| 异步刷新入口 | 后台已有刷新接口、活动结束自动刷新、进度查询 | 高 |
| 排行榜持久化 | 已有 `event_rankings` 表和读取逻辑 | 中 |
| 前端展示链路 | React 管理页和活动详情页都已能展示基础排名 | 中 |

当前仓库里的主要缺口：

| 缺口 | 为什么是问题 | 是否必须在 MVP 解决 |
| -- | -- | -- |
| 只存游戏名，不存 `accountId` | 改名后会命中失败，也会重复查玩家接口 | 否，建议作为第二阶段增强 |
| `RefreshEventRankings` 仍是串行抓取 | 当前逻辑对每个玩家和每个 match 都套了 6 秒延迟，无法达到设计稿里的性能目标 | 是 |
| 没有 match / telemetry 特征缓存表 | 每次都重新解析会很慢，也无法支撑两阶段回填 | 是 |
| `event_rankings` 字段太少 | 放不下标签、评价、承伤、换血比、置信度等增强结果 | 是 |
| 任务状态过粗 | 现在只有 `calculating/done/idle`，不够表达 `BASIC_READY` 和 `TELEMETRY_PROCESSING` | 是 |
| 前端类型和表格仍是基础榜单 | 无法展示多标签、部分完成状态和增强字段 | 是 |

这里有一个关键判断：这个需求的真正难点不在“能不能接 PUBG API”，而在“如何把现有串行刷新逻辑升级为可缓存、可分阶段、可回填的活动分析流水线”。只要沿着现有活动刷新链路演进，而不是另起一套自由查询系统，工作量是可控的。

### 21.5 推荐落地路径

推荐按“先把基础榜单做快，再把 telemetry 做准”的路线推进，而不是一次性改完所有指标。

#### 阶段 A：重构现有刷新链路，先把基础榜单算快

目标：复用当前活动刷新入口，输出更完整的基础榜单，并把执行时间从“按玩家串行等待”降到“按批次和 worker pool 处理”。

这一阶段最先要改掉的不是打分公式，而是统计口径：

1. 先从所有报名玩家的候选 match 中构造 `eventMatchSet`。
2. 再为每个玩家建立 `attendanceCount` 和个人单局数据。
3. 最后同时产出“活动总局”和“个人出勤局”两套分母。

需要改的文件：

| 文件 | 动作 |
| -- | -- |
| `internal/service/pubg.go` | 拆分受限流的 players 请求和不限流的 matches 请求，去掉当前 blanket `6s` 串行等待策略 |
| `internal/db/schema.go` | 新增基础缓存表，补充 `event_rankings` 增强字段 |
| `internal/api/admin.go` | 刷新接口改为返回更细粒度状态，活动结束自动刷新继续复用 |
| `internal/api/ranking_jobs.go` | 任务状态从三态扩展为多阶段状态 |

这一阶段建议新增或扩展的数据结构：

| 表 | 用途 |
| -- | -- |
| `pubg_player_lookup_cache` | 缓存 `player_name -> account_id + recent_match_ids` |
| `pubg_match_cache` | 缓存 match 元信息、participant 基础 stats、telemetry URL |
| `event_rankings` 扩展列 | 保存 `dbnos`、`kd`、`kpg`、`adr`、`avg_survival`、`primary_title`、`tags_json`、`comment`、`confidence`、`analysis_status` |

这一阶段的产出应该是：

1. 后台刷新仍由活动触发。
2. 基础榜单能在 3 到 10 秒内完成。
3. 排名页可以先展示场次、击杀、死亡、助攻、DBNO、K/D、KPG、ADR、场均生存和基础标签。
4. 没有 telemetry 时也能给出样本置信度和基础评价。

#### 阶段 B：落地 telemetry 特征缓存和异步回填

目标：在不阻塞基础榜单展示的前提下，把承伤、换血比、命中效、首次接敌时间等增强字段补齐。

需要改的文件：

| 文件 | 动作 |
| -- | -- |
| `internal/service/pubg.go` 或拆出的 `internal/service/pubg_telemetry.go` | 增加 telemetry 下载、流式解压、事件解析和特征聚合 |
| `internal/db/schema.go` | 新增玩家单局 telemetry 特征表 |
| `internal/api/admin.go` | 刷新任务在基础榜单完成后继续推进 telemetry 阶段 |
| `internal/api/public.go` | 活动详情接口返回 `analysisStatus`、`telemetryCoverage` 等字段 |

这一阶段建议新增表：

| 表 | 用途 |
| -- | -- |
| `pubg_player_match_features` | 保存单局承伤、换血、开火次数、命中效、首次接敌时间等特征 |

实现上建议采用：

1. 先从 `pubg_match_cache` 拿 telemetry URL。
2. 只解析未命中的 match。
3. 使用 2 到 4 个 worker 下载和解析 gzip telemetry。
4. 解析完成后按玩家聚合，回写 `event_rankings`。
5. 任务状态依次流转为 `MATCH_FETCHING -> BASIC_READY -> TELEMETRY_PROCESSING -> FULL_READY/PARTIAL_READY`。

这一阶段完成后，前端可以做到：

1. 基础榜单先出。
2. 承伤、换血比、命中效先显示“分析中”。
3. telemetry 完成后自动回填。
4. 部分失败时显示“部分样本缺失”，但榜单仍可用。

#### 阶段 C：实现评分、标签和评价文案

目标：把现在简单的 `score + rank_label` 升级成队内相对分、多标签和人话评价。

需要改的文件：

| 文件 | 动作 |
| -- | -- |
| `internal/service/pubg.go` 或拆出的 `internal/service/pubg_ranking.go` | 增加分项得分、标签判定、评价生成和置信度门槛 |
| `frontend/src/api.ts` | 扩展排行榜类型定义 |
| `frontend/src/pages/EventDetailPage.tsx` | 展示主称号、标签、评价、增强字段 |
| `frontend/src/pages/admin/AdminEventDetail.tsx` | 展示后台任务阶段和增强榜单 |

建议这一阶段不要一次上全部标签，先严格按 21.3 的 MVP 标签做，原因很简单：

1. 这些标签已经覆盖了强势、定位、避战、打不过和早死几类核心画像。
2. 它们对 telemetry 的依赖程度相对清晰。
3. 先把规则跑稳，再扩充“雷神”“房区战专家”这类更细标签。

#### 阶段 D：补测试、压性能、处理边界

目标：把这套分析链路从“能跑”变成“可持续维护”。

建议补的测试：

| 测试文件 | 覆盖重点 |
| -- | -- |
| `internal/service/pubg_ranking_test.go` | 基础榜单聚合、时间窗过滤、队内相对分 |
| `internal/service/pubg_telemetry_test.go` | telemetry 事件解析、换血比、命中效、首次接敌时间 |
| `internal/db/schema_test.go` 或迁移集成测试 | 新表和新增列的迁移兼容性 |
| `internal/api/admin_test.go` | 刷新任务状态流转、部分失败时的返回结构 |

测试实现上不要依赖真实 PUBG API，直接使用本地 fixture：

1. players 响应 JSON。
2. matches 响应 JSON。
3. telemetry gzip 文件。

这样才能稳定验证标签规则和边界条件。

### 21.6 不建议第一版就做的内容

以下内容不是做不了，而是不适合和 MVP 一起上：

1. 通用“临时队伍分析”入口。
2. 超过 14 天的历史回溯分析。
3. 武器专精、生存专精、全赛季全局画像。
4. 过于细碎的长尾标签。

原因是这些需求都会显著扩大数据模型和缓存范围，容易把当前“活动结束后生成榜单”的清晰目标拖散。

---

## 22. 结论

这个方案的核心是：

1. **少调受限流接口**：players 批量查，强缓存。
2. **充分利用不限流接口**：matches 和 telemetry 不计入 API Key 限流，但仍要控制并发。
3. **Go 后台用 worker pool**：match 4～8 并发，telemetry 2～4 并发。
4. **核心指标必须包含**：造成伤害、承受伤害、换血比、命中效率。
5. **标签支持多个**：不要强行一个人一个称号，符合规则就打标。
6. **怂和菜要分开判断**：低输出低承伤偏怂，高承伤低输出偏菜。
7. **Telemetry 结果必须落库**：否则每次分析都会慢。

[1]: https://documentation.pubg.com/en/getting-started.html "Getting Started — pubg 1.0 documentation"
[2]: https://documentation.pubg.com/en/rate-limits.html "Rate Limits — pubg 1.0 documentation"
[3]: https://documentation.pubg.com/en/telemetry.html "Telemetry — pubg 1.0 documentation"
[4]: https://documentation.pubg.com/en/telemetry-events.html "Telemetry Events — pubg 1.0 documentation"