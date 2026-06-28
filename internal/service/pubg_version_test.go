package service

import (
	"testing"

	idb "github.com/SayAMDYES/pubg-queue/internal/db"
)

func TestRankingAnalysisVersionPersistence(t *testing.T) {
	db, err := idb.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if err := idb.Migrate(db); err != nil {
		t.Fatal(err)
	}

	eventResult, err := db.Exec(`INSERT INTO events (event_date) VALUES ('2026-06-28')`)
	if err != nil {
		t.Fatal(err)
	}
	eventID, err := eventResult.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}

	registrationResult, err := db.Exec(`INSERT INTO registrations (event_id, name) VALUES (?, 'player')`, eventID)
	if err != nil {
		t.Fatal(err)
	}
	registrationID, err := registrationResult.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}

	if _, err := db.Exec(`
		INSERT INTO event_rankings_v2 (event_id, reg_id, game_name, rank_no)
		VALUES (?, ?, 'player', 1)
	`, eventID, registrationID); err != nil {
		t.Fatal(err)
	}

	entries, err := GetEventRankings(db, eventID)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].AnalysisVersion != "v3" {
		t.Fatalf("expected legacy ranking version v3, got %+v", entries)
	}

	if err := persistRankingsV2(db, eventID, []RankEntry{{
		RegID:           registrationID,
		GameName:        "player",
		AnalysisVersion: currentAnalysisVersion,
	}}); err != nil {
		t.Fatal(err)
	}

	entries, err = GetEventRankings(db, eventID)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].AnalysisVersion != currentAnalysisVersion {
		t.Fatalf("expected current ranking version %s, got %+v", currentAnalysisVersion, entries)
	}
}
