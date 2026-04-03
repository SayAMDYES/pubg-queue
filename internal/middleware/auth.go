package middleware

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/SayAMDYES/pubg-queue/internal/config"
	"golang.org/x/crypto/bcrypt"
)

type sessionData struct {
	AdminUser string `json:"admin_user,omitempty"`
	UserID    int64  `json:"user_id,omitempty"`
	UserPhone string `json:"user_phone,omitempty"`
}

// ─── Ban Manager ──────────────────────────────────────────────────────────────

const (
	banMaxFails   = 5
	banDuration   = 24 * time.Hour
	banWindowMins = 10 // 窗口内达到 banMaxFails 则封禁
)

// BanManager 基于数据库的 IP/手机号封禁管理器（持久化，重启后仍有效）。
type BanManager struct {
	db  *sql.DB
	mu  sync.Mutex
}

func NewBanManager(db *sql.DB) *BanManager {
	return &BanManager{db: db}
}

// IsBanned 检查某个 key（IP 或手机号）是否处于封禁状态。
func (b *BanManager) IsBanned(key string) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	var bannedUntil sql.NullString
	err := b.db.QueryRow(`SELECT banned_until FROM login_bans WHERE ban_key=?`, key).Scan(&bannedUntil)
	if err != nil || !bannedUntil.Valid || bannedUntil.String == "" {
		return false
	}
	t, err := time.Parse(time.RFC3339, bannedUntil.String)
	if err != nil {
		return false
	}
	if time.Now().After(t) {
		// 封禁已过期，清除
		b.db.Exec(`UPDATE login_bans SET banned_until=NULL, fail_count=0 WHERE ban_key=?`, key)
		return false
	}
	return true
}

// RecordFailure 记录一次登录失败。失败次数达到阈值则封禁 banDuration。
func (b *BanManager) RecordFailure(key string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	now := time.Now().Format(time.RFC3339)
	b.db.Exec(`
		INSERT INTO login_bans (ban_key, fail_count, last_fail_at)
		VALUES (?, 1, ?)
		ON CONFLICT(ban_key) DO UPDATE SET
			fail_count   = fail_count + 1,
			last_fail_at = ?
	`, key, now, now)

	var failCount int
	b.db.QueryRow(`SELECT fail_count FROM login_bans WHERE ban_key=?`, key).Scan(&failCount)
	if failCount >= banMaxFails {
		bannedUntil := time.Now().Add(banDuration).Format(time.RFC3339)
		b.db.Exec(`UPDATE login_bans SET banned_until=?, fail_count=0 WHERE ban_key=?`, bannedUntil, key)
	}
}

// ClearFailures 清除某个 key 的失败记录（登录成功时调用）。
func (b *BanManager) ClearFailures(key string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.db.Exec(`UPDATE login_bans SET fail_count=0, banned_until=NULL WHERE ban_key=?`, key)
}

// ─── Legacy in-memory ban (kept for admin brute-force, now delegates to BanManager) ─

type loginAttempt struct {
	count       int
	lockedUntil time.Time
}

var (
	loginMu       sync.Mutex
	loginAttempts = map[string]*loginAttempt{}
)

func isLockedOut(ip string) bool {
	loginMu.Lock()
	defer loginMu.Unlock()
	a, ok := loginAttempts[ip]
	if !ok {
		return false
	}
	return time.Now().Before(a.lockedUntil)
}

func recordFailure(ip string) {
	loginMu.Lock()
	defer loginMu.Unlock()
	a, ok := loginAttempts[ip]
	if !ok {
		a = &loginAttempt{}
		loginAttempts[ip] = a
	}
	a.count++
	if a.count >= 5 {
		a.lockedUntil = time.Now().Add(time.Minute)
		a.count = 0
	}
}

func clearFailures(ip string) {
	loginMu.Lock()
	defer loginMu.Unlock()
	delete(loginAttempts, ip)
}

// ─── Session helpers ──────────────────────────────────────────────────────────

func generateSessionID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func getSession(r *http.Request, db *sql.DB, cfg *config.Config) (*sessionData, string, error) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		return nil, "", nil
	}
	sid := cookie.Value

	var dataStr, expiresAt string
	err = db.QueryRow(`SELECT data, expires_at FROM sessions WHERE id=?`, sid).Scan(&dataStr, &expiresAt)
	if err != nil {
		return nil, "", nil
	}

	exp, err := time.Parse(time.RFC3339, expiresAt)
	if err != nil || time.Now().After(exp) {
		db.Exec(`DELETE FROM sessions WHERE id=?`, sid)
		return nil, "", nil
	}

	var data sessionData
	if err := json.Unmarshal([]byte(dataStr), &data); err != nil {
		return nil, "", nil
	}
	return &data, sid, nil
}

