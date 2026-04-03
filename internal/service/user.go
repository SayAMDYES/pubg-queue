package service

import (
	"database/sql"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

// GetOrCreateUser 用手机号+密码登录或注册。
// 若手机号不存在：创建账号，返回 (user, true, nil)。
// 若手机号存在：校验密码，返回 (user, false, nil) 或 (nil, false, err)。
func GetOrCreateUser(db *sql.DB, phone, password string) (id int64, isNew bool, err error) {
	if !ValidatePhone(phone) {
		return 0, false, fmt.Errorf("invalid_phone")
	}
	if len(password) < 6 {
		return 0, false, fmt.Errorf("password_too_short")
	}

	var existingID int64
	var existingHash string
	row := db.QueryRow(`SELECT id, password_hash FROM users WHERE phone=?`, phone)
	scanErr := row.Scan(&existingID, &existingHash)

	if scanErr == sql.ErrNoRows {
		// 新用户：创建账号
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return 0, false, fmt.Errorf("hash password: %w", err)
		}
		res, err := db.Exec(
			`INSERT INTO users (phone, password_hash) VALUES (?,?)`,
			phone, string(hash),
		)
		if err != nil {
			return 0, false, fmt.Errorf("create user: %w", err)
		}
		newID, _ := res.LastInsertId()
		return newID, true, nil
	}
	if scanErr != nil {
		return 0, false, fmt.Errorf("query user: %w", scanErr)
	}

	// 已有账号：校验密码
	if err := bcrypt.CompareHashAndPassword([]byte(existingHash), []byte(password)); err != nil {
		return 0, false, fmt.Errorf("wrong_password")
	}
	return existingID, false, nil
}

// GetUserByPhone 通过手机号查找用户（不校验密码）。
func GetUserByPhone(db *sql.DB, phone string) (id int64, exists bool, err error) {
	var uid int64
	row := db.QueryRow(`SELECT id FROM users WHERE phone=?`, phone)
	if err := row.Scan(&uid); err == sql.ErrNoRows {
		return 0, false, nil
	} else if err != nil {
		return 0, false, err
	}
	return uid, true, nil
}

// GetUserGameNames 返回用户最近使用的游戏昵称（最多10条，按使用时间倒序）。
func GetUserGameNames(db *sql.DB, userID int64) ([]string, error) {
	rows, err := db.Query(
		`SELECT game_name FROM user_game_names WHERE user_id=? ORDER BY last_used_at DESC LIMIT 10`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			names = append(names, name)
		}
	}
	return names, nil
}

// UpsertGameName 记录或更新用户使用的游戏昵称（用于下拉历史）。
func UpsertGameName(db *sql.DB, userID int64, gameName string) error {
	_, err := db.Exec(`
		INSERT INTO user_game_names (user_id, game_name, used_count, last_used_at)
		VALUES (?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		ON CONFLICT(user_id, game_name) DO UPDATE SET
			used_count   = used_count + 1,
			last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
	`, userID, gameName)
	return err
}
