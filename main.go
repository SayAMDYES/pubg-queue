package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"golang.org/x/crypto/bcrypt"

	"github.com/SayAMDYES/pubg-queue/internal/api"
	"github.com/SayAMDYES/pubg-queue/internal/config"
	idb "github.com/SayAMDYES/pubg-queue/internal/db"
	"github.com/SayAMDYES/pubg-queue/internal/middleware"
)

//go:embed frontend/dist/*
var frontendFS embed.FS

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

	generalRL := middleware.NewRateLimiter(100)
	registerRL := middleware.NewRateLimiter(cfg.RateLimitRegister)
	leaveRL := middleware.NewRateLimiter(cfg.RateLimitLeave)

	r.Use(generalRL.RateLimit)

	// API 路由
	r.Route("/api", func(r chi.Router) {
		r.Get("/calendar", api.CalendarHandler(db))
		r.Get("/events/{date}", api.EventDetailHandler(db, cfg))
		r.With(registerRL.RateLimit).Post("/events/{date}/register", api.RegisterHandler(db, cfg))
		r.With(leaveRL.RateLimit).Post("/events/{date}/leave", api.LeaveHandler(db, cfg, bans))
		r.With(leaveRL.RateLimit).Post("/leave", api.LegacyLeaveHandler(db))
		r.Get("/stats/player/{name}", api.PlayerStatsHandler(cfg))
		r.Get("/stats/match/{matchId}", api.MatchDetailHandlerFunc(cfg))
		r.Get("/stats/seasons", api.SeasonsHandler(cfg))

		// 用户账号（前台登录/登出/查询）
		r.Post("/user/login", api.UserLoginHandler(db, cfg, bans))
		r.Post("/user/logout", api.UserLogoutHandler(db, cfg))
		r.Get("/user/me", api.UserMeHandler(db, cfg))

		adminH := api.NewAdminAPI(db, cfg, authMW)
		r.Route("/admin", func(r chi.Router) {
			r.Post("/login", adminH.LoginPost)
			r.With(authMW.RequireAdminAPI).Post("/logout", adminH.LogoutPost)
			r.With(authMW.RequireAdminAPI).Get("/check", adminH.CheckSession)
			r.With(authMW.RequireAdminAPI).Get("/events", adminH.Dashboard)
			r.With(authMW.RequireAdminAPI).Post("/events", adminH.CreateEvent)
			r.With(authMW.RequireAdminAPI).Get("/events/{date}", adminH.EventDetail)
			r.With(authMW.RequireAdminAPI).Put("/events/{date}", adminH.UpdateEvent)
			r.With(authMW.RequireAdminAPI).Post("/events/{date}/toggle", adminH.ToggleEvent)
			r.With(authMW.RequireAdminAPI).Post("/events/{date}/clear", adminH.ClearEvent)
			r.With(authMW.RequireAdminAPI).Delete("/events/{date}", adminH.DeleteEvent)
			r.With(authMW.RequireAdminAPI).Post("/events/{date}/refresh-rankings", adminH.RefreshRankings)
			r.With(authMW.RequireAdminAPI).Get("/events/{date}/export", adminH.ExportCSV)
			r.With(authMW.RequireAdminAPI).Get("/users", adminH.ListUsers)
			r.With(authMW.RequireAdminAPI).Get("/users/{id}", adminH.GetUser)
			r.With(authMW.RequireAdminAPI).Put("/users/{id}", adminH.UpdateUser)
			r.With(authMW.RequireAdminAPI).Delete("/users/{id}", adminH.DeleteUser)
			r.With(authMW.RequireAdminAPI).Post("/users/{id}/reset-password", adminH.ResetUserPassword)
		})
	})

	// 前端静态资源（SPA）
	distFS, err := fs.Sub(frontendFS, "frontend/dist")
	if err != nil {
		log.Fatalf("frontend fs: %v", err)
	}
	fileServer := http.FileServer(http.FS(distFS))

	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if _, err := fs.Stat(distFS, path); err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}
		// SPA 回退
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Listening on %s", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("server: %v", err)
	}
}
