package service

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"fmt"
	"math/big"
	"time"
	"regexp"
)

var nameRe = regexp.MustCompile(`^[a-zA-Z0-9\x{4e00}-\x{9fff}\x{3400}-\x{4dbf}_ \-]{1,20}$`)
var phoneRe = regexp.MustCompile(`^1[3-9]\d{9}$`)

const slotsPerTeam = 4

func ValidateName(name string) bool {
	return nameRe.MatchString(name)
}

func ValidatePhone(phone string) bool {
	return phoneRe.MatchString(phone)
}

// MaskPhone 脱敏手机号：保留前3位和后4位，中间用 **** 替换
// 例如：13800005678 → 138****5678
func MaskPhone(phone string) string {
	if len(phone) != 11 {
		return phone
	}
	return phone[:3] + "****" + phone[7:]
}

// GenerateLeaveToken 生成6位随机纯数字离队码（000000~999999），返回明文和 SHA-256 哈希
func GenerateLeaveToken() (plaintext, hash, salt string, err error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return
	}
	plaintext = fmt.Sprintf("%06d", n.Int64())
	hash = tokenHash(plaintext)
	salt = ""
	return
}

// GenerateLeaveTokenHash 根据明文计算哈希（用于离队时查找）
func GenerateLeaveTokenHash(plaintext string) (_, hash, salt string, _ error) {
	return plaintext, tokenHash(plaintext), "", nil
}

func tokenHash(plaintext string) string {
	h := sha256.Sum256([]byte(plaintext))
	return hex.EncodeToString(h[:])
}

// VerifyToken 校验明文令牌是否与存储的哈希匹配
func VerifyToken(plaintext, hash, _ string) bool {
	expected := tokenHash(plaintext)
	return subtle.ConstantTimeCompare([]byte(expected), []byte(hash)) == 1
}

