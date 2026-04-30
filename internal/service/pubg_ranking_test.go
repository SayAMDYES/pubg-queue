package service

import (
	"math"
	"strings"
	"testing"
)

func findTagCode(tags []RankTag, code string) bool {
	for _, t := range tags {
		if t.Code == code {
			return true
		}
	}
	return false
}

// 构造一个常见的 4 人队，含明显风格差异，便于验证标签和评分。
func sampleEntries() []RankEntry {
	return []RankEntry{
		{
			RegID: 1, GameName: "Ace", Matches: 10, EventMatches: 10,
			Kills: 30, Deaths: 6, Assists: 6, DBNOs: 12, HeadshotKills: 8, Top10Count: 6,
			TotalDamage: 2200, TimeAlive: 9000,
			TelemetryMatches: 10, TelemetryDamage: 2200, DamageTaken: 1400, FireCount: 800,
		},
		{
			RegID: 2, GameName: "Steady", Matches: 10, EventMatches: 10,
			Kills: 14, Deaths: 4, Assists: 8, DBNOs: 8, HeadshotKills: 4, Top10Count: 7,
			TotalDamage: 1500, TimeAlive: 11000,
			TelemetryMatches: 10, TelemetryDamage: 1500, DamageTaken: 900, FireCount: 700,
		},
		{
			RegID: 3, GameName: "Reporter", Matches: 10, EventMatches: 10,
			Kills: 1, Deaths: 9, Assists: 1, DBNOs: 0, HeadshotKills: 0, Top10Count: 5,
			TotalDamage: 250, TimeAlive: 9000,
			TelemetryMatches: 10, TelemetryDamage: 250, DamageTaken: 600, FireCount: 200,
		},
		{
			RegID: 4, GameName: "Box", Matches: 10, EventMatches: 10,
			Kills: 3, Deaths: 10, Assists: 1, DBNOs: 1, HeadshotKills: 0, Top10Count: 1,
			TotalDamage: 400, TimeAlive: 3000,
			TelemetryMatches: 10, TelemetryDamage: 400, DamageTaken: 1700, FireCount: 600,
		},
	}
}

// 复现真实 4 人活动中“第一名 80+、后面都在 30 左右”的断层场景。
func smallLobbyCliffEntries() []RankEntry {
	return []RankEntry{
		{
			RegID: 1, GameName: "1A6c", Matches: 13, EventMatches: 13,
			Kills: 20, Deaths: 13, Assists: 8, DBNOs: 19, Revives: 3, HeadshotKills: 4, Top10Count: 4,
			TotalDamage: 2594.5384359999993, TimeAlive: 8229,
			TelemetryMatches: 13, TelemetryDamage: 2620.506456, DamageTaken: 2839.152038663629, FireCount: 2400,
		},
		{
			RegID: 2, GameName: "Jesus331", Matches: 13, EventMatches: 13,
			Kills: 16, Deaths: 13, Assists: 4, DBNOs: 16, Revives: 2, HeadshotKills: 3, Top10Count: 4,
			TotalDamage: 2112.95396, TimeAlive: 7470,
			TelemetryMatches: 13, TelemetryDamage: 2116.892186, DamageTaken: 2374.727547198539, FireCount: 3150,
		},
		{
			RegID: 3, GameName: "AMD__________YES", Matches: 13, EventMatches: 13,
			Kills: 13, Deaths: 13, Assists: 7, DBNOs: 15, Revives: 3, HeadshotKills: 4, Top10Count: 4,
			TotalDamage: 2032.194595999997, TimeAlive: 7716,
			TelemetryMatches: 13, TelemetryDamage: 2358.021509, DamageTaken: 2626.748614743357, FireCount: 2630,
		},
		{
			RegID: 4, GameName: "theming-0315", Matches: 13, EventMatches: 13,
			Kills: 14, Deaths: 13, Assists: 5, DBNOs: 13, Revives: 11, HeadshotKills: 5, Top10Count: 4,
			TotalDamage: 1651.48402300001, TimeAlive: 8611,
			TelemetryMatches: 13, TelemetryDamage: 1701.5794460812018, DamageTaken: 2747.87522593141, FireCount: 2210,
		},
	}
}

