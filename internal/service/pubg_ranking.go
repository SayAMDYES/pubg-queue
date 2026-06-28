package service

import (
	"math"
	"sort"
)

// 标签代码常量。前端可基于 code 自定义渲染。
const (
	TagAce         = "ace"          // 钢枪王
	TagBreaker     = "breaker"      // 突破手
	TagSniperPos   = "sniper_pos"   // 架枪位
	TagSteady      = "steady"       // 稳健吃鸡
	TagOperator    = "operator"     // 运营大师
	TagMedic       = "medic"        // 医疗兵
	TagFinisher    = "finisher"     // 补枪位
	TagReporter    = "reporter"     // 战地记者
	TagCamper      = "camper"       // 伏地老六
	TagCoward      = "coward"       // 怂 / 避战
	TagWeak        = "weak"         // 菜 / 打不过
	TagDuskShooter = "dusk_shooter" // 夕阳红枪法
	TagBoxKing     = "box_king"     // 盒子精
	TagBalanced    = "balanced"     // 均衡型
)

// 置信度档位。
const (
	ConfidenceVeryLow  = "very_low"
	ConfidenceLow      = "low"
	ConfidenceMedium   = "medium"
	ConfidenceHigh     = "high"
	ConfidenceVeryHigh = "very_high"
)

type tagDef struct {
	Code  string
	Label string
	Color string
}

// 标签描述（label/color），后端统一管理避免前端重复定义。
var tagCatalog = map[string]tagDef{
	TagAce:         {Code: TagAce, Label: "🔥 钢枪王", Color: "#ff4d4f"},
	TagBreaker:     {Code: TagBreaker, Label: "⚡ 突破手", Color: "#fa8c16"},
	TagSniperPos:   {Code: TagSniperPos, Label: "🎯 架枪位", Color: "#722ed1"},
	TagSteady:      {Code: TagSteady, Label: "🛡️ 稳健吃鸡", Color: "#1677ff"},
	TagOperator:    {Code: TagOperator, Label: "🧭 运营大师", Color: "#13c2c2"},
	TagMedic:       {Code: TagMedic, Label: "💊 医疗兵", Color: "#52c41a"},
	TagFinisher:    {Code: TagFinisher, Label: "🎯 补枪位", Color: "#fa541c"},
	TagReporter:    {Code: TagReporter, Label: "📷 战地记者", Color: "#faad14"},
	TagCamper:      {Code: TagCamper, Label: "🐢 伏地老六", Color: "#52c41a"},
	TagCoward:      {Code: TagCoward, Label: "😤 怂", Color: "#8c8c8c"},
	TagWeak:        {Code: TagWeak, Label: "😵 打不过", Color: "#ff7875"},
	TagDuskShooter: {Code: TagDuskShooter, Label: "💫 夕阳红枪法", Color: "#bfbfbf"},
	TagBoxKing:     {Code: TagBoxKing, Label: "📦 盒子精", Color: "#8c8c8c"},
	TagBalanced:    {Code: TagBalanced, Label: "⚖️ 均衡", Color: "#13c2c2"},
}

// 主称号优先级（数值越小越优先）。参考设计稿 §12.2。
var primaryTitleOrder = map[string]int{
	TagAce:         10,
	TagSteady:      11,
	TagOperator:    12,
	TagBreaker:     20,
	TagSniperPos:   21,
	TagMedic:       22,
	TagFinisher:    23,
	TagBoxKing:     30,
	TagDuskShooter: 31,
	TagReporter:    32,
	TagCamper:      33,
	TagCoward:      34,
	TagWeak:        35,
	TagBalanced:    90,
}

func makeTag(code string) RankTag {
	if def, ok := tagCatalog[code]; ok {
		return RankTag{Code: def.Code, Label: def.Label, Color: def.Color}
	}
	return RankTag{Code: code, Label: code}
}

// teamAverages 旧版队内均值结构，目前仅保留给 composeComment 的签名与单元测试使用。
type teamAverages struct {
	avgADR             float64
	avgKPG             float64
	avgKDA             float64
	avgDmgTaken        float64
	avgTradeRatio      float64
	avgHitEff          float64
	avgTimePerMatch    float64
	avgFirePerMatch    float64
	avgDeathsPerMatch  float64
	avgDBNOsPerMatch   float64
	avgRevivesPerMatch float64
	avgAssistsPerMatch float64
	avgTop10Rate       float64
	hasTelemetry       bool
}