func saveSession(w http.ResponseWriter, db *sql.DB, cfg *config.Config, data *sessionData) error {
	sid, err := generateSessionID()
	if err != nil {
		return err
	}
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	expiresAt := time.Now().Add(7 * 24 * time.Hour).Format(time.RFC3339)
	if _, err := db.Exec(`INSERT INTO sessions (id, data, expires_at) VALUES (?,?,?)`, sid, string(b), expiresAt); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    sid,
		Path:     "/",
		HttpOnly: true,
		Secure:   cfg.SecureCookie,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   7 * 86400,
	})
	return nil
}

func deleteSession(w http.ResponseWriter, r *http.Request, db *sql.DB, cfg *config.Config) {
	cookie, err := r.Cookie("session_id")
	if err == nil {
		db.Exec(`DELETE FROM sessions WHERE id=?`, cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   cfg.SecureCookie,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

// GetUserSession 获取当前用户 session（非管理员）。
func GetUserSession(r *http.Request, db *sql.DB, cfg *config.Config) (userID int64, userPhone string) {
	sess, _, _ := getSession(r, db, cfg)
	if sess == nil || sess.UserID == 0 {
		return 0, ""
	}
	return sess.UserID, sess.UserPhone
}

// SaveUserSession 为普通用户保存 session（7天有效）。
func SaveUserSession(w http.ResponseWriter, db *sql.DB, cfg *config.Config, userID int64, phone string) error {
	return saveSession(w, db, cfg, &sessionData{UserID: userID, UserPhone: phone})
}

// ─── Network helpers ──────────────────────────────────────────────────────────

func getClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return xff
	}
	return r.RemoteAddr
}

// ─── Admin AuthMiddleware ─────────────────────────────────────────────────────

func NewAuthMiddleware(db *sql.DB, cfg *config.Config) *AuthMiddleware {
	return &AuthMiddleware{db: db, cfg: cfg, bans: NewBanManager(db)}
}

type AuthMiddleware struct {
	db   *sql.DB
	cfg  *config.Config
	bans *BanManager
}

func (a *AuthMiddleware) RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sess, _, err := getSession(r, a.db, a.cfg)
		if err != nil || sess == nil || sess.AdminUser == "" {
			http.Redirect(w, r, "/admin/login", http.StatusFound)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *AuthMiddleware) LoginPost(w http.ResponseWriter, r *http.Request) {
	ip := getClientIP(r)

	// 使用持久化 BanManager 检查 IP
	if a.bans.IsBanned(ip) {
		http.Error(w, "登录失败次数过多，请24小时后再试。", http.StatusTooManyRequests)
		return
	}
	// 兼容旧的内存限流
	if isLockedOut(ip) {
		http.Error(w, "Too many failed attempts. Please wait 1 minute.", http.StatusTooManyRequests)
		return
	}

	username := r.FormValue("username")
	password := r.FormValue("password")

	if username != config.AdminUsername {
		a.bans.RecordFailure(ip)
		recordFailure(ip)
		http.Redirect(w, r, "/admin/login?err=invalid", http.StatusFound)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(a.cfg.AdminPassHash), []byte(password)); err != nil {
		a.bans.RecordFailure(ip)
		recordFailure(ip)
		http.Redirect(w, r, "/admin/login?err=invalid", http.StatusFound)
		return
	}

	a.bans.ClearFailures(ip)
	clearFailures(ip)

	if err := saveSession(w, a.db, a.cfg, &sessionData{AdminUser: username}); err != nil {
		http.Error(w, "session error", http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/admin", http.StatusFound)
}

func (a *AuthMiddleware) LogoutPost(w http.ResponseWriter, r *http.Request) {
	deleteSession(w, r, a.db, a.cfg)
	http.Redirect(w, r, "/admin/login", http.StatusFound)
}

// GetBanManager 暴露 BanManager 给其他 handler 使用。
func (a *AuthMiddleware) GetBanManager() *BanManager {
	return a.bans
}
