package db

import (
	"database/sql"
	"fmt"
	"strings"

	_ "modernc.org/sqlite"
)

func Open(path string) (*sql.DB, error) {
	var dsn string
	if path == ":memory:" || strings.HasPrefix(path, ":memory:") {
		dsn = "file::memory:?cache=shared&_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=on&mode=memory"
	} else {
		dsn = fmt.Sprintf("file:%s?_journal_mode=WAL&_busy_timeout=5000&_foreign_keys=on", path)
	}
	return openDSN(dsn)
}

// OpenDSN opens a database with a raw DSN (for testing with named in-memory DBs).
func OpenDSN(dsn string) (*sql.DB, error) {
	return openDSN(dsn)
}

func openDSN(dsn string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping sqlite: %w", err)
	}
	return db, nil
}
