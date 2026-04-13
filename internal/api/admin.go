package api

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/SayAMDYES/pubg-queue/internal/config"
	"github.com/SayAMDYES/pubg-queue/internal/middleware"
	"github.com/SayAMDYES/pubg-queue/internal/service"
)

type AdminAPI struct {
	db   *sql.DB
	cfg  *config.Config
	auth *middleware.AuthMiddleware
}

func NewAdminAPI(db *sql.DB, cfg *config.Config, auth *middleware.AuthMiddleware) *AdminAPI {
	return &AdminAPI{db: db, cfg: cfg, auth: auth}
}

// LoginPost 管理员登录
func (a *AdminAPI) LoginPost(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "请求格式错误")
		return
	}

	ip := getClientIP(r)
	bans := a.auth.GetBanManager()

	if bans.IsBanned(ip) {
		Error(w, http.StatusTooManyRequests, "登录失败次数过多，请24小时后再试。")
		return
	}

	if req.Username != config.AdminUsername {
		bans.RecordFailure(ip)
		Error(w, http.StatusUnauthorized, "用户名或密码错误")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(a.cfg.AdminPassHash), []byte(req.Password)); err != nil {
		bans.RecordFailure(ip)
		Error(w, http.StatusUnauthorized, "用户名或密码错误")
		return
	}

	bans.ClearFailures(ip)

	if err := middleware.SaveAdminSession(w, a.db, a.cfg, req.Username); err != nil {
		Error(w, http.StatusInternalServerError, "session error")
		return
	}
	Success(w, map[string]string{"username": req.Username})
}

// LogoutPost 管理员登出
func (a *AdminAPI) LogoutPost(w http.ResponseWriter, r *http.Request) {
	middleware.DeleteSession(w, r, a.db, a.cfg)
	Success(w, nil)
}

// CheckSession 检查管理员登录状态
func (a *AdminAPI) CheckSession(w http.ResponseWriter, r *http.Request) {
	Success(w, map[string]bool{"loggedIn": true})
}

// Dashboard 活动列表
func (a *AdminAPI) Dashboard(w http.ResponseWriter, r *http.Request) {
	type EventRow struct {
		ID              int64  `json:"id"`
		EventDate       string `json:"eventDate"`
		Open            bool   `json:"open"`
		TeamCount       int    `json:"teamCount"`
		Ended          bool   `json:"ended"`
		Note            string `json:"note"`
		StartTime       string `json:"startTime"`
		EndTime         string `json:"endTime"`
		ActualStart     string `json:"actualStart"`
		ActualEnd       string `json:"actualEnd"`
		CreatedAt       string `json:"createdAt"`
		UpdatedAt       string `json:"updatedAt"`
		RegisteredCount int    `json:"registeredCount"`
		WaitlistCount   int    `json:"waitlistCount"`
	}

	rows, err := a.db.Query(`
		SELECT e.id, e.event_date, e.open, COALESCE(e.ended,0), e.team_count, COALESCE(e.note,''),
			COALESCE(e.start_time,''), COALESCE(e.end_time,''),
			COALESCE(e.actual_start,''), COALESCE(e.actual_end,''),
			e.created_at, e.updated_at,
			(SELECT COUNT(*) FROM registrations WHERE event_id=e.id AND status='assigned') as reg_count,
			(SELECT COUNT(*) FROM registrations WHERE event_id=e.id AND status='waitlist') as wait_count
		FROM events e ORDER BY e.event_date DESC
	`)
	if err != nil {
		Error(w, http.StatusInternalServerError, "数据库错误")
		return
	}
	defer rows.Close()

	events := make([]EventRow, 0)
	for rows.Next() {
		var ev EventRow
		var openInt, endedInt int
		if err := rows.Scan(&ev.ID, &ev.EventDate, &openInt, &endedInt, &ev.TeamCount, &ev.Note,
			&ev.StartTime, &ev.EndTime, &ev.ActualStart, &ev.ActualEnd,
			&ev.CreatedAt, &ev.UpdatedAt,
			&ev.RegisteredCount, &ev.WaitlistCount); err != nil {
			continue
		}
		ev.Open = openInt == 1
		ev.Ended = endedInt == 1
		if !ev.Ended && ev.EndTime != "" {
			if t, err := time.ParseInLocation("2006-01-02T15:04", ev.EndTime, time.Local); err == nil && time.Now().After(t) {
				ev.Ended = true
				ev.Open = false
			}
		}
		events = append(events, ev)
	}

	Success(w, events)
}

