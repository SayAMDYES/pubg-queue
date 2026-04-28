package service

import (
	"math"
	"sort"
)

// 标签代码常量。前端可基于 code 自定义渲染。
const (
	TagAce          = "ace"            // 钢枪王
	TagBreaker      = "breaker"        // 突破手
	TagSniperPos    = "sniper_pos"     // 架枪位
	TagSteady       = "steady"         // 稳健吃鸡
	TagOperator     = "operator"       // 运营大师
	TagMedic        = "medic"          // 医疗兵
	TagFinisher     = "finisher"       // 补枪位
	TagReporter     = "reporter"       // 战地记者
	TagCamper       = "camper"         // 伏地老六
	TagCoward       = "coward"         // 怂 / 避战
	TagWeak         = "weak"           // 菜 / 打不过
	TagDuskShooter  = "dusk_shooter"   // 夕阳红枪法
	TagBoxKing      = "box_king"       // 盒子精
	TagCourier      = "courier"        // 快递员
	TagBalanced     = "balanced"       // 均衡型
	TagAttendance   = "low_attendance" // 出勤偏低
	TagSampleScarce = "sample_scarce"  // 样本不足
	TagMVP          = "mvp"            // 综合分 No.1
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
	TagAce:          {Code: TagAce, Label: "🔥 钢枪王", Color: "#ff4d4f"},
	TagBreaker:      {Code: TagBreaker, Label: "⚡ 突破手", Color: "#fa8c16"},
	TagSniperPos:    {Code: TagSniperPos, Label: "🎯 架枪位", Color: "#722ed1"},
	TagSteady:       {Code: TagSteady, Label: "🛡️ 稳健吃鸡", Color: "#1677ff"},
	TagOperator:     {Code: TagOperator, Label: "🧭 运营大师", Color: "#13c2c2"},
	TagMedic:        {Code: TagMedic, Label: "💊 医疗兵", Color: "#52c41a"},
	TagFinisher:     {Code: TagFinisher, Label: "🎯 补枪位", Color: "#fa541c"},
	TagReporter:     {Code: TagReporter, Label: "📷 战地记者", Color: "#faad14"},
	TagCamper:       {Code: TagCamper, Label: "🐢 伏地老六", Color: "#52c41a"},
	TagCoward:       {Code: TagCoward, Label: "😤 怂", Color: "#8c8c8c"},
	TagWeak:         {Code: TagWeak, Label: "😵 打不过", Color: "#ff7875"},
	TagDuskShooter:  {Code: TagDuskShooter, Label: "💫 夕阳红枪法", Color: "#bfbfbf"},
	TagBoxKing:      {Code: TagBoxKing, Label: "📦 盒子精", Color: "#8c8c8c"},
	TagCourier:      {Code: TagCourier, Label: "🚚 快递员", Color: "#a0a0a0"},
	TagBalanced:     {Code: TagBalanced, Label: "⚖️ 均衡", Color: "#13c2c2"},
	TagAttendance:   {Code: TagAttendance, Label: "🕒 出勤偏低", Color: "#bfbfbf"},
	TagSampleScarce: {Code: TagSampleScarce, Label: "🎲 样本不足", Color: "#bfbfbf"},
	TagMVP:          {Code: TagMVP, Label: "🏅 MVP", Color: "#f0a500"},
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
	TagCourier:     36,
	TagBalanced:    90,
	TagMVP:         99, // MVP 仅作辅助标签，不作为主称号
}

func makeTag(code string) RankTag {
	if def, ok := tagCatalog[code]; ok {
		return RankTag{Code: def.Code, Label: def.Label, Color: def.Color}
	}
	return RankTag{Code: code, Label: code}
}

// teamAverages 队内均值，用于相对评分。仅统计出勤的玩家。
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

