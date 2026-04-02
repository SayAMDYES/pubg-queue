package db

import (
	"database/sql"
	"fmt"
)

func Migrate(db *sql.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS events (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			event_date  TEXT    NOT NULL UNIQUE,
			open        INTEGER NOT NULL DEFAULT 1,
			team_count  INTEGER NOT NULL DEFAULT 2,
			note        TEXT,
			created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
			updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		)`,
		`CREATE TABLE IF NOT EXISTS registrations (
			id               INTEGER PRIMARY KEY AUTOINCREMENT,
			event_id         INTEGER NOT NULL REFERENCES events(id),
			name             TEXT    NOT NULL,
			status           TEXT    NOT NULL DEFAULT 'assigned',
			team_no          INTEGER,
			slot_no          INTEGER,
			created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
			cancelled_at     TEXT,
			leave_token_hash TEXT    NOT NULL,
			leave_token_salt TEXT    NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_reg_event_status    ON registrations(event_id, status, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_reg_event_team_slot ON registrations(event_id, team_no, slot_no)`,
		`CREATE INDEX IF NOT EXISTS idx_reg_token_hash      ON registrations(leave_token_hash)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id         TEXT PRIMARY KEY,
			data       TEXT NOT NULL,
			expires_at TEXT NOT NULL
		)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
	}
	return nil
}