// computeConfidence 根据出勤场次返回置信度档位。
func computeConfidence(matches int) string {
	switch {
	case matches >= 20:
		return ConfidenceVeryHigh
	case matches >= 10:
		return ConfidenceHigh
	case matches >= 6:
		return ConfidenceMedium
	case matches >= 3:
		return ConfidenceLow
	default:
		return ConfidenceVeryLow
	}
}

// metricBaseline 指标的“普通玩家”绝对基线（均值 / 标准差），评分以此为参照系。
// 来源：可公开查证的社区口径有限——平均 K/D≈0.95（略低于 1），场均击杀约 1，casual PC 的 ADR 约 150，
// 局均 20-30 分钟且约四成在前 5 分钟出局；遥测类指标（命中效、换血、承伤）无公开数据，按对称性估算
// （全体造成伤害之和 = 承受伤害之和，故场均承伤≈ADR，换血≈1）。数值为经验估计，可用真实样本再校准。
type metricBaseline struct{ mean, std float64 }

var (
	baseADR        = metricBaseline{150, 70}
	baseKPG        = metricBaseline{1.0, 0.8}
	baseKDA        = metricBaseline{0.95, 0.7}
	baseDBNOPM     = metricBaseline{1.0, 0.7}
	baseHSPM       = metricBaseline{0.3, 0.3}
	baseHitEff     = metricBaseline{1.2, 0.6}
	baseTrade      = metricBaseline{1.0, 0.6}
	baseDmgTakenPM = metricBaseline{150, 80}
	baseFirePM     = metricBaseline{150, 90}
	baseSurvPM     = metricBaseline{650, 350}
	baseTop10Rate  = metricBaseline{0.22, 0.20}
	baseDeathRate  = metricBaseline{0.9, 0.3}
	baseAssistsPM  = metricBaseline{0.6, 0.5}
	baseRevivesPM  = metricBaseline{0.5, 0.5}
	baseKnockConv  = metricBaseline{1.0, 0.5}
)

// 综合分维度权重（合计为 1）。以战斗为主，兼顾运营与团队，贴近社区对个人战力的认知。
const (
	wFirepower  = 0.20
	wLethality  = 0.20
	wAggression = 0.15
	wSurvival   = 0.10
	wOperating  = 0.15
	wTeamwork   = 0.20
)

