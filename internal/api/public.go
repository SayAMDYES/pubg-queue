package api

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/SayAMDYES/pubg-queue/internal/config"
	"github.com/SayAMDYES/pubg-queue/internal/middleware"
	"github.com/SayAMDYES/pubg-queue/internal/service"
)

// CalendarDay 日历每一天的数据
type CalendarDay struct {
	Day        int    `json:"day"`
	Date       string `json:"date"`
	HasEvent   bool   `json:"hasEvent"`
	Open       bool   `json:"open"`
	Full       bool   `json:"full"`
	Past       bool   `json:"past"`
	IsToday    bool   `json:"isToday"`
	Registered int    `json:"registered"`
	Capacity   int    `json:"capacity"`
	StartTime  string `json:"startTime"`
}

// CalendarResponse 日历页响应
type CalendarResponse struct {
	Year         int           `json:"year"`
	Month        int           `json:"month"`
	MonthStr     string        `json:"monthStr"`
	PrevMonth    string        `json:"prevMonth"`
	NextMonth    string        `json:"nextMonth"`
	FirstWeekday int           `json:"firstWeekday"`
	Days         []CalendarDay `json:"days"`
}

func CalendarHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		monthStr := r.URL.Query().Get("month")
		var year, month int
		now := time.Now()
		if monthStr != "" {
			t, err := time.Parse("2006-01", monthStr)
			if err == nil {
				year = t.Year()
				month = int(t.Month())
			} else {
				year = now.Year()
				month = int(now.Month())
			}
		} else {
			year = now.Year()
			month = int(now.Month())
		}

		firstDay := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.Local)
		lastDay := firstDay.AddDate(0, 1, -1)

		startDate := firstDay.Format("2006-01-02")
		endDate := lastDay.Format("2006-01-02")

		rows, err := db.Query(
			`SELECT event_date, open, team_count, COALESCE(start_time,''),
				(SELECT COUNT(*) FROM registrations WHERE event_id=events.id AND status='assigned') as reg_count
			FROM events WHERE event_date >= ? AND event_date <= ? ORDER BY event_date`,
			startDate, endDate,
		)
		if err != nil {
			Error(w, http.StatusInternalServerError, "数据库错误")
			return
		}
		defer rows.Close()

		eventMap := map[string]CalendarDay{}
		for rows.Next() {
			var dateStr string
			var open int
			var teamCount int
			var startTime string
			var regCount int
			if err := rows.Scan(&dateStr, &open, &teamCount, &startTime, &regCount); err != nil {
				continue
			}
			capacity := teamCount * 4
			eventMap[dateStr] = CalendarDay{
				HasEvent:   true,
				Open:       open == 1,
				Full:       regCount >= capacity,
				Registered: regCount,
				Capacity:   capacity,
				StartTime:  startTime,
			}
		}

		today := now.Format("2006-01-02")
		days := make([]CalendarDay, 0, lastDay.Day())
		for d := 1; d <= lastDay.Day(); d++ {
			dateStr := time.Date(year, time.Month(month), d, 0, 0, 0, 0, time.Local).Format("2006-01-02")
			cd := CalendarDay{
				Day:     d,
				Date:    dateStr,
				Past:    dateStr < today,
				IsToday: dateStr == today,
			}
			if ev, ok := eventMap[dateStr]; ok {
				cd.HasEvent = ev.HasEvent
				cd.Open = ev.Open
				cd.Full = ev.Full
				cd.Registered = ev.Registered
				cd.Capacity = ev.Capacity
				cd.StartTime = ev.StartTime
			}
			days = append(days, cd)
		}

		resp := CalendarResponse{
			Year:         year,
			Month:        month,
			MonthStr:     firstDay.Format("2006年01月"),
			PrevMonth:    firstDay.AddDate(0, -1, 0).Format("2006-01"),
			NextMonth:    firstDay.AddDate(0, 1, 0).Format("2006-01"),
			FirstWeekday: int(firstDay.Weekday()),
			Days:         days,
		}
		Success(w, resp)
	}
}