func TestFinalizeRankings_AssignsTagsAndScores(t *testing.T) {
	entries := sampleEntries()
	FinalizeRankings(entries, "full_ready")

	if len(entries) != 4 {
		t.Fatalf("expected 4 entries, got %d", len(entries))
	}

	// 每个 entry 必须填好 4 项子分和置信度。
	for _, e := range entries {
		if e.AnalysisStatus != "full_ready" {
			t.Errorf("%s: expected analysis_status=full_ready, got %q", e.GameName, e.AnalysisStatus)
		}
		if e.Confidence == "" {
			t.Errorf("%s: confidence should not be empty", e.GameName)
		}
		if e.CombatScore < 0 || e.CombatScore > 100 {
			t.Errorf("%s: combat score out of [0,100]: %.2f", e.GameName, e.CombatScore)
		}
		if e.EfficiencyScore < 0 || e.EfficiencyScore > 100 {
			t.Errorf("%s: efficiency score out of [0,100]: %.2f", e.GameName, e.EfficiencyScore)
		}
		if e.SurvivalScore < 0 || e.SurvivalScore > 100 {
			t.Errorf("%s: survival score out of [0,100]: %.2f", e.GameName, e.SurvivalScore)
		}
		if e.TeamScore < 0 || e.TeamScore > 100 {
			t.Errorf("%s: team score out of [0,100]: %.2f", e.GameName, e.TeamScore)
		}
		if len(e.Tags) == 0 {
			t.Errorf("%s: expected at least one tag", e.GameName)
		}
	}

	byName := make(map[string]RankEntry, len(entries))
	for _, e := range entries {
		byName[e.GameName] = e
	}

	if !findTagCode(byName["Ace"].Tags, TagAce) {
		t.Errorf("Ace should be tagged 'ace', got %+v", byName["Ace"].Tags)
	}
	if !findTagCode(byName["Reporter"].Tags, TagReporter) {
		t.Errorf("Reporter should be tagged 'reporter', got %+v", byName["Reporter"].Tags)
	}
	if !findTagCode(byName["Box"].Tags, TagBoxKing) {
		t.Errorf("Box should be tagged 'box_king', got %+v", byName["Box"].Tags)
	}

	// Ace 应该综合分最高，排第一并被标 MVP。
	if byName["Ace"].RankNo != 1 {
		t.Errorf("expected Ace at rank 1, got rank %d", byName["Ace"].RankNo)
	}
	if !findTagCode(byName["Ace"].Tags, TagMVP) {
		t.Errorf("Ace as rank #1 should carry MVP tag, got %+v", byName["Ace"].Tags)
	}
	// Box 应该综合分最低。
	if byName["Box"].RankNo != 4 {
		t.Errorf("expected Box at rank 4, got rank %d", byName["Box"].RankNo)
	}
}

func TestFinalizeRankings_CompressesSmallLobbyScoreCliff(t *testing.T) {
	entries := smallLobbyCliffEntries()
	FinalizeRankings(entries, "full_ready")

	if entries[0].GameName != "1A6c" {
		t.Fatalf("expected 1A6c to remain rank 1, got %s", entries[0].GameName)
	}

	gap12 := entries[0].Score - entries[1].Score
	if gap12 >= 35 {
		t.Fatalf("expected top-two score gap to be compressed below 35, got %.2f", gap12)
	}

	if entries[1].Score < 40 {
		t.Fatalf("expected middle tier to avoid collapsing into the 30-point range, got %.2f", entries[1].Score)
	}

	gap23 := math.Abs(entries[1].Score - entries[2].Score)
	if gap23 >= 10 {
		t.Fatalf("expected second and third place to stay relatively close, got %.2f", gap23)
	}

	if entries[0].Score <= entries[1].Score {
		t.Fatalf("expected rank 1 score to stay above rank 2: %.2f <= %.2f", entries[0].Score, entries[1].Score)
	}
}

func TestFinalizeRankings_AssignsClearerTagsForSmallLobby(t *testing.T) {
	entries := smallLobbyCliffEntries()
	FinalizeRankings(entries, "full_ready")

	byName := make(map[string]RankEntry, len(entries))
	for _, e := range entries {
		byName[e.GameName] = e
	}

	if !findTagCode(byName["1A6c"].Tags, TagAce) {
		t.Fatalf("1A6c should keep ace tag, got %+v", byName["1A6c"].Tags)
	}
	if !findTagCode(byName["Jesus331"].Tags, TagBalanced) {
		t.Fatalf("Jesus331 should remain balanced, got %+v", byName["Jesus331"].Tags)
	}
	if !findTagCode(byName["AMD__________YES"].Tags, TagFinisher) {
		t.Fatalf("AMD__________YES should be tagged finisher, got %+v", byName["AMD__________YES"].Tags)
	}
	if findTagCode(byName["AMD__________YES"].Tags, TagBalanced) {
		t.Fatalf("AMD__________YES should no longer fall back to balanced, got %+v", byName["AMD__________YES"].Tags)
	}
	if !findTagCode(byName["theming-0315"].Tags, TagMedic) {
		t.Fatalf("theming-0315 should be tagged medic, got %+v", byName["theming-0315"].Tags)
	}
	if byName["theming-0315"].PrimaryTitle == nil || byName["theming-0315"].PrimaryTitle.Code != TagMedic {
		t.Fatalf("theming-0315 primary title should be medic, got %+v", byName["theming-0315"].PrimaryTitle)
	}
	balancedCount := 0
	for _, e := range entries {
		if findTagCode(e.Tags, TagBalanced) {
			balancedCount++
		}
	}
	if balancedCount != 1 {
		t.Fatalf("expected exactly one balanced tag in the small lobby sample, got %d", balancedCount)
	}
}