// CreateEvent 创建活动
func (a *AdminAPI) CreateEvent(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EventDate   string `json:"eventDate"`
		TeamCount   int    `json:"teamCount"`
		Note        string `json:"note"`
		StartTime   string `json:"startTime"`
		EndTime     string `json:"endTime"`
		ActualStart string `json:"actualStart"`
		ActualEnd   string `json:"actualEnd"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "请求格式错误")
		return
	}

	if !validateDate(req.EventDate) {
		Error(w, http.StatusBadRequest, "日期格式不正确")
		return
	}
	if req.TeamCount < 1 {
		req.TeamCount = 2
	}

	_, err := a.db.Exec(
		`INSERT INTO events (event_date, open, team_count, note, start_time, end_time, actual_start, actual_end)
		 VALUES (?,1,?,?,?,?,?,?)
		 ON CONFLICT(event_date) DO UPDATE SET
		   team_count=excluded.team_count, note=excluded.note,
		   start_time=excluded.start_time, end_time=excluded.end_time,
		   actual_start=excluded.actual_start, actual_end=excluded.actual_end,
		   updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
		req.EventDate, req.TeamCount, req.Note, nullStr(req.StartTime), nullStr(req.EndTime),
		nullStr(req.ActualStart), nullStr(req.ActualEnd),
	)
	if err != nil {
		Error(w, http.StatusInternalServerError, "创建活动失败: "+err.Error())
		return
	}
	Success(w, map[string]string{"eventDate": req.EventDate})
}