// SlotInfo 队伍槽位信息
type SlotInfo struct {
	TeamNo int                      `json:"teamNo"`
	SlotNo int                      `json:"slotNo"`
	Name   string                   `json:"name"`
	Phone  string                   `json:"phone"`
	Filled bool                     `json:"filled"`
	Stats  *service.CachedPlayerStats `json:"stats,omitempty"`
}

// TeamInfo 队伍信息
type TeamInfo struct {
	TeamNo int        `json:"teamNo"`
	Slots  []SlotInfo `json:"slots"`
}

// WaitlistEntry 候补条目
type WaitlistEntry struct {
	Name  string `json:"name"`
	Phone string `json:"phone"`
}

// EventDetailResponse 活动详情响应
type EventDetailResponse struct {
	Event           EventInfo      `json:"event"`
	Teams           []TeamInfo     `json:"teams"`
	Waitlist        []WaitlistEntry `json:"waitlist"`
	UserPhone       string         `json:"userPhone"`
	UserLoggedIn    bool           `json:"userLoggedIn"`
	GameNames       []string       `json:"gameNames"`
	PUBGEnabled     bool           `json:"pubgEnabled"`
	RegisteredCount int            `json:"registeredCount"`
	Capacity        int            `json:"capacity"`
}

// EventInfo 活动基本信息
type EventInfo struct {
	ID          int64  `json:"id"`
	EventDate   string `json:"eventDate"`
	Open        bool   `json:"open"`
	TeamCount   int    `json:"teamCount"`
	Note        string `json:"note"`
	StartTime   string `json:"startTime"`
	EndTime     string `json:"endTime"`
	ActualStart string `json:"actualStart"`
	ActualEnd   string `json:"actualEnd"`
}

func EventDetailHandler(db *sql.DB, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		date := chi.URLParam(r, "date")
		if !validateDate(date) {
			Error(w, http.StatusBadRequest, "日期格式不正确，应为 YYYY-MM-DD")
			return
		}

		ev, err := getEventByDate(db, date)
		if err == sql.ErrNoRows {
			Error(w, http.StatusNotFound, "该日期没有活动")
			return
		}
		if err != nil {
			Error(w, http.StatusInternalServerError, "数据库错误")
			return
		}

		rows, err := db.Query(
			`SELECT id, name, phone, status, COALESCE(team_no,0), COALESCE(slot_no,0) FROM registrations WHERE event_id=? AND status != 'cancelled' ORDER BY created_at`,
			ev.ID,
		)
		if err != nil {
			Error(w, http.StatusInternalServerError, "数据库错误")
			return
		}
		defer rows.Close()

		capacity := ev.TeamCount * 4
		slots := make([]SlotInfo, capacity)
		for t := 0; t < ev.TeamCount; t++ {
			for s := 0; s < 4; s++ {
				slots[t*4+s] = SlotInfo{TeamNo: t + 1, SlotNo: s + 1}
			}
		}

		var waitlist []WaitlistEntry
		for rows.Next() {
			var id int64
			var name, phone, status string
			var teamNo, slotNo int
			if err := rows.Scan(&id, &name, &phone, &status, &teamNo, &slotNo); err != nil {
				continue
			}
			masked := service.MaskPhone(phone)
			if status == "assigned" && teamNo > 0 && slotNo > 0 {
				idx := (teamNo-1)*4 + (slotNo - 1)
				if idx >= 0 && idx < len(slots) {
					slots[idx].Name = name
					slots[idx].Phone = masked
					slots[idx].Filled = true
				}
			} else if status == "waitlist" {
				waitlist = append(waitlist, WaitlistEntry{Name: name, Phone: masked})
			}
		}

		var teams []TeamInfo
		for t := 0; t < ev.TeamCount; t++ {
			teams = append(teams, TeamInfo{
				TeamNo: t + 1,
				Slots:  slots[t*4 : (t+1)*4],
			})
		}

		userID, userPhone := middleware.GetUserSession(r, db, cfg)
		var gameNames []string
		if userID > 0 {
			gameNames, _ = service.GetUserGameNames(db, userID)
		}

		pubgEnabled := cfg.PUBGAPIKey != ""
		if pubgEnabled {
			for i := range slots {
				if slots[i].Filled {
					slots[i].Stats = service.GetCachedPlayerStats(db, slots[i].Name)
				}
			}
		}

		registeredCount := 0
		for _, s := range slots {
			if s.Filled {
				registeredCount++
			}
		}

		if waitlist == nil {
			waitlist = []WaitlistEntry{}
		}
		if gameNames == nil {
			gameNames = []string{}
		}

		resp := EventDetailResponse{
			Event: EventInfo{
				ID:          ev.ID,
				EventDate:   ev.EventDate,
				Open:        ev.Open,
				TeamCount:   ev.TeamCount,
				Note:        ev.Note,
				StartTime:   ev.StartTime,
				EndTime:     ev.EndTime,
				ActualStart: ev.ActualStart,
				ActualEnd:   ev.ActualEnd,
			},
			Teams:           teams,
			Waitlist:        waitlist,
			UserPhone:       userPhone,
			UserLoggedIn:    userID > 0,
			GameNames:       gameNames,
			PUBGEnabled:     pubgEnabled,
			RegisteredCount: registeredCount,
			Capacity:        capacity,
		}
		Success(w, resp)
	}
}