func TestFinalizeRankings_DoesNotGrantAceInWeakLobby(t *testing.T) {
	entries := []RankEntry{
		{
			RegID: 1, GameName: "WeakTop", Matches: 10, EventMatches: 10,
			Kills: 1, Deaths: 10, Assists: 1, DBNOs: 1, Top10Count: 1,
			TotalDamage: 420, TimeAlive: 4200,
			TelemetryMatches: 10, TelemetryDamage: 420, DamageTaken: 1100, FireCount: 900,
		},
		{
			RegID: 2, GameName: "Weak2", Matches: 10, EventMatches: 10,
			Kills: 0, Deaths: 10, Assists: 0, DBNOs: 0, Top10Count: 1,
			TotalDamage: 300, TimeAlive: 3900,
			TelemetryMatches: 10, TelemetryDamage: 300, DamageTaken: 1200, FireCount: 920,
		},
		{
			RegID: 3, GameName: "Weak3", Matches: 10, EventMatches: 10,
			Kills: 0, Deaths: 10, Assists: 0, DBNOs: 0, Top10Count: 0,
			TotalDamage: 260, TimeAlive: 3600,
			TelemetryMatches: 10, TelemetryDamage: 260, DamageTaken: 1180, FireCount: 870,
		},
	}

	FinalizeRankings(entries, "full_ready")

	if findTagCode(entries[0].Tags, TagAce) {
		t.Fatalf("weak lobby leader should not receive ace tag, got %+v", entries[0].Tags)
	}
	if findTagCode(entries[0].Tags, TagBalanced) {
		t.Fatalf("weak lobby leader should not fall back to balanced, got %+v", entries[0].Tags)
	}
	if !findTagCode(entries[0].Tags, TagWeak) && !findTagCode(entries[0].Tags, TagBoxKing) {
		t.Fatalf("weak lobby leader should fall into a negative absolute tag, got %+v", entries[0].Tags)
	}
}

func TestFinalizeRankings_HandlesAttendanceAndConfidence(t *testing.T) {
	// 5 局活动，但部分玩家出勤率 / 样本量很低
	entries := []RankEntry{
		{
			RegID: 1, GameName: "Regular", Matches: 5, EventMatches: 5,
			Kills: 10, Deaths: 3, Assists: 4, TotalDamage: 1000, TimeAlive: 4500,
			TelemetryMatches: 5, TelemetryDamage: 1000, DamageTaken: 800, FireCount: 500,
		},
		{
			RegID: 2, GameName: "Latecomer", Matches: 2, EventMatches: 5,
			Kills: 4, Deaths: 1, Assists: 1, TotalDamage: 400, TimeAlive: 1800,
			TelemetryMatches: 2, TelemetryDamage: 400, DamageTaken: 300, FireCount: 200,
		},
		{
			RegID: 3, GameName: "Skipper", Matches: 1, EventMatches: 5,
			Kills: 0, Deaths: 1, Assists: 0, TotalDamage: 50, TimeAlive: 600,
			TelemetryMatches: 0,
		},
	}

	FinalizeRankings(entries, "full_ready")

	byName := make(map[string]RankEntry, len(entries))
	for _, e := range entries {
		byName[e.GameName] = e
	}

	// 仅出勤 1 局 → 置信度极低
	if byName["Skipper"].Confidence != ConfidenceVeryLow {
		t.Errorf("Skipper expected confidence very_low, got %q", byName["Skipper"].Confidence)
	}
	// 出勤 5 局 → 低/中等置信度
	if byName["Regular"].Confidence != ConfidenceLow && byName["Regular"].Confidence != ConfidenceMedium {
		t.Errorf("Regular expected confidence low/medium, got %q", byName["Regular"].Confidence)
	}

	// AttendanceRate / MissedMatches 计算正确
	if got := byName["Latecomer"].AttendanceRate; got < 0.39 || got > 0.41 {
		t.Errorf("Latecomer attendance rate expected ~0.4, got %.3f", got)
	}
	if got := byName["Latecomer"].MissedMatches; got != 3 {
		t.Errorf("Latecomer missed matches expected 3, got %d", got)
	}
}

