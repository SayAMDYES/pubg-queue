package main

import (
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
	cfg := config.Load()

	if cfg.AdminPassHash != "" {
		if _, err := bcrypt.Cost([]byte(cfg.AdminPassHash)); err != nil {
			log.Printf("WARNING: ADMIN_PASS_HASH is not a valid bcrypt hash: %v", err)
		}
	} else {
		log.Println("WARNING: ADMIN_PASS_HASH not set. Admin login will not work.")
	}

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
	r.Get("/events/{id}", handler.EventDetailHandler(db, cfg.AllowDuplicateName))
	r.With(registerRL.RateLimit).Post("/events/{id}/register", handler.RegisterHandler(db, cfg.AllowDuplicateName))
	r.With(leaveRL.RateLimit).Post("/leave", handler.LeaveHandler(db))

	adminH := handler.NewAdminHandlers(db, cfg, authMW)
	r.Route("/admin", func(r chi.Router) {
		r.Get("/login", adminH.LoginGet)
		r.Post("/login", adminH.LoginPost)
		r.With(authMW.RequireAdmin).Post("/logout", adminH.LogoutPost)
		r.With(authMW.RequireAdmin).Get("/", adminH.Dashboard)
		r.With(authMW.RequireAdmin).Get("/events/new", adminH.NewEventForm)
		r.With(authMW.RequireAdmin).Post("/events", adminH.CreateEvent)
		r.With(authMW.RequireAdmin).Get("/events/{id}/edit", adminH.EditEventForm)
		r.With(authMW.RequireAdmin).Post("/events/{id}", adminH.UpdateEvent)
		r.With(authMW.RequireAdmin).Post("/events/{id}/toggle", adminH.ToggleEvent)
		r.With(authMW.RequireAdmin).Post("/events/{id}/clear", adminH.ClearEvent)
		r.With(authMW.RequireAdmin).Get("/events/{id}/export", adminH.ExportCSV)
	})

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Listening on %s", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("server: %v", err)
	}
}