// UserLoginRequest 用户登录/注册请求
type UserLoginRequest struct {
	Phone    string `json:"phone"`
	Password string `json:"password"`
}

// UserMeResponse 当前登录用户信息
type UserMeResponse struct {
	LoggedIn  bool     `json:"loggedIn"`
	Phone     string   `json:"phone,omitempty"`
	GameNames []string `json:"gameNames"`
}

// UserLoginHandler 用户登录或首次注册
func UserLoginHandler(db *sql.DB, cfg *config.Config, bans interface {
	IsBanned(string) bool
	RecordFailure(string)
	ClearFailures(string)
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req UserLoginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			Error(w, http.StatusBadRequest, "请求格式错误")
			return
		}

		ip := getClientIP(r)
		if bans.IsBanned(ip) || (req.Phone != "" && bans.IsBanned(req.Phone)) {
			Error(w, http.StatusTooManyRequests, "您的账号或网络已被暂时封禁（24小时），请稍后再试。")
			return
		}

		userID, _, authErr := service.GetOrCreateUser(db, req.Phone, req.Password)
		if authErr != nil {
			errCode := authErr.Error()
			if errCode == "wrong_password" {
				bans.RecordFailure(ip)
				bans.RecordFailure(req.Phone)
			}
			Error(w, http.StatusBadRequest, errCode)
			return
		}
		bans.ClearFailures(ip)
		bans.ClearFailures(req.Phone)

		middleware.SaveUserSession(w, db, cfg, userID, req.Phone)

		gameNames, _ := service.GetUserGameNames(db, userID)
		if gameNames == nil {
			gameNames = []string{}
		}
		Success(w, UserMeResponse{LoggedIn: true, Phone: req.Phone, GameNames: gameNames})
	}
}

// UserLogoutHandler 用户登出
func UserLogoutHandler(db *sql.DB, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		middleware.DeleteSession(w, r, db, cfg)
		Success(w, nil)
	}
}

// UserMeHandler 查询当前登录用户信息
func UserMeHandler(db *sql.DB, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, phone := middleware.GetUserSession(r, db, cfg)
		if userID == 0 {
			Success(w, UserMeResponse{LoggedIn: false, GameNames: []string{}})
			return
		}
		gameNames, _ := service.GetUserGameNames(db, userID)
		if gameNames == nil {
			gameNames = []string{}
		}
		Success(w, UserMeResponse{LoggedIn: true, Phone: phone, GameNames: gameNames})
	}
}

// RegisterRequest 报名请求
type RegisterRequest struct {
	Name string `json:"name"`
}

// RegisterResponse 报名响应
type RegisterResponse struct {
	Name        string `json:"name"`
	MaskedPhone string `json:"maskedPhone"`
	Status      string `json:"status"`
	EventDate   string `json:"eventDate"`
}