// UpdateEvent 更新活动
func (a *AdminAPI) UpdateEvent(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		Error(w, http.StatusBadRequest, "日期格式不正确")
		return
	}

	var req struct {
		TeamCount   int    `json:"teamCount"`
		Note        string `json:"note"`
		StartTime   string `json:"startTime"`
		EndTime     string `json:"endTime"`
		ActualStart string `json:"actualStart"`
		ActualEnd   string `json:"actualEnd"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "请求格式错误")
		return
	}

	if req.TeamCount < 1 {
		req.TeamCount = 2
	}

	_, err := a.db.Exec(
		`UPDATE events SET team_count=?, note=?, start_time=?, end_time=?,
		 actual_start=?, actual_end=?,
		 updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE event_date=?`,
		req.TeamCount, req.Note, nullStr(req.StartTime), nullStr(req.EndTime),
		nullStr(req.ActualStart), nullStr(req.ActualEnd), date,
	)
	if err != nil {
		Error(w, http.StatusInternalServerError, "更新失败")
		return
	}
	Success(w, nil)
}

// ToggleEvent 开关活动
func (a *AdminAPI) ToggleEvent(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		Error(w, http.StatusBadRequest, "日期格式不正确")
		return
	}

	_, err := a.db.Exec(
		`UPDATE events SET open = CASE WHEN open=1 THEN 0 ELSE 1 END, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE event_date=?`,
		date,
	)
	if err != nil {
		Error(w, http.StatusInternalServerError, "操作失败")
		return
	}
	Success(w, nil)
}

// ClearEvent 清空活动
func (a *AdminAPI) ClearEvent(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		Error(w, http.StatusBadRequest, "日期格式不正确")
		return
	}

	var eventID int64
	if err := a.db.QueryRow(`SELECT id FROM events WHERE event_date=?`, date).Scan(&eventID); err != nil {
		Error(w, http.StatusNotFound, "活动不存在")
		return
	}

	tx, err := a.db.Begin()
	if err != nil {
		Error(w, http.StatusInternalServerError, "数据库错误")
		return
	}
	if _, err = tx.Exec(`DELETE FROM event_rankings WHERE event_id=?`, eventID); err != nil {
		tx.Rollback()
		Error(w, http.StatusInternalServerError, "清空失败")
		return
	}
	_, err = tx.Exec(
		`UPDATE registrations SET status='cancelled', cancelled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE event_id=? AND status != 'cancelled'`,
		eventID,
	)
	if err != nil {
		tx.Rollback()
		Error(w, http.StatusInternalServerError, "清空失败")
		return
	}
	if err := tx.Commit(); err != nil {
		Error(w, http.StatusInternalServerError, "提交失败")
		return
	}
	Success(w, nil)
}

// DeleteEvent 删除活动
func (a *AdminAPI) DeleteEvent(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		Error(w, http.StatusBadRequest, "日期格式不正确")
		return
	}

	tx, err := a.db.Begin()
	if err != nil {
		Error(w, http.StatusInternalServerError, "数据库错误")
		return
	}

	var eventID int64
	if err := tx.QueryRow(`SELECT id FROM events WHERE event_date=?`, date).Scan(&eventID); err != nil {
		tx.Rollback()
		Error(w, http.StatusNotFound, "活动不存在")
		return
	}

	if _, err := tx.Exec(`DELETE FROM event_rankings WHERE event_id=?`, eventID); err != nil {
		tx.Rollback()
		Error(w, http.StatusInternalServerError, "删除失败")
		return
	}
	if _, err := tx.Exec(`DELETE FROM registrations WHERE event_id=?`, eventID); err != nil {
		tx.Rollback()
		Error(w, http.StatusInternalServerError, "删除失败")
		return
	}
	if _, err := tx.Exec(`DELETE FROM events WHERE id=?`, eventID); err != nil {
		tx.Rollback()
		Error(w, http.StatusInternalServerError, "删除失败")
		return
	}
	if err := tx.Commit(); err != nil {
		Error(w, http.StatusInternalServerError, "提交失败")
		return
	}
	Success(w, nil)
}

// EventDetail 管理后台查看某活动报名详情
func (a *AdminAPI) EventDetail(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		Error(w, http.StatusBadRequest, "日期格式不正确")
		return
	}

	ev, err := getEventByDate(a.db, date)
	if err == sql.ErrNoRows {
		Error(w, http.StatusNotFound, "活动不存在")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "数据库错误")
		return
	}

	type RegRow struct {
		ID        int64  `json:"id"`
		Name      string `json:"name"`
		Phone     string `json:"phone"`
		Status    string `json:"status"`
		TeamNo    string `json:"teamNo"`
		SlotNo    string `json:"slotNo"`
		CreatedAt string `json:"createdAt"`
	}

	rows, err := a.db.Query(
		`SELECT id, name, phone, status, COALESCE(team_no,''), COALESCE(slot_no,''), created_at FROM registrations WHERE event_id=? AND status != 'cancelled' ORDER BY created_at`,
		ev.ID,
	)
	if err != nil {
		Error(w, http.StatusInternalServerError, "数据库错误")
		return
	}
	defer rows.Close()

	regs := make([]RegRow, 0)
	for rows.Next() {
		var reg RegRow
		if err := rows.Scan(&reg.ID, &reg.Name, &reg.Phone, &reg.Status, &reg.TeamNo, &reg.SlotNo, &reg.CreatedAt); err != nil {
			continue
		}
		regs = append(regs, reg)
	}

	// Build team grid
	type SlotInfoAdmin struct {
		TeamNo int    `json:"teamNo"`
		SlotNo int    `json:"slotNo"`
		Name   string `json:"name"`
		Phone  string `json:"phone"`
		Filled bool   `json:"filled"`
		RegID  int64  `json:"regId"`
	}
	capacity := ev.TeamCount * 4
	slots := make([]SlotInfoAdmin, capacity)
	for t := 0; t < ev.TeamCount; t++ {
		for s := 0; s < 4; s++ {
			slots[t*4+s] = SlotInfoAdmin{TeamNo: t + 1, SlotNo: s + 1}
		}
	}
	type WaitEntry struct {
		Name  string `json:"name"`
		Phone string `json:"phone"`
	}
	waitlist := make([]WaitEntry, 0)
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
					slots[idx].RegID = reg.ID
				}
			}
		} else if reg.Status == "waitlist" {
			waitlist = append(waitlist, WaitEntry{Name: reg.Name, Phone: reg.Phone})
		}
	}

	type AdminTeamInfo struct {
		TeamNo int             `json:"teamNo"`
		Slots  []SlotInfoAdmin `json:"slots"`
	}
	teams := make([]AdminTeamInfo, 0)
	for t := 0; t < ev.TeamCount; t++ {
		teams = append(teams, AdminTeamInfo{TeamNo: t + 1, Slots: slots[t*4 : (t+1)*4]})
	}

	result := map[string]interface{}{
		"event": EventInfo{
			ID:          ev.ID,
			EventDate:   ev.EventDate,
			Open:        ev.Open,
			TeamCount:   ev.TeamCount,
				Ended:      ev.Ended,
			Note:        ev.Note,
			StartTime:   ev.StartTime,
			EndTime:     ev.EndTime,
			ActualStart: ev.ActualStart,
			ActualEnd:   ev.ActualEnd,
		},
		"registrations": regs,
		"teams":         teams,
		"waitlist":      waitlist,
		"pubgEnabled":   a.cfg.PUBGAPIKey != "",
	}

	if a.cfg.PUBGAPIKey != "" {
		rankings, _ := service.GetEventRankings(a.db, ev.ID)
		if rankings == nil {
			rankings = []service.RankEntry{}
		}
		result["rankings"] = rankings
	}

	Success(w, result)
}

// ManualRegister 管理员手动添加报名到指定空位
func (a *AdminAPI) ManualRegister(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		Error(w, http.StatusBadRequest, "日期格式不正确")
		return
	}

	var req struct {
		Name   string `json:"name"`
		TeamNo int    `json:"teamNo"`
		SlotNo int    `json:"slotNo"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "请求格式错误")
		return
	}

	if !service.ValidateName(req.Name) {
		Error(w, http.StatusBadRequest, "游戏名格式错误")
		return
	}
	if req.TeamNo < 1 || req.SlotNo < 1 || req.SlotNo > 4 {
		Error(w, http.StatusBadRequest, "队伍或位置参数无效")
		return
	}

	ev, err := getEventByDate(a.db, date)
	if err == sql.ErrNoRows {
		Error(w, http.StatusNotFound, "活动不存在")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "数据库错误")
		return
	}
	if req.TeamNo > ev.TeamCount {
		Error(w, http.StatusBadRequest, "队伍编号超出范围")
		return
	}

	// 检查该位置是否已有人
	var occupied int
	if err := a.db.QueryRow(
		`SELECT COUNT(*) FROM registrations WHERE event_id=? AND team_no=? AND slot_no=? AND status='assigned'`,
		ev.ID, req.TeamNo, req.SlotNo,
	).Scan(&occupied); err != nil {
		Error(w, http.StatusInternalServerError, "数据库错误")
		return
	}
	if occupied > 0 {
		Error(w, http.StatusConflict, "该位置已有人")
		return
	}

	// 检查同名是否已报名
	var nameCnt int
	if err := a.db.QueryRow(
		`SELECT COUNT(*) FROM registrations WHERE event_id=? AND name=? AND status != 'cancelled'`,
		ev.ID, req.Name,
	).Scan(&nameCnt); err != nil {
		Error(w, http.StatusInternalServerError, "数据库错误")
		return
	}
	if nameCnt > 0 {
		Error(w, http.StatusConflict, "该游戏名已报名")
		return
	}

	_, err = a.db.Exec(
		`INSERT INTO registrations (event_id, name, phone, status, team_no, slot_no, leave_token_hash, leave_token_salt) VALUES (?,?,'admin','assigned',?,?,?,?)`,
		ev.ID, req.Name, req.TeamNo, req.SlotNo, "", "",
	)
	if err != nil {
		log.Printf("[Admin] ManualRegister insert error: %v", err)
		Error(w, http.StatusInternalServerError, "添加失败: "+err.Error())
		return
	}
	Success(w, nil)
}