// score 以“普通玩家”基线为参照，按高于均值多少个标准差给 0-100 分：
// 50=普通水平，+1 个标准差≈65，+2 个标准差≈80；分数表达“比常人高多少”，与同场玩家强弱无关。
func (b metricBaseline) score(value float64) float64 {
	if b.std <= 0 {
		return 50
	}
	v := 50 + 15*(value-b.mean)/b.std
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

func cappedAvgRatio(value, avg float64) float64 {
	if avg <= 0 {
		return 1
	}
	if value <= 0 {
		return 0
	}
	ratio := value / avg
	if ratio > 1 {
		return 1
	}
	return ratio
}

// survivalContributionGate 按“相对普通玩家的绝对输出”给生存/运营打折，避免纯苟分推高总分。
func survivalContributionGate(e RankEntry) float64 {
	readiness := math.Max(cappedAvgRatio(e.AvgDamage, baseADR.mean), cappedAvgRatio(e.KPG, baseKPG.mean))
	return 0.45 + 0.55*readiness
}

// perMatchVal 计算场均值，matches<=0 时返回 0。
func perMatchVal(value float64, matches int) float64 {
	if matches <= 0 {
		return 0
	}
	return value / float64(matches)
}

// knockConvOf 击倒转化率：击杀 ÷ 击倒，无击倒时为 0。
func knockConvOf(e RankEntry) float64 {
	if e.DBNOs > 0 {
		return float64(e.Kills) / float64(e.DBNOs)
	}
	return 0
}

// firePerTelMatch 场均开火次数（按遥测场次）。
func firePerTelMatch(e RankEntry) float64 {
	if e.TelemetryMatches > 0 {
		return float64(e.FireCount) / float64(e.TelemetryMatches)
	}
	return 0
}

// computeSubScores 计算六维能力分（0-100）并据此合成综合分。
// 评分以“普通玩家”绝对基线为参照（见 metricBaseline.score）：50=普通水平，分数表达“比常人高多少”，
// 与同场玩家强弱无关，因此跨活动可比，雷达图也表示个人相对常人的能力轮廓。
func computeSubScores(entries []RankEntry) {
	for i := range entries {
		e := &entries[i]
		if e.Matches <= 0 {
			e.DimFirepower, e.DimLethality, e.DimAggression = 0, 0, 0
			e.DimSurvival, e.DimOperating, e.DimTeamwork = 0, 0, 0
			e.CombatScore, e.EfficiencyScore, e.SurvivalScore, e.TeamScore = 0, 0, 0, 0
			e.Score = 0
			continue
		}
		hasTel := e.TelemetryMatches > 0

		dbnoPM := perMatchVal(float64(e.DBNOs), e.Matches)
		hsPM := perMatchVal(float64(e.HeadshotKills), e.Matches)
		survPM := perMatchVal(e.TimeAlive, e.Matches)
		top10Rate := perMatchVal(float64(e.Top10Count), e.Matches)
		deathRate := perMatchVal(float64(e.Deaths), e.Matches)
		assistsPM := perMatchVal(float64(e.Assists), e.Matches)
		revivesPM := perMatchVal(float64(e.Revives), e.Matches)
		knock := knockConvOf(*e)

		// 火力：输出体量（ADR + 场均击杀）
		e.DimFirepower = 0.6*baseADR.score(e.AvgDamage) + 0.4*baseKPG.score(e.KPG)

		// 精准：把交火转化为淘汰的质量（K/D、命中效、爆头、击倒转化）
		if hasTel {
			e.DimLethality = 0.40*baseKDA.score(e.KDA) + 0.30*baseHitEff.score(e.HitEfficiency) +
				0.15*baseHSPM.score(hsPM) + 0.15*baseKnockConv.score(knock)
		} else {
			e.DimLethality = 0.60*baseKDA.score(e.KDA) + 0.25*baseHSPM.score(hsPM) + 0.15*baseKnockConv.score(knock)
		}

		// 对抗：前压与换血质量；无遥测时退化为 ADR / 击倒的近似
		if hasTel {
			e.DimAggression = 0.35*baseDmgTakenPM.score(e.AvgDamageTaken) + 0.30*baseTrade.score(e.TradeRatio) +
				0.20*baseFirePM.score(firePerTelMatch(*e)) + 0.15*baseDBNOPM.score(dbnoPM)
		} else {
			e.DimAggression = 0.55*baseADR.score(e.AvgDamage) + 0.45*baseDBNOPM.score(dbnoPM)
		}

		// 生存 / 运营：维度分如实反映存活与排名表现（雷达图据此呈现真实风格）
		e.DimSurvival = 0.55*baseSurvPM.score(survPM) + 0.45*(100-baseDeathRate.score(deathRate))
		e.DimOperating = 0.70*baseTop10Rate.score(top10Rate) + 0.30*baseSurvPM.score(survPM)

		// 团队：助攻 + 救援
		e.DimTeamwork = 0.5*baseAssistsPM.score(assistsPM) + 0.5*baseRevivesPM.score(revivesPM)

		// 综合分：以战斗为主；生存与运营按输出参与度设门槛，避免纯苟分推高总分
		gate := survivalContributionGate(*e)
		e.Score = wFirepower*e.DimFirepower + wLethality*e.DimLethality + wAggression*e.DimAggression +
			(wSurvival*e.DimSurvival+wOperating*e.DimOperating)*gate + wTeamwork*e.DimTeamwork

		// 兼容旧的四项子分字段（前端旧视图仍在消费）
		e.CombatScore = 0.5*e.DimFirepower + 0.5*e.DimLethality
		e.EfficiencyScore = e.DimAggression
		e.SurvivalScore = 0.5*e.DimSurvival + 0.5*e.DimOperating
		e.TeamScore = e.DimTeamwork
	}
}

// applyTags 为每个 entry 计算多标签、主称号和评价文案。
func applyTags(entries []RankEntry) {
	for i := range entries {
		e := &entries[i]
		tags := buildTagsForEntry(*e)

		e.Tags = dedupeTags(tags)
		e.PrimaryTitle = pickPrimaryTitle(e.Tags)
		e.Comment = composeComment(*e, teamAverages{})
		e.Confidence = computeConfidence(e.Matches)
	}
}

func dedupeTags(tags []RankTag) []RankTag {
	seen := make(map[string]struct{}, len(tags))
	out := make([]RankTag, 0, len(tags))
	for _, t := range tags {
		if _, ok := seen[t.Code]; ok {
			continue
		}
		seen[t.Code] = struct{}{}
		out = append(out, t)
	}
	return out
}

func pickPrimaryTitle(tags []RankTag) *RankTag {
	best := -1
	bestPriority := math.MaxInt
	for i, t := range tags {
		p, ok := primaryTitleOrder[t.Code]
		if !ok {
			continue
		}
		if p < bestPriority {
			bestPriority = p
			best = i
		}
	}
	if best < 0 {
		return nil
	}
	t := tags[best]
	return &t
}

// buildTagsForEntry 基于“普通玩家”绝对阈值给单个玩家贴标签，与同场队友强弱无关。
// 阈值参考社区常见口径：ADR < 100 偏低，130-180 普通，180+ 输出强；K/D 1.0 左右为平均，1.2+ 稳定正收益。
func buildTagsForEntry(e RankEntry) []RankTag {
	if e.Matches <= 0 {
		return nil
	}
	hasTel := e.TelemetryMatches > 0

	adr := e.AvgDamage
	kpg := e.KPG
	kda := e.KDA
	dmgTaken := e.AvgDamageTaken
	trade := e.TradeRatio
	hitEff := e.HitEfficiency
	timePM := e.TimeAlive / float64(e.Matches)
	top10Rate := float64(e.Top10Count) / float64(e.Matches)
	deathPM := float64(e.Deaths) / float64(e.Matches)
	dbnoPM := float64(e.DBNOs) / float64(e.Matches)
	assistsPM := float64(e.Assists) / float64(e.Matches)
	revivePM := float64(e.Revives) / float64(e.Matches)
	firePM := 0.0
	if e.TelemetryMatches > 0 {
		firePM = float64(e.FireCount) / float64(e.TelemetryMatches)
	}

	var tags []RankTag

	// 钢枪王: 输出和收割能力都达到社区常见的强力档。
	if adr >= 180 && kpg >= 1.2 && kda >= 1.2 {
		tags = append(tags, makeTag(TagAce))
	}

	// 突破手: 高承伤前提下仍保持足够输出和换血质量。
	if hasTel && adr >= 180 && dmgTaken >= 200 && trade >= 0.85 && dbnoPM >= 1.1 {
		tags = append(tags, makeTag(TagBreaker))
	}

	// 架枪位: 暴露少、换血效率高，且输出不拖后腿。
	if hasTel && adr >= 150 && dmgTaken <= 170 && trade >= 1.1 {
		tags = append(tags, makeTag(TagSniperPos))
	}

	// 稳健: 存活和进圈表现好，且不是纯苟分。后期高排名玩家常常死在前十，不再用死亡率反向卡。
	if hasTel && timePM >= 680 && top10Rate >= 0.30 && trade >= 0.95 && adr >= 140 {
		tags = append(tags, makeTag(TagSteady))
	}

	// 医疗兵: 拉人率达到较高绝对水平，且有足够的绝对拉人数与基础协同参与。
	if revivePM >= 0.6 && e.Revives >= 4 && assistsPM >= 0.3 {
		tags = append(tags, makeTag(TagMedic))
	}

	// 补枪位: 助攻显著偏高，击倒不低，但本人并非主要钢枪位。
	if assistsPM >= 0.45 && dbnoPM >= 1.0 && kpg >= 0.9 && kpg < 1.2 && adr >= 140 && adr < 190 {
		tags = append(tags, makeTag(TagFinisher))
	}

	// 运营大师: 后期率高、存活稳定，输出中等即可。
	if timePM >= 700 && top10Rate >= 0.35 && adr >= 120 {
		tags = append(tags, makeTag(TagOperator))
	}

	// 战地记者: 活着 + ADR 极低
	if timePM >= 650 && adr < 90 {
		tags = append(tags, makeTag(TagReporter))
	} else if hasTel && timePM >= 700 && adr < 130 && dmgTaken < 170 && firePM < 180 {
		// 伏地老六: 生存高 + ADR 低 + 承伤低 + 开火少（需遥测）
		tags = append(tags, makeTag(TagCamper))
	} else if !hasTel && timePM >= 700 && adr < 130 {
		// 怂: 无遥测时生存高 + ADR 低
		tags = append(tags, makeTag(TagCoward))
	}

	// 菜/打不过: 绝对输出和换血都偏低，而不是仅仅队内相对较差。
	if (hasTel && adr < 110 && trade < 0.8 && kda < 0.9 && dmgTaken >= 190) ||
		(!hasTel && adr < 90 && kda < 0.8 && kpg < 0.7) {
		tags = append(tags, makeTag(TagWeak))
	}

	// 夕阳红枪法: 开火高于常人但命中和输出都低于常人，典型的“乱喷打不准”（需遥测）。
	if hasTel && firePM > baseFirePM.mean && hitEff < baseHitEff.mean && adr < 150 {
		tags = append(tags, makeTag(TagDuskShooter))
	}

	// 盒子精: 生存短 + ADR 低 + K/D 低 + 死亡多
	if timePM < 480 && adr < 110 && kda < 0.8 && deathPM >= 1.0 {
		tags = append(tags, makeTag(TagBoxKing))
	}

	// 均衡: 只给中位档玩家，不再作为所有未命中标签的默认兜底。
	if len(tags) == 0 {
		if adr >= 130 && adr < 190 && kda >= 0.95 && kda < 1.35 && kpg >= 0.9 && kpg < 1.3 && top10Rate >= 0.25 && (!hasTel || (trade >= 0.8 && trade <= 1.05)) {
			tags = append(tags, makeTag(TagBalanced))
		} else if adr < 110 && kda < 0.9 {
			tags = append(tags, makeTag(TagWeak))
		} else {
			tags = append(tags, makeTag(TagBalanced))
		}
	}

	return tags
}

// composeComment 基于最终主称号生成评价，避免和绝对阈值标签出现语义冲突。
func composeComment(e RankEntry, _ teamAverages) string {
	if e.Matches <= 0 {
		return "本次活动未出勤"
	}
	if e.Matches < 3 {
		return "样本不足，仅展示数据，暂不下定论"
	}

	code := ""
	if e.PrimaryTitle != nil {
		code = e.PrimaryTitle.Code
	}

	var comment string
	switch code {
	case TagAce:
		comment = "输出和收割都很强，是队伍里最稳定的正面火力点"
	case TagBreaker:
		comment = "经常顶在前面打开局面，承伤高但还能换回足够输出"
	case TagSniperPos:
		comment = "暴露控制和换血效率都不错，适合架枪和侧翼压制"
	case TagSteady:
		comment = "存活和进圈表现稳定，后期贡献比较可靠"
	case TagOperator:
		comment = "转移和后期处理都比较稳，运营价值比较明显"
	case TagMedic:
		comment = "拉人和协同支援贡献明显，是队伍里的救火位"
	case TagFinisher:
		comment = "补枪和协同收尾能力突出，适合跟枪把伤害转成淘汰"
	case TagReporter:
		comment = "生存不差，但战斗参与和输出明显偏低"
	case TagCamper:
		comment = "活得久、暴露少，但参战和开火都偏少"
	case TagCoward:
		comment = "生存时间不短，但参战积极性和输出都偏低"
	case TagWeak:
		comment = "输出、击杀和换血都偏弱，正面对抗明显吃亏"
	case TagDuskShooter:
		comment = "开火不少，但有效命中和伤害转化偏低"
	case TagBoxKing:
		comment = "容易过早阵亡，死前贡献明显不够"
	case TagBalanced:
		comment = "没有特别突出的强项，但也不是全队最明显的短板"
	default:
		comment = "整体表现中规中矩，还需要更多样本再细看"
	}

	return comment
}

// FinalizeRankings 在基础和遥测聚合完成后，给所有 entry 计算评分、标签和排名。
// 调用方负责：在调用前设置好 Kills/Deaths/Damage/TimeAlive 等基础字段，以及 telemetry 衍生字段。
// 调用后再做持久化。
func FinalizeRankings(entries []RankEntry, analysisStatus string) {
	for i := range entries {
		entries[i].AnalysisStatus = analysisStatus
		if entries[i].Matches > 0 {
			entries[i].AvgDamage = entries[i].TotalDamage / float64(entries[i].Matches)
			entries[i].KPG = float64(entries[i].Kills) / float64(entries[i].Matches)
			entries[i].KDA = float64(entries[i].Kills) / math.Max(float64(entries[i].Deaths), 1)
		}
		if entries[i].TelemetryMatches > 0 {
			entries[i].AvgDamageTaken = entries[i].DamageTaken / float64(entries[i].TelemetryMatches)
		}
		if entries[i].TelemetryDamage > 0 {
			entries[i].TradeRatio = entries[i].TelemetryDamage / math.Max(entries[i].DamageTaken, 1)
		}
		if entries[i].FireCount > 0 {
			entries[i].HitEfficiency = entries[i].TelemetryDamage / float64(entries[i].FireCount)
		}
		if entries[i].EventMatches > 0 {
			entries[i].AttendanceRate = float64(entries[i].Matches) / float64(entries[i].EventMatches)
			if entries[i].EventMatches > entries[i].Matches {
				entries[i].MissedMatches = entries[i].EventMatches - entries[i].Matches
			} else {
				entries[i].MissedMatches = 0
			}
		}
	}

	computeSubScores(entries)

	sort.Slice(entries, func(i, j int) bool {
		if entries[i].Score != entries[j].Score {
			return entries[i].Score > entries[j].Score
		}
		return entries[i].Kills > entries[j].Kills
	})

	for i := range entries {
		entries[i].RankNo = i + 1
	}
	assignRankLabels(entries)

	applyTags(entries)
}