func RegisterHandler(db *sql.DB, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		date := chi.URLParam(r, "date")
		if !validateDate(date) {
			Error(w, http.StatusBadRequest, "日期格式不正确")
			return
		}

		ev, err := getEventByDate(db, date)
		if err == sql.ErrNoRows {
			Error(w, http.StatusNotFound, "该日期没有活动")
			return
		}
		if err != nil {
			Error(w, http.StatusInternalServerError, "数据库错误")
			return
		}

		// 报名必须先登录
		userID, userPhone := middleware.GetUserSession(r, db, cfg)
		if userID == 0 {
			Error(w, http.StatusUnauthorized, "not_logged_in")
			return
		}

		var req RegisterRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			Error(w, http.StatusBadRequest, "请求格式错误")
			return
		}

		if !service.ValidateName(req.Name) {
			Error(w, http.StatusBadRequest, "invalid_name")
			return
		}

		_, status, _, regErr := service.Register(db, ev.ID, userID, req.Name, userPhone, cfg.AllowDuplicateName)
		if regErr != nil {
			Error(w, http.StatusBadRequest, regErr.Error())
			return
		}

		service.UpsertGameName(db, userID, req.Name)

		if cfg.PUBGAPIKey != "" {
			client := service.NewPUBGClient(cfg.PUBGAPIKey, cfg.PUBGShard)
			go func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[PUBG] CachePlayerSeasonStats panic for %s: %v", req.Name, r)
					}
				}()
				service.CachePlayerSeasonStats(db, client, req.Name)
			}()
		}

		Success(w, RegisterResponse{
			Name:        req.Name,
			MaskedPhone: service.MaskPhone(userPhone),
			Status:      status,
			EventDate:   date,
		})
	}
}

// LeaveRequest 离队请求
type LeaveRequest struct {
	Phone    string `json:"phone"`
	Password string `json:"password"`
}

// LeaveResponse 离队响应
type LeaveResponse struct {
	LeftName     string `json:"leftName"`
	PromotedName string `json:"promotedName"`
	EventDate    string `json:"eventDate"`
}

func LeaveHandler(db *sql.DB, cfg *config.Config, bans interface {
	IsBanned(string) bool
	RecordFailure(string)
	ClearFailures(string)
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		date := chi.URLParam(r, "date")
		if !validateDate(date) {
			Error(w, http.StatusBadRequest, "日期格式不正确")
			return
		}

		ev, err := getEventByDate(db, date)
		if err == sql.ErrNoRows {
			Error(w, http.StatusNotFound, "该日期没有活动")
			return
		}
		if err != nil {
			Error(w, http.StatusInternalServerError, "数据库错误")
			return
		}

		var userID int64
		var userPhone string

		// 优先使用 session 鉴权
		sessionUserID, sessionPhone := middleware.GetUserSession(r, db, cfg)
		if sessionUserID > 0 {
			userID = sessionUserID
			userPhone = sessionPhone
		} else {
			// 兼容未登录用户：使用手机号+密码
			var req LeaveRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				Error(w, http.StatusBadRequest, "请求格式错误")
				return
			}

			ip := getClientIP(r)
			if bans.IsBanned(ip) || (req.Phone != "" && bans.IsBanned(req.Phone)) {
				Error(w, http.StatusTooManyRequests, "您的账号或网络已被暂时封禁（24小时），请稍后再试。")
				return
			}

			uid, _, authErr := service.GetOrCreateUser(db, req.Phone, req.Password)
			if authErr != nil {
				errCode := authErr.Error()
				if errCode == "wrong_password" {
					bans.RecordFailure(ip)
					bans.RecordFailure(req.Phone)
				}
				Error(w, http.StatusBadRequest, errCode)
				return
			}
			bans.ClearFailures(ip)
			bans.ClearFailures(req.Phone)

			middleware.SaveUserSession(w, db, cfg, uid, req.Phone)
			userID = uid
			userPhone = req.Phone
		}

		leftName, promotedName, leaveErr := service.LeaveByUser(db, ev.ID, userID, userPhone)
		if leaveErr != nil {
			Error(w, http.StatusBadRequest, "registration_not_found")
			return
		}

		Success(w, LeaveResponse{
			LeftName:     leftName,
			PromotedName: promotedName,
			EventDate:    date,
		})
	}
}