// RemoveRegistration 管理员移除单个报名
func (a *AdminAPI) RemoveRegistration(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		Error(w, http.StatusBadRequest, "日期格式不正确")
		return
	}

	var req struct {
		RegID int64 `json:"regId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	if req.RegID <= 0 {
		Error(w, http.StatusBadRequest, "无效的报名 ID")
		return
	}

	// 验证报名属于该活动
	var eventID int64
	if err := a.db.QueryRow(`SELECT event_id FROM registrations WHERE id=?`, req.RegID).Scan(&eventID); err != nil {
		Error(w, http.StatusNotFound, "报名记录不存在")
		return
	}

	var dateCheck string
	if err := a.db.QueryRow(`SELECT event_date FROM events WHERE id=?`, eventID).Scan(&dateCheck); err != nil {
		Error(w, http.StatusInternalServerError, "数据库错误")
		return
	}
	if dateCheck != date {
		Error(w, http.StatusBadRequest, "报名记录不属于该活动")
		return
	}

	_, err := a.db.Exec(
		`UPDATE registrations SET status='cancelled', cancelled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
		req.RegID,
	)
	if err != nil {
		Error(w, http.StatusInternalServerError, "移除失败")
		return
	}
	Success(w, nil)
}

// ExportCSV 导出 CSV
func (a *AdminAPI) ExportCSV(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		Error(w, http.StatusBadRequest, "日期格式不正确")
		return
	}

	var eventID int64
	if err := a.db.QueryRow(`SELECT id FROM events WHERE event_date=?`, date).Scan(&eventID); err != nil {
		Error(w, http.StatusNotFound, "活动不存在")
		return
	}

	rows, err := a.db.Query(
		`SELECT name, phone, status, COALESCE(team_no,''), COALESCE(slot_no,''), created_at FROM registrations WHERE event_id=? ORDER BY created_at`,
		eventID,
	)
	if err != nil {
		Error(w, http.StatusInternalServerError, "数据库错误")
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

// RefreshRankings 刷新 PUBG 排名
func (a *AdminAPI) RefreshRankings(w http.ResponseWriter, r *http.Request) {
	if a.cfg.PUBGAPIKey == "" {
		Error(w, http.StatusForbidden, "PUBG API Key 未配置")
		return
	}
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		Error(w, http.StatusBadRequest, "日期格式不正确")
		return
	}

	var eventID int64
	var actualStart, actualEnd string
	err := a.db.QueryRow(
		`SELECT id, COALESCE(actual_start,''), COALESCE(actual_end,'') FROM events WHERE event_date=?`,
		date,
	).Scan(&eventID, &actualStart, &actualEnd)
	if err != nil {
		Error(w, http.StatusNotFound, "活动不存在")
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

	Success(w, map[string]string{"msg": "ranking_refresh_started"})
}

// StartEvent 快捷记录活动实际开始时间
func (a *AdminAPI) StartEvent(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		Error(w, http.StatusBadRequest, "日期格式不正确")
		return
	}

	loc, _ := time.LoadLocation("Asia/Shanghai")
	if loc == nil {
		loc = time.UTC
	}
	now := time.Now().In(loc).Format("2006-01-02T15:04")

	res, err := a.db.Exec(
		`UPDATE events SET actual_start=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE event_date=?`,
		now, date,
	)
	if err != nil {
		Error(w, http.StatusInternalServerError, "更新失败")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		Error(w, http.StatusNotFound, "活动不存在")
		return
	}
	Success(w, map[string]string{"actualStart": now})
}

