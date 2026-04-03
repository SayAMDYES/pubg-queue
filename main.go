package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/csrf"
	"golang.org/x/crypto/bcrypt"

	"github.com/SayAMDYES/pubg-queue/internal/config"
	idb "github.com/SayAMDYES/pubg-queue/internal/db"
	"github.com/SayAMDYES/pubg-queue/internal/handler"
	"github.com/SayAMDYES/pubg-queue/internal/middleware"
)

func main() {
	adminPass := flag.String("admin-pass", "", "管理员明文密码（启动时哈希化，不写磁盘）")
	flag.Parse()

	if *adminPass == "" {
		fmt.Fprintf(os.Stderr, "用法: %s --admin-pass <明文密码>\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "示例: %s --admin-pass 'yourpassword'\n", os.Args[0])
		os.Exit(1)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(*adminPass), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("bcrypt hash failed: %v", err)
	}
	// 清除明文，后续只使用哈希
	*adminPass = ""

	cfg := config.Load()
	cfg.AdminPassHash = string(hash)

	if err := os.MkdirAll("data", 0755); err != nil {
		log.Fatalf("create data dir: %v", err)
	}

	db, err := idb.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if err := idb.Migrate(db); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	authMW := middleware.NewAuthMiddleware(db, cfg)
	bans := authMW.GetBanManager()

	r := chi.NewRouter()
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(middleware.SecurityHeaders)

	csrfSecret := []byte(cfg.CSRFSecret)
	padded := make([]byte, 32)
	copy(padded, csrfSecret)
	csrfMiddleware := csrf.Protect(
		padded,
		csrf.Secure(cfg.SecureCookie),
		csrf.SameSite(csrf.SameSiteLaxMode),
	)
	r.Use(csrfMiddleware)

	generalRL := middleware.NewRateLimiter(100)
	registerRL := middleware.NewRateLimiter(cfg.RateLimitRegister)
	leaveRL := middleware.NewRateLimiter(cfg.RateLimitLeave)

	r.Use(generalRL.RateLimit)

	r.Handle("/static/*", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	r.Get("/", handler.CalendarHandler(db))
	r.Get("/date/{date}", handler.EventDetailHandler(db, cfg))
	r.With(registerRL.RateLimit).Post("/date/{date}/register", handler.RegisterHandler(db, cfg, bans))
	r.With(leaveRL.RateLimit).Post("/date/{date}/leave", handler.LeaveHandler(db, cfg, bans))
	// 向后兼容：旧的6位码离队入口保留
	r.With(leaveRL.RateLimit).Post("/leave", handler.LegacyLeaveHandler(db))

	adminH := handler.NewAdminHandlers(db, cfg, authMW)
	r.Route("/admin", func(r chi.Router) {
		r.Get("/login", adminH.LoginGet)
		r.Post("/login", adminH.LoginPost)
		r.With(authMW.RequireAdmin).Post("/logout", adminH.LogoutPost)
		r.With(authMW.RequireAdmin).Get("/", adminH.Dashboard)
		r.With(authMW.RequireAdmin).Get("/events/new", adminH.NewEventForm)
		r.With(authMW.RequireAdmin).Post("/events", adminH.CreateEvent)
		r.With(authMW.RequireAdmin).Get("/events/{date}/edit", adminH.EditEventForm)
		r.With(authMW.RequireAdmin).Post("/events/{date}", adminH.UpdateEvent)
		r.With(authMW.RequireAdmin).Post("/events/{date}/toggle", adminH.ToggleEvent)
		r.With(authMW.RequireAdmin).Post("/events/{date}/clear", adminH.ClearEvent)
		r.With(authMW.RequireAdmin).Post("/events/{date}/refresh-rankings", adminH.RefreshRankings)
		r.With(authMW.RequireAdmin).Get("/events/{date}/export", adminH.ExportCSV)
		r.With(authMW.RequireAdmin).Get("/events/{date}", adminH.EventDetail)
		r.With(authMW.RequireAdmin).Get("/users", adminH.ListUsers)
		r.With(authMW.RequireAdmin).Get("/users/{id}/edit", adminH.EditUserForm)
		r.With(authMW.RequireAdmin).Post("/users/{id}", adminH.UpdateUser)
	})

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Listening on %s", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("server: %v", err)
	}
}
