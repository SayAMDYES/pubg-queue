package service_test

import (
	"testing"

	"github.com/SayAMDYES/pubg-queue/internal/service"
)

func TestGetOrCreateUser_NewUser(t *testing.T) {
	db := setupTestDB(t)

	id, isNew, err := service.GetOrCreateUser(db, "13800000099", "password123")
	if err != nil {
		t.Fatalf("GetOrCreateUser: %v", err)
	}
	if !isNew {
		t.Error("expected isNew=true for first-time phone")
	}
	if id == 0 {
		t.Error("expected non-zero userID")
	}
}

func TestGetOrCreateUser_ExistingUser_CorrectPassword(t *testing.T) {
	db := setupTestDB(t)

	id1, _, err := service.GetOrCreateUser(db, "13800000088", "mypass99")
	if err != nil {
		t.Fatalf("first create: %v", err)
	}

	id2, isNew, err := service.GetOrCreateUser(db, "13800000088", "mypass99")
	if err != nil {
		t.Fatalf("second login: %v", err)
	}
	if isNew {
		t.Error("expected isNew=false for existing user")
	}
	if id1 != id2 {
		t.Errorf("userID mismatch: %d vs %d", id1, id2)
	}
}

func TestGetOrCreateUser_WrongPassword(t *testing.T) {
	db := setupTestDB(t)

	_, _, err := service.GetOrCreateUser(db, "13800000077", "correctpass")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	_, _, err = service.GetOrCreateUser(db, "13800000077", "wrongpass")
	if err == nil {
		t.Error("expected error for wrong password")
	}
	if err.Error() != "wrong_password" {
		t.Errorf("expected wrong_password error, got %v", err)
	}
}

func TestGetOrCreateUser_ShortPassword(t *testing.T) {
	db := setupTestDB(t)

	_, _, err := service.GetOrCreateUser(db, "13800000066", "abc")
	if err == nil {
		t.Error("expected error for short password")
	}
	if err.Error() != "password_too_short" {
		t.Errorf("expected password_too_short, got %v", err)
	}
}

func TestGameNames(t *testing.T) {
	db := setupTestDB(t)

	userID, _, err := service.GetOrCreateUser(db, "13800000055", "somepass")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	if err := service.UpsertGameName(db, userID, "PlayerOne"); err != nil {
		t.Fatalf("upsert name 1: %v", err)
	}
	if err := service.UpsertGameName(db, userID, "PlayerTwo"); err != nil {
		t.Fatalf("upsert name 2: %v", err)
	}
	// duplicate upsert should update count
	if err := service.UpsertGameName(db, userID, "PlayerOne"); err != nil {
		t.Fatalf("upsert name 1 again: %v", err)
	}

	names, err := service.GetUserGameNames(db, userID)
	if err != nil {
		t.Fatalf("get names: %v", err)
	}
	if len(names) < 2 {
		t.Errorf("expected at least 2 names, got %d", len(names))
	}
}

func TestRegisterWithUserID(t *testing.T) {
	db := setupTestDB(t)
	eventID := createEvent(t, db, 1)

	userID, _, err := service.GetOrCreateUser(db, "13900000001", "pass123")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	_, status, _, err := service.Register(db, eventID, userID, "HeroPlayer", "13900000001", false)
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	if status != "assigned" {
		t.Errorf("expected assigned, got %s", status)
	}

	// Same user can't register twice
	_, _, _, err = service.Register(db, eventID, userID, "HeroPlayer2", "13900000001", false)
	if err == nil {
		t.Error("expected error for duplicate registration")
	}
}

func TestLeaveByUser(t *testing.T) {
	db := setupTestDB(t)
	eventID := createEvent(t, db, 1)

	// Register 4 players to fill slots
	phones := []string{"13900000011", "13900000012", "13900000013", "13900000014"}
	names := []string{"A", "B", "C", "D"}
	for i := 0; i < 4; i++ {
		userID, _, _ := service.GetOrCreateUser(db, phones[i], "pass123")
		service.Register(db, eventID, userID, names[i], phones[i], true)
	}

	// Register waitlist
	userID5, _, _ := service.GetOrCreateUser(db, "13900000015", "pass123")
	service.Register(db, eventID, userID5, "E", "13900000015", true)

	// User1 leaves by userID
	userID1, _, _ := service.GetOrCreateUser(db, "13900000011", "pass123")
	leftName, promotedName, err := service.LeaveByUser(db, eventID, userID1, "13900000011")
	if err != nil {
		t.Fatalf("LeaveByUser: %v", err)
	}
	if leftName != "A" {
		t.Errorf("expected leftName=A, got %s", leftName)
	}
	if promotedName != "E" {
		t.Errorf("expected promotedName=E, got %s", promotedName)
	}
}