func computeTeamAverages(entries []RankEntry) teamAverages {
	var avg teamAverages
	count := 0
	telCount := 0
	for _, e := range entries {
		if e.Matches <= 0 {
			continue
		}
		count++
		avg.avgADR += e.AvgDamage
		avg.avgKPG += e.KPG
		avg.avgKDA += e.KDA
		avg.avgTimePerMatch += e.TimeAlive / float64(e.Matches)
		avg.avgDeathsPerMatch += float64(e.Deaths) / float64(e.Matches)
		avg.avgDBNOsPerMatch += float64(e.DBNOs) / float64(e.Matches)
		avg.avgRevivesPerMatch += float64(e.Revives) / float64(e.Matches)
		avg.avgAssistsPerMatch += float64(e.Assists) / float64(e.Matches)
		avg.avgTop10Rate += float64(e.Top10Count) / float64(e.Matches)

		if e.TelemetryMatches > 0 {
			telCount++
			avg.avgDmgTaken += e.AvgDamageTaken
			avg.avgTradeRatio += e.TradeRatio
			avg.avgHitEff += e.HitEfficiency
			avg.avgFirePerMatch += float64(e.FireCount) / float64(e.TelemetryMatches)
		}
	}
	if count > 0 {
		avg.avgADR /= float64(count)
		avg.avgKPG /= float64(count)
		avg.avgKDA /= float64(count)
		avg.avgTimePerMatch /= float64(count)
		avg.avgDeathsPerMatch /= float64(count)
		avg.avgDBNOsPerMatch /= float64(count)
		avg.avgRevivesPerMatch /= float64(count)
		avg.avgAssistsPerMatch /= float64(count)
		avg.avgTop10Rate /= float64(count)
	}
	if telCount > 0 {
		avg.avgDmgTaken /= float64(telCount)
		avg.avgTradeRatio /= float64(telCount)
		avg.avgHitEff /= float64(telCount)
		avg.avgFirePerMatch /= float64(telCount)
		avg.hasTelemetry = true
	}
	return avg
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

// minMaxNorm 把 [min,max] 范围归一到 [0,1]，再 *100 转换为分数。
func minMaxNorm(value, min, max float64) float64 {
	if max <= min {
		return 0
	}
	if value < min {
		value = min
	}
	if value > max {
		value = max
	}
	return (value - min) / (max - min)
}

// compressedNorm 在队内 min-max 的基础上做轻度压缩，减少小样本下的断层分差。
func compressedNorm(value, min, max float64) float64 {
	return math.Cbrt(minMaxNorm(value, min, max))
}

// rangeOf 取队内某指标的最小最大值，用于做相对归一化。
func rangeOf(entries []RankEntry, fn func(RankEntry) float64, requireTelemetry bool) (float64, float64) {
	min := math.MaxFloat64
	max := -math.MaxFloat64
	hit := false
	for _, e := range entries {
		if e.Matches <= 0 {
			continue
		}
		if requireTelemetry && e.TelemetryMatches <= 0 {
			continue
		}
		v := fn(e)
		if v < min {
			min = v
		}
		if v > max {
			max = v
		}
		hit = true
	}
	if !hit {
		return 0, 0
	}
	return min, max
}

// computeSubScores 计算 4 项子分（0-100），按设计稿 §11.1 权重。
// 子分采用队内 min-max 归一化，避免不同队伍水平差异过大。
func computeSubScores(entries []RankEntry) {
	if len(entries) == 0 {
		return
	}

	adrMin, adrMax := rangeOf(entries, func(e RankEntry) float64 { return e.AvgDamage }, false)
	kpgMin, kpgMax := rangeOf(entries, func(e RankEntry) float64 { return e.KPG }, false)
	kdaMin, kdaMax := rangeOf(entries, func(e RankEntry) float64 { return e.KDA }, false)
	dbnosMin, dbnosMax := rangeOf(entries, func(e RankEntry) float64 {
		if e.Matches > 0 {
			return float64(e.DBNOs) / float64(e.Matches)
		}
		return 0
	}, false)
	hsMin, hsMax := rangeOf(entries, func(e RankEntry) float64 {
		if e.Matches > 0 {
			return float64(e.HeadshotKills) / float64(e.Matches)
		}
		return 0
	}, false)

	tradeMin, tradeMax := rangeOf(entries, func(e RankEntry) float64 { return e.TradeRatio }, true)
	hitEffMin, hitEffMax := rangeOf(entries, func(e RankEntry) float64 { return e.HitEfficiency }, true)

	survMin, survMax := rangeOf(entries, func(e RankEntry) float64 {
		if e.Matches > 0 {
			return e.TimeAlive / float64(e.Matches)
		}
		return 0
	}, false)
	top10Min, top10Max := rangeOf(entries, func(e RankEntry) float64 {
		if e.Matches > 0 {
			return float64(e.Top10Count) / float64(e.Matches)
		}
		return 0
	}, false)
	deathRateMin, deathRateMax := rangeOf(entries, func(e RankEntry) float64 {
		if e.Matches > 0 {
			return float64(e.Deaths) / float64(e.Matches)
		}
		return 0
	}, false)

	revivesMin, revivesMax := rangeOf(entries, func(e RankEntry) float64 {
		if e.Matches > 0 {
			return float64(e.Revives) / float64(e.Matches)
		}
		return 0
	}, false)
	assistsMin, assistsMax := rangeOf(entries, func(e RankEntry) float64 {
		if e.Matches > 0 {
			return float64(e.Assists) / float64(e.Matches)
		}
		return 0
	}, false)

	for i := range entries {
		e := &entries[i]
		if e.Matches <= 0 {
			e.CombatScore = 0
			e.EfficiencyScore = 0
			e.SurvivalScore = 0
			e.TeamScore = 0
			e.Score = 0
			continue
		}

		// CombatScore: ADR 30%, KPG 20%, K/D 20%, DBNO/match 20%, Headshot/match 10%
		dbnosPM := float64(e.DBNOs) / float64(e.Matches)
		hsPM := float64(e.HeadshotKills) / float64(e.Matches)
		combat := 30*compressedNorm(e.AvgDamage, adrMin, adrMax) +
			20*compressedNorm(e.KPG, kpgMin, kpgMax) +
			20*compressedNorm(e.KDA, kdaMin, kdaMax) +
			20*compressedNorm(dbnosPM, dbnosMin, dbnosMax) +
			10*compressedNorm(hsPM, hsMin, hsMax)
		e.CombatScore = combat

		// EfficiencyScore: 换血比 35%, 命中效 25%, ADR 稳定性近似（用 ADR）20%, 首次接敌效率（缺失，用 trade）20%
		// 没有 telemetry 时退化为 ADR/KDA 的衍生值，以避免完全 0 分。
		var efficiency float64
		if e.TelemetryMatches > 0 {
			efficiency = 35*compressedNorm(e.TradeRatio, tradeMin, tradeMax) +
				25*compressedNorm(e.HitEfficiency, hitEffMin, hitEffMax) +
				20*compressedNorm(e.AvgDamage, adrMin, adrMax) +
				20*compressedNorm(e.KDA, kdaMin, kdaMax)
		} else {
			// 退化：ADR + KDA 各占一半作为粗糙效率分
			efficiency = 50*compressedNorm(e.AvgDamage, adrMin, adrMax) +
				50*compressedNorm(e.KDA, kdaMin, kdaMax)
		}
		e.EfficiencyScore = efficiency

		// SurvivalScore: 场均生存 45%, 高排名率 25%, 早死率反向 30%
		survPM := e.TimeAlive / float64(e.Matches)
		top10Rate := float64(e.Top10Count) / float64(e.Matches)
		deathRate := float64(e.Deaths) / float64(e.Matches)
		survival := 45*compressedNorm(survPM, survMin, survMax) +
			25*compressedNorm(top10Rate, top10Min, top10Max) +
			30*(1-compressedNorm(deathRate, deathRateMin, deathRateMax))
		e.SurvivalScore = survival

		// TeamScore: 助攻率 25%, 拉人率 25%, 伤害占比 20%, 击倒占比 15%, 击杀参与率 15%
		// 没有团队总和数据时，用队内 min-max 归一化作为相对值。
		assistsPM := float64(e.Assists) / float64(e.Matches)
		revivesPM := float64(e.Revives) / float64(e.Matches)
		// 伤害占比/击倒占比/击杀参与率 → 用相对量值近似
		team := 25*compressedNorm(assistsPM, assistsMin, assistsMax) +
			25*compressedNorm(revivesPM, revivesMin, revivesMax) +
			20*compressedNorm(e.AvgDamage, adrMin, adrMax) +
			15*compressedNorm(dbnosPM, dbnosMin, dbnosMax) +
			15*compressedNorm(e.KPG, kpgMin, kpgMax)
		e.TeamScore = team

		// Score 综合分：Combat 30% + Efficiency 25% + Survival 25% + Team 20%。
		// 让团队和生存表现保留更高权重，避免小样本里输出项把差距拉得过于夸张。
		e.Score = e.CombatScore*0.30 + e.EfficiencyScore*0.25 + e.SurvivalScore*0.25 + e.TeamScore*0.20
	}
}

// applyTags 为每个 entry 计算多标签、主称号和评价文案。
func applyTags(entries []RankEntry, mvpRegID int64) {
	avg := computeTeamAverages(entries)
	for i := range entries {
		e := &entries[i]
		tags := buildTagsForEntry(*e, avg)

		// 出勤偏低（活动并集明显大于个人出勤）
		if e.EventMatches >= 3 && e.AttendanceRate > 0 && e.AttendanceRate < 0.6 {
			tags = append(tags, makeTag(TagAttendance))
		}

		// 样本不足
		if e.Matches > 0 && e.Matches < 3 {
			tags = append(tags, makeTag(TagSampleScarce))
		}

		// MVP（综合分 No.1）
		if mvpRegID > 0 && e.RegID == mvpRegID && e.Matches > 0 {
			tags = append([]RankTag{makeTag(TagMVP)}, tags...)
		}

		e.Tags = dedupeTags(tags)
		e.PrimaryTitle = pickPrimaryTitle(e.Tags)
		e.Comment = composeComment(*e, avg)
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
		// 出勤偏低、样本不足、MVP 不作为主称号
		if t.Code == TagAttendance || t.Code == TagSampleScarce || t.Code == TagMVP {
			continue
		}
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

// buildTagsForEntry 基于固定阈值给单个玩家贴标签。
// 阈值参考社区常见口径：ADR < 100 偏低，130-180 普通，180+ 输出强；K/D 1.0 左右为平均，1.2+ 稳定正收益。
func buildTagsForEntry(e RankEntry, avg teamAverages) []RankTag {
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

	// 稳健: 存活和进圈表现好，且不是纯苟分。
	if hasTel && timePM >= 680 && top10Rate >= 0.30 && deathPM <= 0.95 && trade >= 0.95 && adr >= 140 {
		tags = append(tags, makeTag(TagSteady))
	}

	// 医疗兵: 拉人率显著高于队均，且有足够的绝对拉人数与基础协同参与。
	if revivePM >= 0.6 && e.Revives >= 4 && assistsPM >= 0.3 {
		tags = append(tags, makeTag(TagMedic))
	}

	// 补枪位: 助攻显著偏高，击倒不低，但本人并非主要钢枪位。
	if assistsPM >= 0.45 && dbnoPM >= 1.0 && kpg >= 0.9 && kpg < 1.2 && adr >= 140 && adr < 190 {
		tags = append(tags, makeTag(TagFinisher))
	}

	// 运营大师: 后期率高、存活稳定，输出中等即可。
	if timePM >= 700 && top10Rate >= 0.35 && deathPM <= 0.95 && adr >= 120 {
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

	// 夕阳红枪法: 开火多 + 命中效低 + ADR 低（需遥测）
	if hasTel && firePM >= 220 && hitEff < 0.75 && adr < 150 {
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

// composeComment 基于队内均值生成简短评价文案，参考设计稿 §16。
func composeComment(e RankEntry, avg teamAverages) string {
	if e.Matches <= 0 {
		return "本次活动未出勤"
	}
	if e.Matches < 3 {
		return "样本不足，仅展示数据，暂不下定论"
	}

	hasTel := e.TelemetryMatches > 0 && avg.hasTelemetry
	adr := e.AvgDamage
	kpg := e.KPG
	dmgTaken := e.AvgDamageTaken
	trade := e.TradeRatio
	timePM := e.TimeAlive / float64(e.Matches)
	deathPM := float64(e.Deaths) / float64(e.Matches)

	// 优先匹配强势文案
	if avg.avgADR > 0 && adr > avg.avgADR*1.2 && avg.avgKPG > 0 && kpg > avg.avgKPG*1.2 && (!hasTel || trade >= 1.0) {
		return "输出和击杀都明显高于队伍均值，正面对抗能力强"
	}
	if hasTel && avg.avgDmgTaken > 0 && dmgTaken < avg.avgDmgTaken*0.75 &&
		avg.avgADR > 0 && adr >= avg.avgADR*0.85 && trade >= 1.2 {
		return "输出效率好，暴露少，适合架枪和压制"
	}
	if hasTel && avg.avgDmgTaken > 0 && dmgTaken > avg.avgDmgTaken*1.2 &&
		avg.avgADR > 0 && adr > avg.avgADR*1.1 {
		return "经常负责打开局面，承伤换输出整体不亏"
	}
	if avg.avgTimePerMatch > 0 && timePM > avg.avgTimePerMatch*1.1 &&
		avg.avgADR > 0 && adr >= avg.avgADR*0.9 {
		return "打法稳健，能活到后期，也能提供稳定输出"
	}

	// 问题文案
	if hasTel && avg.avgDmgTaken > 0 && dmgTaken > avg.avgDmgTaken*1.2 &&
		avg.avgADR > 0 && adr < avg.avgADR*0.8 && trade < 0.75 {
		return "接战后换血明显吃亏，正面对抗能力偏弱"
	}
	if avg.avgTimePerMatch > 0 && timePM >= avg.avgTimePerMatch*0.85 &&
		avg.avgADR > 0 && adr < avg.avgADR*0.4 {
		return "活得久，但几乎不参与战斗，更像旁观者"
	}
	if avg.avgTimePerMatch > 0 && timePM < avg.avgTimePerMatch*0.65 &&
		avg.avgADR > 0 && adr < avg.avgADR*0.7 {
		return "容易过早阵亡，死前贡献不足"
	}
	if avg.avgDeathsPerMatch > 0 && deathPM > avg.avgDeathsPerMatch*1.2 &&
		avg.avgADR > 0 && adr < avg.avgADR*0.8 {
		return "接战意愿不低，但收益偏弱，需要提升换血质量"
	}

	return "各项指标接近队伍均值，没有明显短板也没有突出项"
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

	var mvpRegID int64
	for i := range entries {
		if entries[i].Matches > 0 && entries[i].Score > 0 {
			mvpRegID = entries[i].RegID
			break
		}
	}
	applyTags(entries, mvpRegID)
}
