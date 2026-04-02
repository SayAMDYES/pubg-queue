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
		SELECT e.id, e.event_date, e.open, e.team_count, COALESCE(e.note,''),
			COALESCE(e.start_time,''), COALESCE(e.end_time,''),
			e.created_at, e.updated_at,
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
		if err := rows.Scan(&ev.ID, &ev.EventDate, &openInt, &ev.TeamCount, &ev.Note,
			&ev.StartTime, &ev.EndTime, &ev.CreatedAt, &ev.UpdatedAt,
			&ev.RegisteredCount, &ev.WaitlistCount); err != nil {
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
	if !validateDate(eventDate) {
		renderError(w, r, http.StatusBadRequest, "日期格式不正确")
		return
	}
	teamCountStr := r.FormValue("team_count")
	note := r.FormValue("note")
	startTime := r.FormValue("start_time")
	endTime := r.FormValue("end_time")

	teamCount, err := strconv.Atoi(teamCountStr)
	if err != nil || teamCount < 1 {
		teamCount = 2
	}

	_, err = a.db.Exec(
		`INSERT INTO events (event_date, open, team_count, note, start_time, end_time)
		 VALUES (?,1,?,?,?,?)
		 ON CONFLICT(event_date) DO UPDATE SET
		   team_count=excluded.team_count, note=excluded.note,
		   start_time=excluded.start_time, end_time=excluded.end_time,
		   updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
		eventDate, teamCount, note, nullStr(startTime), nullStr(endTime),
	)
	if err != nil {
		renderError(w, r, http.StatusInternalServerError, "create event failed: "+err.Error())
		return
	}
	http.Redirect(w, r, "/admin", http.StatusFound)
}

func (a *AdminHandlers) EditEventForm(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		renderError(w, r, http.StatusBadRequest, "日期格式不正确")
		return
	}

	var ev model.Event
	var openInt int
	err := a.db.QueryRow(
		`SELECT id, event_date, open, team_count, COALESCE(note,''), COALESCE(start_time,''), COALESCE(end_time,'') FROM events WHERE event_date=?`,
		date,
	).Scan(&ev.ID, &ev.EventDate, &openInt, &ev.TeamCount, &ev.Note, &ev.StartTime, &ev.EndTime)
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
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		renderError(w, r, http.StatusBadRequest, "日期格式不正确")
		return
	}

	teamCountStr := r.FormValue("team_count")
	note := r.FormValue("note")
	startTime := r.FormValue("start_time")
	endTime := r.FormValue("end_time")

	teamCount, err := strconv.Atoi(teamCountStr)
	if err != nil || teamCount < 1 {
		teamCount = 2
	}

	_, err = a.db.Exec(
		`UPDATE events SET team_count=?, note=?, start_time=?, end_time=?,
		 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE event_date=?`,
		teamCount, note, nullStr(startTime), nullStr(endTime), date,
	)
	if err != nil {
		renderError(w, r, http.StatusInternalServerError, "update failed")
		return
	}
	http.Redirect(w, r, "/admin", http.StatusFound)
}

func (a *AdminHandlers) ToggleEvent(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		renderError(w, r, http.StatusBadRequest, "日期格式不正确")
		return
	}

	_, err := a.db.Exec(
		`UPDATE events SET open = CASE WHEN open=1 THEN 0 ELSE 1 END, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE event_date=?`,
		date,
	)
	if err != nil {
		renderError(w, r, http.StatusInternalServerError, "toggle failed")
		return
	}
	http.Redirect(w, r, "/admin", http.StatusFound)
}

func (a *AdminHandlers) ClearEvent(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		renderError(w, r, http.StatusBadRequest, "日期格式不正确")
		return
	}

	var eventID int64
	if err := a.db.QueryRow(`SELECT id FROM events WHERE event_date=?`, date).Scan(&eventID); err != nil {
		renderError(w, r, http.StatusNotFound, "event not found")
		return
	}

	_, err := a.db.Exec(
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
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		renderError(w, r, http.StatusBadRequest, "日期格式不正确")
		return
	}

	var eventID int64
	if err := a.db.QueryRow(`SELECT id FROM events WHERE event_date=?`, date).Scan(&eventID); err != nil {
		renderError(w, r, http.StatusNotFound, "event not found")
		return
	}

	rows, err := a.db.Query(
		`SELECT name, phone, status, COALESCE(team_no,''), COALESCE(slot_no,''), created_at FROM registrations WHERE event_id=? ORDER BY created_at`,
		eventID,
	)
	if err != nil {
		renderError(w, r, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	filename := fmt.Sprintf("event_%s_%s.csv", date, time.Now().Format("20060102"))
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)

	cw := csv.NewWriter(w)
	cw.Write([]string{"姓名", "手机号", "状态", "队伍", "位置", "报名时间"})
	for rows.Next() {
		var name, phone, status, teamNo, slotNo, createdAt string
		if err := rows.Scan(&name, &phone, &status, &teamNo, &slotNo, &createdAt); err != nil {
			continue
		}
		cw.Write([]string{name, phone, status, teamNo, slotNo, createdAt})
	}
	cw.Flush()
}

// EventDetail 管理后台查看某活动报名详情（含完整手机号）
func (a *AdminHandlers) EventDetail(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		renderError(w, r, http.StatusBadRequest, "日期格式不正确")
		return
	}

	var ev model.Event
	var openInt int
	err := a.db.QueryRow(
		`SELECT id, event_date, open, team_count, COALESCE(note,''), COALESCE(start_time,''), COALESCE(end_time,'') FROM events WHERE event_date=?`,
		date,
	).Scan(&ev.ID, &ev.EventDate, &openInt, &ev.TeamCount, &ev.Note, &ev.StartTime, &ev.EndTime)
	if err == sql.ErrNoRows {
		renderError(w, r, http.StatusNotFound, "event not found")
		return
	}
	if err != nil {
		renderError(w, r, http.StatusInternalServerError, "database error")
		return
	}
	ev.Open = openInt == 1

	type RegRow struct {
		ID        int64
		Name      string
		Phone     string // 完整手机号（管理后台不脱敏）
		Status    string
		TeamNo    string
		SlotNo    string
		CreatedAt string
	}

	rows, err := a.db.Query(
		`SELECT id, name, phone, status, COALESCE(team_no,''), COALESCE(slot_no,''), created_at FROM registrations WHERE event_id=? AND status != 'cancelled' ORDER BY created_at`,
		ev.ID,
	)
	if err != nil {
		renderError(w, r, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	var regs []RegRow
	for rows.Next() {
		var reg RegRow
		if err := rows.Scan(&reg.ID, &reg.Name, &reg.Phone, &reg.Status, &reg.TeamNo, &reg.SlotNo, &reg.CreatedAt); err != nil {
			continue
		}
		regs = append(regs, reg)
	}

	data := map[string]interface{}{
		"Title":         ev.EventDate + " 报名详情",
		"Event":         ev,
		"Registrations": regs,
		"CSRFToken":     csrf.Token(r),
	}
	if err := tmpl.Render(w, "admin_event_detail.html", data); err != nil {
		http.Error(w, "template error", http.StatusInternalServerError)
	}
}

// nullStr 将空字符串转换为 nil（用于可空列）
func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