// EndEvent 快捷记录活动实际结束时间，并自动触发战绩刷新
func (a *AdminAPI) EndEvent(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	if !validateDate(date) {
		Error(w, http.StatusBadRequest, "日期格式不正确")
		return
	}

	loc, _ := time.LoadLocation("Asia/Shanghai")
	if loc == nil {
		loc = time.UTC
	}
	now := time.Now().In(loc).Format("2006-01-02T15:04")

	var eventID int64
	var actualStart string
	err := a.db.QueryRow(
		`SELECT id, COALESCE(actual_start,'') FROM events WHERE event_date=?`, date,
	).Scan(&eventID, &actualStart)
	if err != nil {
		Error(w, http.StatusNotFound, "活动不存在")
		return
	}

	if _, err := a.db.Exec(
		`UPDATE events SET actual_end=?, open=0, ended=1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE event_date=?`,
		now, date,
	); err != nil {
		Error(w, http.StatusInternalServerError, "更新失败")
		return
	}

	if a.cfg.PUBGAPIKey != "" {
		client := service.NewPUBGClient(a.cfg.PUBGAPIKey, a.cfg.PUBGShard)
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[PUBG] RefreshEventRankings panic for event %d: %v", eventID, r)
				}
			}()
			if _, err := service.RefreshEventRankings(a.db, client, eventID, actualStart, now); err != nil {
				log.Printf("[PUBG] RefreshEventRankings error for event %d: %v", eventID, err)
			}
		}()
	}

	Success(w, map[string]string{"actualEnd": now})
}