func TestFinalizeRankings_AnalysisStatusBasicReadyKeepsTagsButNoTelemetry(t *testing.T) {
	entries := []RankEntry{
		{RegID: 1, GameName: "A", Matches: 6, EventMatches: 6, Kills: 15, Deaths: 3, Assists: 2, TotalDamage: 1300, TimeAlive: 5400},
		{RegID: 2, GameName: "B", Matches: 6, EventMatches: 6, Kills: 4, Deaths: 6, Assists: 1, TotalDamage: 400, TimeAlive: 2400},
	}
	FinalizeRankings(entries, "basic_ready")

	for _, e := range entries {
		if e.AnalysisStatus != "basic_ready" {
			t.Errorf("%s: expected basic_ready, got %q", e.GameName, e.AnalysisStatus)
		}
		// 没有 telemetry → 效率分应退化为 ADR/KDA 的相对值，但仍应 > 0 或 = 0，不是 NaN
		if e.EfficiencyScore < 0 || e.EfficiencyScore > 100 {
			t.Errorf("%s: efficiency score out of range without telemetry: %.2f", e.GameName, e.EfficiencyScore)
		}
	}
}

func TestPickPrimaryTitle_PrefersStrongTags(t *testing.T) {
	tags := []RankTag{
		makeTag(TagBalanced),
		makeTag(TagAce),
		makeTag(TagBoxKing),
	}
	primary := pickPrimaryTitle(tags)
	if primary == nil {
		t.Fatalf("expected a primary title, got nil")
	}
	if primary.Code != TagAce {
		t.Errorf("expected primary=ace (highest priority), got %s", primary.Code)
	}
}

func TestPickPrimaryTitle_IgnoresMVP(t *testing.T) {
	tags := []RankTag{
		makeTag(TagMVP),
		makeTag(TagBalanced),
	}
	primary := pickPrimaryTitle(tags)
	if primary == nil {
		t.Fatalf("expected balanced primary, got nil")
	}
	if primary.Code != TagBalanced {
		t.Errorf("expected primary=balanced, got %s", primary.Code)
	}
}

func TestComputeConfidence(t *testing.T) {
	cases := map[int]string{
		0:  ConfidenceVeryLow,
		2:  ConfidenceVeryLow,
		3:  ConfidenceLow,
		5:  ConfidenceLow,
		6:  ConfidenceMedium,
		10: ConfidenceHigh,
		20: ConfidenceVeryHigh,
	}
	for matches, want := range cases {
		if got := computeConfidence(matches); got != want {
			t.Errorf("computeConfidence(%d)=%q, want %q", matches, got, want)
		}
	}
}

func TestComposeComment_DoesNotFlattenWeakPlayerToBalanced(t *testing.T) {
	avg := teamAverages{
		avgADR:            141.59,
		avgKPG:            1.04,
		avgDmgTaken:       176.94,
		avgTradeRatio:     0.85,
		avgTimePerMatch:   486.72,
		avgDeathsPerMatch: 0.97,
		hasTelemetry:      true,
	}

	entry := RankEntry{
		GameName:         "theming-0315",
		Matches:          34,
		Kills:            15,
		Deaths:           33,
		Assists:          6,
		Revives:          6,
		Top10Count:       8,
		TimeAlive:        16557,
		AvgDamage:        65.46,
		AvgDamageTaken:   186.74,
		TradeRatio:       0.40,
		TelemetryMatches: 34,
		Tags:             []RankTag{makeTag(TagWeak)},
		PrimaryTitle:     func() *RankTag { t := makeTag(TagWeak); return &t }(),
	}

	comment := composeComment(entry, avg)
	if comment == "各项指标接近队伍均值，没有明显短板也没有突出项" {
		t.Fatalf("weak player should not receive balanced fallback comment")
	}
	if !strings.Contains(comment, "偏弱") && !strings.Contains(comment, "吃亏") {
		t.Fatalf("weak player comment should describe weakness, got %q", comment)
	}
}

func TestComposeComment_DoesNotFlattenAcePlayerToBalanced(t *testing.T) {
	avg := teamAverages{
		avgADR:        141.59,
		avgKPG:        1.04,
		avgTradeRatio: 0.85,
		hasTelemetry:  true,
	}

	entry := RankEntry{
		GameName:         "Jesus331",
		Matches:          19,
		Kills:            28,
		Deaths:           18,
		TimeAlive:        9500,
		AvgDamage:        183.62,
		TradeRatio:       0.95,
		KPG:              1.47,
		TelemetryMatches: 19,
		Tags:             []RankTag{makeTag(TagAce)},
		PrimaryTitle:     func() *RankTag { t := makeTag(TagAce); return &t }(),
	}

	comment := composeComment(entry, avg)
	if comment == "各项指标接近队伍均值，没有明显短板也没有突出项" {
		t.Fatalf("ace player should not receive balanced fallback comment")
	}
	if !strings.Contains(comment, "输出") && !strings.Contains(comment, "对抗") {
		t.Fatalf("ace player comment should describe strong output, got %q", comment)
	}
}
