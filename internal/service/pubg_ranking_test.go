package service

import (
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

func TestFinalizeRankings_HandlesAttendanceAndSampleConfidence(t *testing.T) {
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

	// 仅出勤 2 局：出勤率 0.4 → 应贴 low_attendance；样本 < 3 局也应有 sample_scarce
	if !findTagCode(byName["Latecomer"].Tags, TagAttendance) {
		t.Errorf("Latecomer (0.4 attendance) expected low_attendance tag, got %+v", byName["Latecomer"].Tags)
	}
	if !findTagCode(byName["Latecomer"].Tags, TagSampleScarce) {
		t.Errorf("Latecomer (2 matches) expected sample_scarce tag, got %+v", byName["Latecomer"].Tags)
	}

	// 仅出勤 1 局 → 置信度极低
	if byName["Skipper"].Confidence != ConfidenceVeryLow {
		t.Errorf("Skipper expected confidence very_low, got %q", byName["Skipper"].Confidence)
	}
	// 出勤 5 局 → 中等置信度
	if byName["Regular"].Confidence != ConfidenceLow && byName["Regular"].Confidence != ConfidenceMedium {
		t.Errorf("Regular expected confidence low/medium, got %q", byName["Regular"].Confidence)
	}

	// AttendanceRate 计算正确
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

func TestPickPrimaryTitle_IgnoresMVPAndAttendance(t *testing.T) {
	tags := []RankTag{
		makeTag(TagMVP),
		makeTag(TagAttendance),
		makeTag(TagSampleScarce),
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