// ListUsers 用户列表
func (a *AdminAPI) ListUsers(w http.ResponseWriter, r *http.Request) {
	type UserRow struct {
		ID        int64    `json:"id"`
		Phone     string   `json:"phone"`
		CreatedAt string   `json:"createdAt"`
		GameNames []string `json:"gameNames"`
		RegCount  int      `json:"regCount"`
	}

	rows, err := a.db.Query(`
		SELECT u.id, u.phone, u.created_at,
		       (SELECT COUNT(*) FROM registrations WHERE user_id=u.id AND status != 'cancelled') as reg_count
		FROM users u ORDER BY u.created_at DESC
	`)
	if err != nil {
		Error(w, http.StatusInternalServerError, "数据库错误")
		return
	}

	users := make([]UserRow, 0)
	for rows.Next() {
		var u UserRow
		if err := rows.Scan(&u.ID, &u.Phone, &u.CreatedAt, &u.RegCount); err != nil {
			continue
		}
		u.GameNames = []string{}
		users = append(users, u)
	}
	rows.Close()

	for i := range users {
		gnRows, err := a.db.Query(`SELECT game_name FROM user_game_names WHERE user_id=? ORDER BY last_used_at DESC LIMIT 5`, users[i].ID)
		if err == nil {
			for gnRows.Next() {
				var gn string
				if gnRows.Scan(&gn) == nil {
					users[i].GameNames = append(users[i].GameNames, gn)
				}
			}
			gnRows.Close()
		}
	}

	Success(w, users)
}

// GetUser 获取单个用户详情
func (a *AdminAPI) GetUser(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	uid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || uid <= 0 {
		Error(w, http.StatusBadRequest, "无效的用户 ID")
		return
	}

	type UserDetail struct {
		ID        int64    `json:"id"`
		Phone     string   `json:"phone"`
		CreatedAt string   `json:"createdAt"`
		GameNames []string `json:"gameNames"`
	}
	var u UserDetail
	err = a.db.QueryRow(`SELECT id, phone, created_at FROM users WHERE id=?`, uid).
		Scan(&u.ID, &u.Phone, &u.CreatedAt)
	if err == sql.ErrNoRows {
		Error(w, http.StatusNotFound, "用户不存在")
		return
	}
	if err != nil {
		Error(w, http.StatusInternalServerError, "数据库错误")
		return
	}

	u.GameNames = []string{}
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

	type RegHistory struct {
		EventDate string `json:"eventDate"`
		Name      string `json:"name"`
		Status    string `json:"status"`
		CreatedAt string `json:"createdAt"`
	}
	regHistory := make([]RegHistory, 0)
	histRows, err := a.db.Query(`
		SELECT e.event_date, r.name, r.status, r.created_at
		FROM registrations r JOIN events e ON e.id=r.event_id
		WHERE r.user_id=? ORDER BY r.created_at DESC LIMIT 20
	`, uid)
	if err == nil {
		for histRows.Next() {
			var h RegHistory
			if histRows.Scan(&h.EventDate, &h.Name, &h.Status, &h.CreatedAt) == nil {
				regHistory = append(regHistory, h)
			}
		}
		histRows.Close()
	}

	Success(w, map[string]interface{}{
		"user":       u,
		"regHistory": regHistory,
	})
}

