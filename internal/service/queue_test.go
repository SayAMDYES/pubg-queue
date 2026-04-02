package service_test

import (
	"database/sql"
	"fmt"
	"sync"
	"testing"

	idb "github.com/SayAMDYES/pubg-queue/internal/db"
	"github.com/SayAMDYES/pubg-queue/internal/service"
)

var testDBCounter int
var testDBMu sync.Mutex

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	testDBMu.Lock()
	testDBCounter++
	n := testDBCounter
	testDBMu.Unlock()

	path := fmt.Sprintf("file:testdb_%d_%s?mode=memory&cache=shared", n, t.Name())
	db, err := idb.OpenDSN(path)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := idb.Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func createEvent(t *testing.T, db *sql.DB, teamCount int) int64 {
	t.Helper()
	res, err := db.Exec(
		`INSERT INTO events (event_date, open, team_count) VALUES (?, 1, ?)`,
		"2024-01-01", teamCount,
	)
	if err != nil {
		t.Fatalf("create event: %v", err)
	}
	id, _ := res.LastInsertId()
	return id
}

func TestAssignSlot_Normal(t *testing.T) {
	db := setupTestDB(t)
	eventID := createEvent(t, db, 1)

	players := []struct{ name, phone string }{
		{"Alice", "13800000001"},
		{"Bob", "13800000002"},
		{"Charlie", "13800000003"},
		{"Diana", "13800000004"},
	}
	for _, p := range players {
		_, status, _, err := service.RegisterUserWithToken(db, eventID, p.name, p.phone, true)
		if err != nil {
			t.Fatalf("register %s: %v", p.name, err)
		}
		if status != "assigned" {
			t.Errorf("expected assigned for %s, got %s", p.name, status)
		}
	}

	var cnt int
	db.QueryRow(`SELECT COUNT(*) FROM registrations WHERE event_id=? AND status='assigned'`, eventID).Scan(&cnt)
	if cnt != 4 {
		t.Errorf("expected 4 assigned, got %d", cnt)
	}
}

func TestAssignSlot_Full(t *testing.T) {
	db := setupTestDB(t)
	eventID := createEvent(t, db, 1)

	for i := 0; i < 4; i++ {
		name := []string{"P1", "P2", "P3", "P4"}[i]
		phone := fmt.Sprintf("1380000000%d", i+1)
		_, _, _, err := service.RegisterUserWithToken(db, eventID, name, phone, true)
		if err != nil {
			t.Fatalf("register: %v", err)
		}
	}

	_, status, _, err := service.RegisterUserWithToken(db, eventID, "P5", "13800000005", true)
	if err != nil {
		t.Fatalf("register P5: %v", err)
	}
	if status != "waitlist" {
		t.Errorf("expected waitlist, got %s", status)
	}
}

func TestLeaveAndPromote(t *testing.T) {
	db := setupTestDB(t)
	eventID := createEvent(t, db, 1)

	var firstTokenHash string
	for i := 0; i < 4; i++ {
		name := []string{"P1", "P2", "P3", "P4"}[i]
		phone := fmt.Sprintf("1380000000%d", i+1)
		_, _, _, err := service.RegisterUserWithToken(db, eventID, name, phone, true)
		if err != nil {
			t.Fatalf("register %s: %v", name, err)
		}
		if i == 0 {
			db.QueryRow(`SELECT leave_token_hash FROM registrations WHERE name='P1' AND event_id=?`, eventID).Scan(&firstTokenHash)
		}
	}

	_, _, _, err := service.RegisterUserWithToken(db, eventID, "P5", "13800000005", true)
	if err != nil {
		t.Fatalf("register P5: %v", err)
	}

	leftName, promotedName, err := service.LeaveAndPromote(db, firstTokenHash)
	if err != nil {
		t.Fatalf("leave: %v", err)
	}
	if leftName != "P1" {
		t.Errorf("expected leftName=P1, got %s", leftName)
	}
	if promotedName != "P5" {
		t.Errorf("expected promotedName=P5, got %s", promotedName)
	}

	var status string
	db.QueryRow(`SELECT status FROM registrations WHERE name='P5' AND event_id=?`, eventID).Scan(&status)
	if status != "assigned" {
		t.Errorf("expected P5 assigned, got %s", status)
	}
}

func TestConcurrentRegister(t *testing.T) {
	db := setupTestDB(t)
	eventID := createEvent(t, db, 1)

	const n = 20
	var wg sync.WaitGroup
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func(i int) {
			defer wg.Done()
			name := []string{
				"A1", "A2", "A3", "A4", "A5",
				"B1", "B2", "B3", "B4", "B5",
				"C1", "C2", "C3", "C4", "C5",
				"D1", "D2", "D3", "D4", "D5",
			}[i]
			phone := fmt.Sprintf("138%08d", i+1)
			service.RegisterUserWithToken(db, eventID, name, phone, true)
		}(i)
	}
	wg.Wait()

	var assignedCnt int
	db.QueryRow(`SELECT COUNT(*) FROM registrations WHERE event_id=? AND status='assigned'`, eventID).Scan(&assignedCnt)
	if assignedCnt > 4 {
		t.Errorf("over-assigned: %d > 4", assignedCnt)
	}
}

func TestPhoneUniqueness(t *testing.T) {
	db := setupTestDB(t)
	eventID := createEvent(t, db, 2)

	// 第一次报名成功
	_, _, _, err := service.RegisterUserWithToken(db, eventID, "Alice", "13800000001", true)
	if err != nil {
		t.Fatalf("first register: %v", err)
	}

	// 同一手机号再次报名应该失败
	_, _, _, err = service.RegisterUserWithToken(db, eventID, "AliceDup", "13800000001", true)
	if err == nil {
		t.Error("expected error for duplicate phone, got nil")
	}
}

func TestTokenHash(t *testing.T) {
	plain, hash, salt, err := service.GenerateLeaveToken()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	// 6位数字码
	if len(plain) != 6 {
		t.Errorf("expected 6-digit token, got %q (len=%d)", plain, len(plain))
	}
	for _, c := range plain {
		if c < '0' || c > '9' {
			t.Errorf("token contains non-digit character: %q", plain)
		}
	}
	if !service.VerifyToken(plain, hash, salt) {
		t.Error("VerifyToken failed for valid token")
	}
	if service.VerifyToken("999999", hash, salt) && plain != "999999" {
		t.Error("VerifyToken should fail for wrong token")
	}
}

func TestMaskPhone(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"13800005678", "138****5678"},
		{"15912345678", "159****5678"},
		{"", ""},
		{"123", "123"},
	}
	for _, c := range cases {
		got := service.MaskPhone(c.input)
		if got != c.expected {
			t.Errorf("MaskPhone(%q) = %q, want %q", c.input, got, c.expected)
		}
	}
}