// PlayerStatsResponse 战绩查询响应
type PlayerStatsResponse struct {
	AccountID      string   `json:"accountId"`
	PlayerName     string   `json:"playerName"`
	Matches        int      `json:"matches"`
	Kills          int      `json:"kills"`
	Deaths         int      `json:"deaths"`
	Assists        int      `json:"assists"`
	TotalDamage    float64  `json:"totalDamage"`
	AvgDamage      float64  `json:"avgDamage"`
	KDA            float64  `json:"kda"`
	RecentMatchIDs []string `json:"recentMatchIds"`
}

// PlayerStatsHandler 查询玩家战绩（赛季统计 + 近期对局ID）
func PlayerStatsHandler(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.PUBGAPIKey == "" {
			Error(w, http.StatusServiceUnavailable, "PUBG API 未配置")
			return
		}
		name := chi.URLParam(r, "name")
		if name == "" {
			Error(w, http.StatusBadRequest, "缺少玩家名")
			return
		}
		seasonID := r.URL.Query().Get("season")
		client := service.NewPUBGClient(cfg.PUBGAPIKey, cfg.PUBGShard)
		overview, err := client.GetPlayerStatsOverview(name, seasonID)
		if err != nil {
			if err.Error() == "player_not_found" || err.Error() == "not_found" {
				Error(w, http.StatusNotFound, "玩家不存在")
				return
			}
			log.Printf("[stats] GetPlayerStatsOverview %q: %v", name, err)
			Error(w, http.StatusInternalServerError, "查询失败")
			return
		}
		Success(w, overview)
	}
}

// SeasonsHandler 返回所有可用赛季列表
func SeasonsHandler(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.PUBGAPIKey == "" {
			Error(w, http.StatusServiceUnavailable, "PUBG API 未配置")
			return
		}
		client := service.NewPUBGClient(cfg.PUBGAPIKey, cfg.PUBGShard)
		seasons, err := client.GetAllSeasons()
		if err != nil {
			log.Printf("[stats] GetAllSeasons: %v", err)
			Error(w, http.StatusInternalServerError, "查询失败")
			return
		}
		Success(w, seasons)
	}
}

// MatchDetailResponse 单场比赛详情响应（与 service.MatchDetail 相同结构）
type MatchDetailHandler struct{}

// MatchDetailHandlerFunc 查询单场比赛详情
func MatchDetailHandlerFunc(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cfg.PUBGAPIKey == "" {
			Error(w, http.StatusServiceUnavailable, "PUBG API 未配置")
			return
		}
		matchID := chi.URLParam(r, "matchId")
		playerName := r.URL.Query().Get("player")
		if matchID == "" || playerName == "" {
			Error(w, http.StatusBadRequest, "缺少 matchId 或 player 参数")
			return
		}
		client := service.NewPUBGClient(cfg.PUBGAPIKey, cfg.PUBGShard)
		detail, err := client.GetMatchDetail(matchID, playerName)
		if err != nil {
			log.Printf("[stats] GetMatchDetail %q/%q: %v", matchID, playerName, err)
			Error(w, http.StatusInternalServerError, "查询失败")
			return
		}
		Success(w, detail)
	}
}

// LegacyLeaveHandler 保留旧的6位码离队方式
func LegacyLeaveHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Token string `json:"token"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
			Error(w, http.StatusBadRequest, "missing token")
			return
		}

		_, tokenHash, _, _ := service.GenerateLeaveTokenHash(req.Token)

		leftName, promotedName, err := service.LeaveAndPromote(db, tokenHash)
		if err != nil {
			Error(w, http.StatusNotFound, "无效或已使用的离队令牌")
			return
		}

		Success(w, LeaveResponse{
			LeftName:     leftName,
			PromotedName: promotedName,
		})
	}
}