// UpdateUser 更新用户手机号
func (a *AdminAPI) UpdateUser(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	uid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || uid <= 0 {
		Error(w, http.StatusBadRequest, "无效的用户 ID")
		return
	}

	var req struct {
		Phone string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "请求格式错误")
		return
	}

	if !service.ValidatePhone(req.Phone) {
		Error(w, http.StatusBadRequest, "手机号格式错误")
		return
	}

	var existID int64
	checkErr := a.db.QueryRow(`SELECT id FROM users WHERE phone=? AND id != ?`, req.Phone, uid).Scan(&existID)
	if checkErr == nil {
		Error(w, http.StatusBadRequest, "手机号已被其他用户使用")
		return
	}

	tx, err := a.db.Begin()
	if err != nil {
		Error(w, http.StatusInternalServerError, "数据库错误")
		return
	}
	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	if _, err = tx.Exec(
		`UPDATE users SET phone=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
		req.Phone, uid,
	); err != nil {
		Error(w, http.StatusInternalServerError, "更新失败")
		return
	}
	if _, err = tx.Exec(
		`UPDATE registrations SET phone=? WHERE user_id=? AND status != 'cancelled'`,
		req.Phone, uid,
	); err != nil {
		Error(w, http.StatusInternalServerError, "更新报名记录失败")
		return
	}

	if err = tx.Commit(); err != nil {
		Error(w, http.StatusInternalServerError, "提交失败")
		return
	}
	Success(w, nil)
}

// AddGameName 新增游戏名
func (a *AdminAPI) AddGameName(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	uid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || uid <= 0 {
		Error(w, http.StatusBadRequest, "无效的用户 ID")
		return
	}

	var req struct {
		GameName string `json:"gameName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "请求格式错误")
		return
	}

	if !service.ValidateName(req.GameName) {
		Error(w, http.StatusBadRequest, "游戏名格式错误（仅限中英文、数字、下划线、空格，最长20字符）")
		return
	}

	var userExists int
	if err := a.db.QueryRow(`SELECT 1 FROM users WHERE id=?`, uid).Scan(&userExists); err != nil {
		Error(w, http.StatusNotFound, "用户不存在")
		return
	}

	if _, err := a.db.Exec(`
		INSERT INTO user_game_names (user_id, game_name, used_count, last_used_at)
		VALUES (?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		ON CONFLICT(user_id, game_name) DO UPDATE SET
			last_used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
	`, uid, req.GameName); err != nil {
		Error(w, http.StatusInternalServerError, "新增游戏名失败")
		return
	}
	Success(w, nil)
}

