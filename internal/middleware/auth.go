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
	AdminUser string `json:"admin_user"`
}

type loginAttempt struct {
	count       int
	lockedUntil time.Time
}

var (
	loginMu       sync.Mutex
	loginAttempts = map[string]*loginAttempt{}
)

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
	expiresAt := time.Now().Add(24 * time.Hour).Format(time.RFC3339)
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
		MaxAge:   86400,
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

func getClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return xff
	}
	return r.RemoteAddr
}

func NewAuthMiddleware(db *sql.DB, cfg *config.Config) *AuthMiddleware {
	return &AuthMiddleware{db: db, cfg: cfg}
}

type AuthMiddleware struct {
	db  *sql.DB
	cfg *config.Config
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
	if isLockedOut(ip) {
		http.Error(w, "Too many failed attempts. Please wait 1 minute.", http.StatusTooManyRequests)
		return
	}

	username := r.FormValue("username")
	password := r.FormValue("password")

	if username != a.cfg.AdminUser {
		recordFailure(ip)
		http.Redirect(w, r, "/admin/login?err=invalid", http.StatusFound)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(a.cfg.AdminPassHash), []byte(password)); err != nil {
		recordFailure(ip)
		http.Redirect(w, r, "/admin/login?err=invalid", http.StatusFound)
		return
	}

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
