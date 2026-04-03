package handler

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/SayAMDYES/pubg-queue/internal/config"
	"github.com/SayAMDYES/pubg-queue/internal/middleware"
	"github.com/SayAMDYES/pubg-queue/internal/model"
	"github.com/SayAMDYES/pubg-queue/internal/service"
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
			COALESCE(e.actual_start,''), COALESCE(e.actual_end,''),
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
			&ev.StartTime, &ev.EndTime, &ev.ActualStart, &ev.ActualEnd,
			&ev.CreatedAt, &ev.UpdatedAt,
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
	actualStart := r.FormValue("actual_start")
	actualEnd := r.FormValue("actual_end")

	teamCount, err := strconv.Atoi(teamCountStr)
	if err != nil || teamCount < 1 {
		teamCount = 2
	}

	_, err = a.db.Exec(
		`INSERT INTO events (event_date, open, team_count, note, start_time, end_time, actual_start, actual_end)
		 VALUES (?,1,?,?,?,?,?,?)
		 ON CONFLICT(event_date) DO UPDATE SET
		   team_count=excluded.team_count, note=excluded.note,
		   start_time=excluded.start_time, end_time=excluded.end_time,
		   actual_start=excluded.actual_start, actual_end=excluded.actual_end,
		   updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
		eventDate, teamCount, note, nullStr(startTime), nullStr(endTime),
		nullStr(actualStart), nullStr(actualEnd),
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
		`SELECT id, event_date, open, team_count, COALESCE(note,''), COALESCE(start_time,''), COALESCE(end_time,''),
		 COALESCE(actual_start,''), COALESCE(actual_end,'') FROM events WHERE event_date=?`,
		date,
	).Scan(&ev.ID, &ev.EventDate, &openInt, &ev.TeamCount, &ev.Note,
		&ev.StartTime, &ev.EndTime, &ev.ActualStart, &ev.ActualEnd)
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
	actualStart := r.FormValue("actual_start")
	actualEnd := r.FormValue("actual_end")

	teamCount, err := strconv.Atoi(teamCountStr)
	if err != nil || teamCount < 1 {
		teamCount = 2
	}

	_, err = a.db.Exec(
		`UPDATE events SET team_count=?, note=?, start_time=?, end_time=?,
		 actual_start=?, actual_end=?,
		 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE event_date=?`,
		teamCount, note, nullStr(startTime), nullStr(endTime),
		nullStr(actualStart), nullStr(actualEnd), date,
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
		`SELECT id, event_date, open, team_count, COALESCE(note,''),
		 COALESCE(start_time,''), COALESCE(end_time,''),
		 COALESCE(actual_start,''), COALESCE(actual_end,'')
		 FROM events WHERE event_date=?`,
		date,
	).Scan(&ev.ID, &ev.EventDate, &openInt, &ev.TeamCount, &ev.Note,
		&ev.StartTime, &ev.EndTime, &ev.ActualStart, &ev.ActualEnd)
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
		Phone     string
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

	// Build team grid for display
	type SlotInfo struct {
		TeamNo int
		SlotNo int
		Name   string
		Phone  string
		Filled bool
	}
	capacity := ev.TeamCount * 4
	slots := make([]SlotInfo, capacity)
	for t := 0; t < ev.TeamCount; t++ {
		for s := 0; s < 4; s++ {
			slots[t*4+s] = SlotInfo{TeamNo: t + 1, SlotNo: s + 1}
		}
	}
	type WaitlistEntry struct{ Name, Phone string }
	var waitlist []WaitlistEntry
	for _, reg := range regs {
		if reg.Status == "assigned" && reg.TeamNo != "" && reg.SlotNo != "" {
			tn, _ := strconv.Atoi(reg.TeamNo)
			sn, _ := strconv.Atoi(reg.SlotNo)
			if tn > 0 && sn > 0 {
				idx := (tn-1)*4 + (sn - 1)
				if idx >= 0 && idx < len(slots) {
					slots[idx].Name = reg.Name
					slots[idx].Phone = reg.Phone
					slots[idx].Filled = true
				}
			}
		} else if reg.Status == "waitlist" {
			waitlist = append(waitlist, WaitlistEntry{Name: reg.Name, Phone: reg.Phone})
		}
	}
	type TeamInfo struct {
		TeamNo int
		Slots  []SlotInfo
	}
	var teams []TeamInfo
	for t := 0; t < ev.TeamCount; t++ {
		teams = append(teams, TeamInfo{TeamNo: t + 1, Slots: slots[t*4 : (t+1)*4]})
	}

	data := map[string]interface{}{
		"Title":         ev.EventDate + " 报名详情",
		"Event":         ev,
		"Registrations": regs,
		"Teams":         teams,
		"Waitlist":      waitlist,
		"CSRFToken":     csrf.Token(r),
		"PUBGEnabled":   a.cfg.PUBGAPIKey != "",
		"Msg":           r.URL.Query().Get("msg"),
	}
	if a.cfg.PUBGAPIKey != "" {
		rankings, _ := service.GetEventRankings(a.db, ev.ID)
		data["Rankings"] = rankings
	}
	if err := tmpl.Render(w, "admin_event_detail.html", data); err != nil {
		http.Error(w, "template error", http.StatusInternalServerError)
	}
}

// RefreshRankings triggers PUBG stats refresh using the event's actual time range.
func (a *AdminHandlers) RefreshRankings(w http.ResponseWriter, r *http.Request) {
	if a.cfg.PUBGAPIKey == "" {
		renderError(w, r, http.StatusForbidden, "PUBG API Key 未配置")
		return
	}
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		renderError(w, r, http.StatusBadRequest, "日期格式不正确")
		return
	}

	var eventID int64
	var actualStart, actualEnd string
	err := a.db.QueryRow(
		`SELECT id, COALESCE(actual_start,''), COALESCE(actual_end,'') FROM events WHERE event_date=?`,
		date,
	).Scan(&eventID, &actualStart, &actualEnd)
	if err != nil {
		renderError(w, r, http.StatusNotFound, "event not found")
		return
	}

	client := service.NewPUBGClient(a.cfg.PUBGAPIKey, a.cfg.PUBGShard)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[PUBG] RefreshEventRankings panic for event %d: %v", eventID, r)
			}
		}()
		if _, err := service.RefreshEventRankings(a.db, client, eventID, actualStart, actualEnd); err != nil {
			log.Printf("[PUBG] RefreshEventRankings error for event %d: %v", eventID, err)
		}
	}()

	http.Redirect(w, r, "/admin/events/"+date+"?msg=ranking_refresh_started", http.StatusFound)
}

// ─── 账号管理 ─────────────────────────────────────────────────────────────────

// ListUsers 展示所有注册用户列表。
func (a *AdminHandlers) ListUsers(w http.ResponseWriter, r *http.Request) {
	type UserRow struct {
		ID         int64
		Phone      string
		CreatedAt  string
		GameNames  []string
		RegCount   int
	}

	rows, err := a.db.Query(`
		SELECT u.id, u.phone, u.created_at,
		       (SELECT COUNT(*) FROM registrations WHERE user_id=u.id AND status != 'cancelled') as reg_count
		FROM users u ORDER BY u.created_at DESC
	`)
	if err != nil {
		renderError(w, r, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	var users []UserRow
	for rows.Next() {
		var u UserRow
		if err := rows.Scan(&u.ID, &u.Phone, &u.CreatedAt, &u.RegCount); err != nil {
			continue
		}
		// Load game names
		gnRows, err := a.db.Query(`SELECT game_name FROM user_game_names WHERE user_id=? ORDER BY last_used_at DESC LIMIT 5`, u.ID)
		if err == nil {
			for gnRows.Next() {
				var gn string
				if gnRows.Scan(&gn) == nil {
					u.GameNames = append(u.GameNames, gn)
				}
			}
			gnRows.Close()
		}
		users = append(users, u)
	}

	data := map[string]interface{}{
		"Title":     "账号管理",
		"Users":     users,
		"CSRFToken": csrf.Token(r),
	}
	if err := tmpl.Render(w, "admin_users.html", data); err != nil {
		http.Error(w, "template error", http.StatusInternalServerError)
	}
}

// EditUserForm 展示用户编辑表单。
func (a *AdminHandlers) EditUserForm(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	uid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || uid <= 0 {
		renderError(w, r, http.StatusBadRequest, "无效的用户 ID")
		return
	}

	type UserDetail struct {
		ID        int64
		Phone     string
		CreatedAt string
		GameNames []string
	}
	var u UserDetail
	err = a.db.QueryRow(`SELECT id, phone, created_at FROM users WHERE id=?`, uid).
		Scan(&u.ID, &u.Phone, &u.CreatedAt)
	if err == sql.ErrNoRows {
		renderError(w, r, http.StatusNotFound, "用户不存在")
		return
	}
	if err != nil {
		renderError(w, r, http.StatusInternalServerError, "database error")
		return
	}

	gnRows, err := a.db.Query(`SELECT game_name FROM user_game_names WHERE user_id=? ORDER BY last_used_at DESC`, uid)
	if err == nil {
		for gnRows.Next() {
			var gn string
			if gnRows.Scan(&gn) == nil {
				u.GameNames = append(u.GameNames, gn)
			}
		}
		gnRows.Close()
	}

	data := map[string]interface{}{
		"Title":     "编辑用户",
		"User":      u,
		"ErrMsg":    r.URL.Query().Get("err"),
		"CSRFToken": csrf.Token(r),
	}
	if err := tmpl.Render(w, "admin_user_edit.html", data); err != nil {
		http.Error(w, "template error", http.StatusInternalServerError)
	}
}

// UpdateUser 保存用户编辑（手机号、删除旧游戏名、添加新游戏名）。
func (a *AdminHandlers) UpdateUser(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	uid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || uid <= 0 {
		renderError(w, r, http.StatusBadRequest, "无效的用户 ID")
		return
	}

	newPhone := r.FormValue("phone")
	if !service.ValidatePhone(newPhone) {
		http.Redirect(w, r, fmt.Sprintf("/admin/users/%d/edit?err=invalid_phone", uid), http.StatusFound)
		return
	}

	// 检查手机号是否被其他用户占用
	var existID int64
	checkErr := a.db.QueryRow(`SELECT id FROM users WHERE phone=? AND id != ?`, newPhone, uid).Scan(&existID)
	if checkErr == nil {
		http.Redirect(w, r, fmt.Sprintf("/admin/users/%d/edit?err=phone_taken", uid), http.StatusFound)
		return
	}

	tx, err := a.db.Begin()
	if err != nil {
		renderError(w, r, http.StatusInternalServerError, "database error")
		return
	}
	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	// 更新手机号（同时更新 registrations 中关联的 phone 字段）
	if _, err = tx.Exec(
		`UPDATE users SET phone=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
		newPhone, uid,
	); err != nil {
		renderError(w, r, http.StatusInternalServerError, "update failed")
		return
	}
	tx.Exec(`UPDATE registrations SET phone=? WHERE user_id=? AND status != 'cancelled'`, newPhone, uid)

	// 处理游戏昵称：删除勾选的，添加新的
	deleteNames := r.Form["delete_game_name"]
	for _, gn := range deleteNames {
		tx.Exec(`DELETE FROM user_game_names WHERE user_id=? AND game_name=?`, uid, gn)
	}
	if newGameName := r.FormValue("new_game_name"); newGameName != "" && service.ValidateName(newGameName) {
		tx.Exec(`
			INSERT INTO user_game_names (user_id, game_name, used_count, last_used_at)
			VALUES (?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
			ON CONFLICT(user_id, game_name) DO UPDATE SET
				last_used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
		`, uid, newGameName)
	}

	if err = tx.Commit(); err != nil {
		renderError(w, r, http.StatusInternalServerError, "commit failed")
		return
	}
	http.Redirect(w, r, "/admin/users", http.StatusFound)
}

// nullStr 将空字符串转换为 nil（用于可空列）
func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