// UpdateGameName 重命名游戏名（同步更新历史报名记录）
func (a *AdminAPI) UpdateGameName(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	uid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || uid <= 0 {
		Error(w, http.StatusBadRequest, "无效的用户 ID")
		return
	}

	var req struct {
		OldName string `json:"oldName"`
		NewName string `json:"newName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "请求格式错误")
		return
	}

	if req.OldName == "" || req.NewName == "" {
		Error(w, http.StatusBadRequest, "游戏名不能为空")
		return
	}
	if !service.ValidateName(req.NewName) {
		Error(w, http.StatusBadRequest, "游戏名格式错误（仅限中英文、数字、下划线、空格，最长20字符）")
		return
	}
	if req.OldName == req.NewName {
		Success(w, nil)
		return
	}

	tx, txErr := a.db.Begin()
	if txErr != nil {
		Error(w, http.StatusInternalServerError, "数据库错误")
		return
	}
	committed := false
	defer func() {
		if !committed {
			tx.Rollback()
		}
	}()

	res, execErr := tx.Exec(
		`UPDATE user_game_names SET game_name=? WHERE user_id=? AND game_name=?`,
		req.NewName, uid, req.OldName,
	)
	if execErr != nil {
		Error(w, http.StatusInternalServerError, "重命名失败")
		return
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		Error(w, http.StatusNotFound, "游戏名不存在")
		return
	}
	if _, execErr = tx.Exec(
		`UPDATE registrations SET name=? WHERE user_id=? AND name=?`,
		req.NewName, uid, req.OldName,
	); execErr != nil {
		Error(w, http.StatusInternalServerError, "同步报名记录失败")
		return
	}

	if err := tx.Commit(); err != nil {
		Error(w, http.StatusInternalServerError, "提交失败")
		return
	}
	committed = true
	Success(w, nil)
}

// DeleteGameName 删除游戏名
func (a *AdminAPI) DeleteGameName(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	uid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || uid <= 0 {
		Error(w, http.StatusBadRequest, "无效的用户 ID")
		return
	}

	name := chi.URLParam(r, "name")
	if name == "" {
		Error(w, http.StatusBadRequest, "游戏名不能为空")
		return
	}

	res, err := a.db.Exec(
		`DELETE FROM user_game_names WHERE user_id=? AND game_name=?`,
		uid, name,
	)
	if err != nil {
		Error(w, http.StatusInternalServerError, "删除失败")
		return
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		Error(w, http.StatusNotFound, "游戏名不存在")
		return
	}
	Success(w, nil)
}

// DeleteUser 删除用户
func (a *AdminAPI) DeleteUser(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	uid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || uid <= 0 {
		Error(w, http.StatusBadRequest, "无效的用户 ID")
		return
	}

	var phone string
	if err := a.db.QueryRow(`SELECT phone FROM users WHERE id=?`, uid).Scan(&phone); err != nil {
		Error(w, http.StatusNotFound, "用户不存在")
		return
	}

	tx, err := a.db.Begin()
	if err != nil {
		Error(w, http.StatusInternalServerError, "数据库错误")
		return
	}
	if _, err := tx.Exec(`UPDATE registrations SET status='cancelled', cancelled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND status != 'cancelled'`, uid); err != nil {
		tx.Rollback()
		Error(w, http.StatusInternalServerError, "取消报名失败")
		return
	}
	if _, err := tx.Exec(`DELETE FROM user_game_names WHERE user_id=?`, uid); err != nil {
		tx.Rollback()
		Error(w, http.StatusInternalServerError, "删除游戏名失败")
		return
	}
	tx.Exec(`DELETE FROM login_bans WHERE ban_key=?`, phone)
	if _, err := tx.Exec(`DELETE FROM users WHERE id=?`, uid); err != nil {
		tx.Rollback()
		Error(w, http.StatusInternalServerError, "删除用户失败")
		return
	}
	if err := tx.Commit(); err != nil {
		Error(w, http.StatusInternalServerError, "提交失败")
		return
	}
	Success(w, nil)
}

// ResetUserPassword 重置用户密码
func (a *AdminAPI) ResetUserPassword(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	uid, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || uid <= 0 {
		Error(w, http.StatusBadRequest, "无效的用户 ID")
		return
	}

	var req struct {
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "请求格式错误")
		return
	}

	if len(req.NewPassword) < 6 {
		Error(w, http.StatusBadRequest, "密码至少6位")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		Error(w, http.StatusInternalServerError, "哈希失败")
		return
	}

	if _, err := a.db.Exec(
		`UPDATE users SET password_hash=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
		string(hash), uid,
	); err != nil {
		Error(w, http.StatusInternalServerError, "更新密码失败")
		return
	}

	var phone string
	if a.db.QueryRow(`SELECT phone FROM users WHERE id=?`, uid).Scan(&phone) == nil {
		a.db.Exec(`DELETE FROM login_bans WHERE ban_key=?`, phone)
	}

	Success(w, map[string]string{"msg": "password_reset"})
}

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
