package db

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
)

func Migrate(db *sql.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS events (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			event_date  TEXT    NOT NULL UNIQUE,
			open        INTEGER NOT NULL DEFAULT 1,
			team_count  INTEGER NOT NULL DEFAULT 2,
			note        TEXT,
			start_time  TEXT,
			end_time    TEXT,
			created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
			updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		)`,
		`CREATE TABLE IF NOT EXISTS registrations (
			id               INTEGER PRIMARY KEY AUTOINCREMENT,
			event_id         INTEGER NOT NULL REFERENCES events(id),
			user_id          INTEGER REFERENCES users(id),
			name             TEXT    NOT NULL,
			phone            TEXT    NOT NULL DEFAULT '',
			status           TEXT    NOT NULL DEFAULT 'assigned',
			team_no          INTEGER,
			slot_no          INTEGER,
			created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
			cancelled_at     TEXT,
			leave_token_hash TEXT    NOT NULL DEFAULT '',
			leave_token_salt TEXT    NOT NULL DEFAULT ''
		)`,
		`CREATE INDEX IF NOT EXISTS idx_reg_event_status    ON registrations(event_id, status, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_reg_event_team_slot ON registrations(event_id, team_no, slot_no)`,
		`CREATE INDEX IF NOT EXISTS idx_reg_token_hash      ON registrations(leave_token_hash)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id         TEXT PRIMARY KEY,
			data       TEXT NOT NULL,
			expires_at TEXT NOT NULL
		)`,
		// 用户账号表（手机号 + 密码）
		`CREATE TABLE IF NOT EXISTS users (
			id            INTEGER PRIMARY KEY AUTOINCREMENT,
			phone         TEXT    NOT NULL UNIQUE,
			password_hash TEXT    NOT NULL,
			created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
			updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		)`,
		// 用户历史游戏昵称（用于下拉快捷填写）
		`CREATE TABLE IF NOT EXISTS user_game_names (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id      INTEGER NOT NULL REFERENCES users(id),
			game_name    TEXT    NOT NULL,
			used_count   INTEGER NOT NULL DEFAULT 1,
			last_used_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
			UNIQUE(user_id, game_name)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_user_game_names ON user_game_names(user_id, last_used_at)`,
		// 登录封禁表（IP 或手机号多次失败后封禁）
		`CREATE TABLE IF NOT EXISTS login_bans (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			ban_key      TEXT    NOT NULL UNIQUE,
			banned_until TEXT,
			fail_count   INTEGER NOT NULL DEFAULT 0,
			last_fail_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
	}

	// 兼容旧数据库：添加缺失的列（若列已存在则忽略）
	alterStmts := []string{
		`ALTER TABLE events ADD COLUMN start_time TEXT`,
		`ALTER TABLE events ADD COLUMN end_time TEXT`,
		`ALTER TABLE registrations ADD COLUMN phone TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE registrations ADD COLUMN user_id INTEGER REFERENCES users(id)`,
	}
	for _, s := range alterStmts {
		if _, err := db.Exec(s); err != nil {
			// 忽略"列已存在"错误，其他错误记录日志
			if !isDuplicateColumnError(err) {
				log.Printf("migrate alter warning: %v", err)
			}
		}
	}

	return nil
}

// isDuplicateColumnError 判断 ALTER TABLE 错误是否为"列已存在"
func isDuplicateColumnError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate column name")
}