// Register 向活动报名，userID=0 表示匿名（旧兼容模式）。
// 返回 (regID, status, plainToken, err)。
func Register(db *sql.DB, eventID, userID int64, name, phone string, allowDup bool) (regID int64, status, plainToken string, err error) {
	if !ValidateName(name) {
		return 0, "", "", fmt.Errorf("invalid_name")
	}
	if !ValidatePhone(phone) {
		return 0, "", "", fmt.Errorf("invalid_phone")
	}

	tx, err := db.Begin()
	if err != nil {
		return 0, "", "", fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	var open int
	var teamCount int
	var endTime string
	var ended int
	row := tx.QueryRow(`SELECT open, team_count, COALESCE(end_time,''), COALESCE(ended,0) FROM events WHERE id = ?`, eventID)
	if err = row.Scan(&open, &teamCount, &endTime, &ended); err != nil {
		return 0, "", "", fmt.Errorf("fetch event: %w", err)
	}
	if open == 0 {
		return 0, "", "", fmt.Errorf("event_closed")
	}
	if ended == 1 {
		return 0, "", "", fmt.Errorf("event_ended")
	}
	if endTime != "" {
		if t, parseErr := time.ParseInLocation("2006-01-02T15:04", endTime, time.Local); parseErr == nil && time.Now().After(t) {
			return 0, "", "", fmt.Errorf("event_ended")
		}
	}

	// 手机号唯一性检测（同一活动同一手机号只能报名一次）
	var phoneCnt int
	if err = tx.QueryRow(`SELECT COUNT(*) FROM registrations WHERE event_id=? AND phone=? AND status != 'cancelled'`, eventID, phone).Scan(&phoneCnt); err != nil {
		return 0, "", "", fmt.Errorf("check phone dup: %w", err)
	}
	if phoneCnt > 0 {
		return 0, "", "", fmt.Errorf("phone_already_registered")
	}

	// 用户ID唯一性检测（同一活动同一账号只能报名一次）
	if userID > 0 {
		var userCnt int
		if err = tx.QueryRow(`SELECT COUNT(*) FROM registrations WHERE event_id=? AND user_id=? AND status != 'cancelled'`, eventID, userID).Scan(&userCnt); err != nil {
			return 0, "", "", fmt.Errorf("check user dup: %w", err)
		}
		if userCnt > 0 {
			return 0, "", "", fmt.Errorf("phone_already_registered")
		}
	}

	if !allowDup {
		var cnt int
		if err = tx.QueryRow(`SELECT COUNT(*) FROM registrations WHERE event_id=? AND name=? AND status != 'cancelled'`, eventID, name).Scan(&cnt); err != nil {
			return 0, "", "", fmt.Errorf("check dup: %w", err)
		}
		if cnt > 0 {
			return 0, "", "", fmt.Errorf("name_already_registered")
		}
	}

	var assignedCount int
	if err = tx.QueryRow(`SELECT COUNT(*) FROM registrations WHERE event_id=? AND status='assigned'`, eventID).Scan(&assignedCount); err != nil {
		return 0, "", "", fmt.Errorf("count assigned: %w", err)
	}

	capacity := teamCount * slotsPerTeam

	var tokenHashVal, tokenSalt string
	plainToken, tokenHashVal, tokenSalt, err = GenerateLeaveToken()
	if err != nil {
		return 0, "", "", fmt.Errorf("generate token: %w", err)
	}

	// userIDArg: nil for anonymous, non-nil for linked user
	var userIDArg interface{}
	if userID > 0 {
		userIDArg = userID
	}

	if assignedCount < capacity {
		teamNo, slotNo := findNextSlot(tx, eventID, teamCount)
		var res sql.Result
		res, err = tx.Exec(
			`INSERT INTO registrations (event_id, user_id, name, phone, status, team_no, slot_no, leave_token_hash, leave_token_salt) VALUES (?,?,?,?,?,?,?,?,?)`,
			eventID, userIDArg, name, phone, "assigned", teamNo, slotNo, tokenHashVal, tokenSalt,
		)
		if err != nil {
			return 0, "", "", fmt.Errorf("insert assigned: %w", err)
		}
		regID, _ = res.LastInsertId()
		status = "assigned"
	} else {
		var res sql.Result
		res, err = tx.Exec(
			`INSERT INTO registrations (event_id, user_id, name, phone, status, team_no, slot_no, leave_token_hash, leave_token_salt) VALUES (?,?,?,?,?,NULL,NULL,?,?)`,
			eventID, userIDArg, name, phone, "waitlist", tokenHashVal, tokenSalt,
		)
		if err != nil {
			return 0, "", "", fmt.Errorf("insert waitlist: %w", err)
		}
		regID, _ = res.LastInsertId()
		status = "waitlist"
	}

	if err = tx.Commit(); err != nil {
		return 0, "", "", fmt.Errorf("commit: %w", err)
	}
	return regID, status, plainToken, nil
}

// RegisterUserWithToken 向后兼容包装（匿名报名，无 userID 关联）。
func RegisterUserWithToken(db *sql.DB, eventID int64, name, phone string, allowDup bool) (regID int64, status, plainToken string, err error) {
	return Register(db, eventID, 0, name, phone, allowDup)
}

func findNextSlot(tx *sql.Tx, eventID int64, teamCount int) (teamNo, slotNo int) {
	for t := 1; t <= teamCount; t++ {
		for s := 1; s <= slotsPerTeam; s++ {
			var cnt int
			tx.QueryRow(
				`SELECT COUNT(*) FROM registrations WHERE event_id=? AND team_no=? AND slot_no=? AND status='assigned'`,
				eventID, t, s,
			).Scan(&cnt)
			if cnt == 0 {
				return t, s
			}
		}
	}
	return 1, 1
}

func LeaveAndPromote(db *sql.DB, tokenHash string) (leftName string, promotedName string, err error) {
	tx, err := db.Begin()
	if err != nil {
		return "", "", fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	var regID, eventID int64
	var teamNo, slotNo sql.NullInt64
	var status string
	row := tx.QueryRow(
		`SELECT id, event_id, name, status, team_no, slot_no FROM registrations WHERE leave_token_hash=? AND status != 'cancelled'`,
		tokenHash,
	)
	if err = row.Scan(&regID, &eventID, &leftName, &status, &teamNo, &slotNo); err != nil {
		if err == sql.ErrNoRows {
			return "", "", fmt.Errorf("token not found or already used")
		}
		return "", "", fmt.Errorf("find reg: %w", err)
	}

	promotedName, err = cancelAndPromote(tx, regID, eventID, status, teamNo, slotNo)
	if err != nil {
		return "", "", err
	}

	if err = tx.Commit(); err != nil {
		return "", "", fmt.Errorf("commit: %w", err)
	}
	return leftName, promotedName, nil
}

// LeaveByUser 通过用户账号（userID 或 phone）在指定活动中离队并提升候补。
// userID > 0 时优先按 user_id 查找，否则按 phone 查找（兼容旧数据）。
func LeaveByUser(db *sql.DB, eventID, userID int64, phone string) (leftName string, promotedName string, err error) {
	tx, err := db.Begin()
	if err != nil {
		return "", "", fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	var regID int64
	var teamNo, slotNo sql.NullInt64
	var status string

	// 优先按 user_id 查，其次按 phone 查（旧数据兼容）
	var row *sql.Row
	if userID > 0 {
		row = tx.QueryRow(
			`SELECT id, name, status, team_no, slot_no FROM registrations
			 WHERE event_id=? AND user_id=? AND status != 'cancelled'`,
			eventID, userID,
		)
	} else {
		row = tx.QueryRow(
			`SELECT id, name, status, team_no, slot_no FROM registrations
			 WHERE event_id=? AND phone=? AND user_id IS NULL AND status != 'cancelled'`,
			eventID, phone,
		)
	}
	if err = row.Scan(&regID, &leftName, &status, &teamNo, &slotNo); err != nil {
		if err == sql.ErrNoRows {
			return "", "", fmt.Errorf("registration_not_found")
		}
		return "", "", fmt.Errorf("find reg: %w", err)
	}

	promotedName, err = cancelAndPromote(tx, regID, eventID, status, teamNo, slotNo)
	if err != nil {
		return "", "", err
	}

	if err = tx.Commit(); err != nil {
		return "", "", fmt.Errorf("commit: %w", err)
	}
	return leftName, promotedName, nil
}

// cancelAndPromote 取消报名并提升候补（在事务中执行）。
func cancelAndPromote(tx *sql.Tx, regID, eventID int64, status string, teamNo, slotNo sql.NullInt64) (promotedName string, err error) {
	if _, err = tx.Exec(
		`UPDATE registrations SET status='cancelled', cancelled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
		regID,
	); err != nil {
		return "", fmt.Errorf("cancel reg: %w", err)
	}

	if status == "assigned" && teamNo.Valid && slotNo.Valid {
		var waitID int64
		var waitName string
		waitRow := tx.QueryRow(
			`SELECT id, name FROM registrations WHERE event_id=? AND status='waitlist' ORDER BY created_at ASC LIMIT 1`,
			eventID,
		)
		scanErr := waitRow.Scan(&waitID, &waitName)
		if scanErr == nil {
			if _, err = tx.Exec(
				`UPDATE registrations SET status='assigned', team_no=?, slot_no=? WHERE id=?`,
				teamNo.Int64, slotNo.Int64, waitID,
			); err != nil {
				return "", fmt.Errorf("promote waitlist: %w", err)
			}
			promotedName = waitName
		}
	}
	return promotedName, nil
}
