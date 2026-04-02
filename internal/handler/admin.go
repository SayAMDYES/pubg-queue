package handler

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/SayAMDYES/pubg-queue/internal/config"
	"github.com/SayAMDYES/pubg-queue/internal/middleware"
	"github.com/SayAMDYES/pubg-queue/internal/model"
	"github.com/SayAMDYES/pubg-queue/internal/tmpl"
	"github.com/gorilla/csrf"
)

type AdminHandlers struct {
	db   *sql.DB
	cfg  *config.Config
	auth *middleware.AuthMiddleware
}

func NewAdminHandlers(db *sql.DB, cfg *config.Config, auth *middleware.AuthMiddleware) *AdminHandlers {
	return &AdminHandlers{db: db, cfg: cfg, auth: auth}
}

func (a *AdminHandlers) LoginGet(w http.ResponseWriter, r *http.Request) {
	data := map[string]interface{}{
		"Title":     "管理员登录",
		"ErrMsg":    r.URL.Query().Get("err"),
		"CSRFToken": csrf.Token(r),
	}
	if err := tmpl.Render(w, "admin_login.html", data); err != nil {
		http.Error(w, "template error", http.StatusInternalServerError)
	}
}

func (a *AdminHandlers) LoginPost(w http.ResponseWriter, r *http.Request) {
	a.auth.LoginPost(w, r)
}

func (a *AdminHandlers) LogoutPost(w http.ResponseWriter, r *http.Request) {
	a.auth.LogoutPost(w, r)
}

func (a *AdminHandlers) Dashboard(w http.ResponseWriter, r *http.Request) {
	type EventRow struct {
		model.Event
		RegisteredCount int
		WaitlistCount   int
	}

	rows, err := a.db.Query(`
		SELECT e.id, e.event_date, e.open, e.team_count, COALESCE(e.note,''), e.created_at, e.updated_at,
			(SELECT COUNT(*) FROM registrations WHERE event_id=e.id AND status='assigned') as reg_count,
			(SELECT COUNT(*) FROM registrations WHERE event_id=e.id AND status='waitlist') as wait_count
		FROM events e ORDER BY e.event_date DESC
	`)
	if err != nil {
		renderError(w, r, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	var events []EventRow
	for rows.Next() {
		var ev EventRow
		var openInt int
		if err := rows.Scan(&ev.ID, &ev.EventDate, &openInt, &ev.TeamCount, &ev.Note, &ev.CreatedAt, &ev.UpdatedAt, &ev.RegisteredCount, &ev.WaitlistCount); err != nil {
			continue
		}
		ev.Open = openInt == 1
		events = append(events, ev)
	}

	data := map[string]interface{}{
		"Title":     "管理后台",
		"Events":    events,
		"CSRFToken": csrf.Token(r),
	}
	if err := tmpl.Render(w, "admin_dashboard.html", data); err != nil {
		http.Error(w, "template error", http.StatusInternalServerError)
	}
}

func (a *AdminHandlers) NewEventForm(w http.ResponseWriter, r *http.Request) {
	data := map[string]interface{}{
		"Title":     "新建活动",
		"Event":     nil,
		"CSRFToken": csrf.Token(r),
	}
	if err := tmpl.Render(w, "admin_event_form.html", data); err != nil {
		http.Error(w, "template error", http.StatusInternalServerError)
	}
}

func (a *AdminHandlers) CreateEvent(w http.ResponseWriter, r *http.Request) {
	eventDate := r.FormValue("event_date")
	teamCountStr := r.FormValue("team_count")
	note := r.FormValue("note")

	teamCount, err := strconv.Atoi(teamCountStr)
	if err != nil || teamCount < 1 {
		teamCount = 2
	}

	_, err = a.db.Exec(
		`INSERT INTO events (event_date, open, team_count, note) VALUES (?,1,?,?)`,
		eventDate, teamCount, note,
	)
	if err != nil {
		renderError(w, r, http.StatusInternalServerError, "create event failed: "+err.Error())
		return
	}
	http.Redirect(w, r, "/admin", http.StatusFound)
}

func (a *AdminHandlers) EditEventForm(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	eventID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		renderError(w, r, http.StatusBadRequest, "invalid id")
		return
	}

	var ev model.Event
	var openInt int
	err = a.db.QueryRow(`SELECT id, event_date, open, team_count, COALESCE(note,'') FROM events WHERE id=?`, eventID).
		Scan(&ev.ID, &ev.EventDate, &openInt, &ev.TeamCount, &ev.Note)
	if err == sql.ErrNoRows {
		renderError(w, r, http.StatusNotFound, "event not found")
		return
	}
	ev.Open = openInt == 1

	data := map[string]interface{}{
		"Title":     "编辑活动",
		"Event":     ev,
		"CSRFToken": csrf.Token(r),
	}
	if err := tmpl.Render(w, "admin_event_form.html", data); err != nil {
		http.Error(w, "template error", http.StatusInternalServerError)
	}
}

func (a *AdminHandlers) UpdateEvent(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	eventID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		renderError(w, r, http.StatusBadRequest, "invalid id")
		return
	}

	eventDate := r.FormValue("event_date")
	teamCountStr := r.FormValue("team_count")
	note := r.FormValue("note")

	teamCount, err := strconv.Atoi(teamCountStr)
	if err != nil || teamCount < 1 {
		teamCount = 2
	}

	_, err = a.db.Exec(
		`UPDATE events SET event_date=?, team_count=?, note=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
		eventDate, teamCount, note, eventID,
	)
	if err != nil {
		renderError(w, r, http.StatusInternalServerError, "update failed")
		return
	}
	http.Redirect(w, r, "/admin", http.StatusFound)
}

func (a *AdminHandlers) ToggleEvent(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	eventID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		renderError(w, r, http.StatusBadRequest, "invalid id")
		return
	}

	_, err = a.db.Exec(
		`UPDATE events SET open = CASE WHEN open=1 THEN 0 ELSE 1 END, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
		eventID,
	)
	if err != nil {
		renderError(w, r, http.StatusInternalServerError, "toggle failed")
		return
	}
	http.Redirect(w, r, "/admin", http.StatusFound)
}

func (a *AdminHandlers) ClearEvent(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	eventID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		renderError(w, r, http.StatusBadRequest, "invalid id")
		return
	}

	_, err = a.db.Exec(
		`UPDATE registrations SET status='cancelled', cancelled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE event_id=? AND status != 'cancelled'`,
		eventID,
	)
	if err != nil {
		renderError(w, r, http.StatusInternalServerError, "clear failed")
		return
	}
	http.Redirect(w, r, "/admin", http.StatusFound)
}

func (a *AdminHandlers) ExportCSV(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	eventID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		renderError(w, r, http.StatusBadRequest, "invalid id")
		return
	}

	rows, err := a.db.Query(
		`SELECT name, status, COALESCE(team_no,''), COALESCE(slot_no,''), created_at FROM registrations WHERE event_id=? ORDER BY created_at`,
		eventID,
	)
	if err != nil {
		renderError(w, r, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	filename := fmt.Sprintf("event_%d_%s.csv", eventID, time.Now().Format("20060102"))
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)

	cw := csv.NewWriter(w)
	cw.Write([]string{"姓名", "状态", "队伍", "位置", "报名时间"})
	for rows.Next() {
		var name, status, teamNo, slotNo, createdAt string
		if err := rows.Scan(&name, &status, &teamNo, &slotNo, &createdAt); err != nil {
			continue
		}
		cw.Write([]string{name, status, teamNo, slotNo, createdAt})
	}
	cw.Flush()
}
