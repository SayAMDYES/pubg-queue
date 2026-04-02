package handler

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/SayAMDYES/pubg-queue/internal/model"
	"github.com/SayAMDYES/pubg-queue/internal/service"
	"github.com/SayAMDYES/pubg-queue/internal/tmpl"
	"github.com/gorilla/csrf"
)

func validateDate(date string) bool {
	_, err := time.Parse("2006-01-02", date)
	return err == nil
}

func getEventByDate(db *sql.DB, date string) (model.Event, error) {
	var ev model.Event
	var openInt int
	err := db.QueryRow(
		`SELECT id, event_date, open, team_count, COALESCE(note,''), COALESCE(start_time,''), COALESCE(end_time,'') FROM events WHERE event_date=?`,
		date,
	).Scan(&ev.ID, &ev.EventDate, &openInt, &ev.TeamCount, &ev.Note, &ev.StartTime, &ev.EndTime)
	if err != nil {
		return ev, err
	}
	ev.Open = openInt == 1
	return ev, nil
}

func EventDetailHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		date := chi.URLParam(r, "date")
		if !validateDate(date) {
			renderError(w, r, http.StatusBadRequest, "日期格式不正确，应为 YYYY-MM-DD")
			return
		}

		ev, err := getEventByDate(db, date)
		if err == sql.ErrNoRows {
			renderError(w, r, http.StatusNotFound, "该日期没有活动")
			return
		}
		if err != nil {
			renderError(w, r, http.StatusInternalServerError, "database error")
			return
		}

		rows, err := db.Query(
			`SELECT id, name, phone, status, COALESCE(team_no,0), COALESCE(slot_no,0) FROM registrations WHERE event_id=? AND status != 'cancelled' ORDER BY created_at`,
			ev.ID,
		)
		if err != nil {
			renderError(w, r, http.StatusInternalServerError, "database error")
			return
		}
		defer rows.Close()

		type SlotInfo struct {
			TeamNo int
			SlotNo int
			Name   string
			Phone  string // 已脱敏
			Filled bool
		}

		capacity := ev.TeamCount * 4
		slots := make([]SlotInfo, capacity)
		for t := 0; t < ev.TeamCount; t++ {
			for s := 0; s < 4; s++ {
				slots[t*4+s] = SlotInfo{TeamNo: t + 1, SlotNo: s + 1}
			}
		}

		type WaitlistEntry struct {
			Name  string
			Phone string // 已脱敏
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

		type TeamInfo struct {
			TeamNo int
			Slots  []SlotInfo
		}
		var teams []TeamInfo
		for t := 0; t < ev.TeamCount; t++ {
			teams = append(teams, TeamInfo{
				TeamNo: t + 1,
				Slots:  slots[t*4 : (t+1)*4],
			})
		}

		data := map[string]interface{}{
			"Title":     ev.EventDate + " 活动",
			"Event":     ev,
			"Teams":     teams,
			"Waitlist":  waitlist,
			"CSRFToken": csrf.Token(r),
			"ErrMsg":    r.URL.Query().Get("err"),
		}

		if err := tmpl.Render(w, "event_detail.html", data); err != nil {
			http.Error(w, "template error", http.StatusInternalServerError)
		}
	}
}

func RegisterHandler(db *sql.DB, allowDup bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		date := chi.URLParam(r, "date")
		if !validateDate(date) {
			renderError(w, r, http.StatusBadRequest, "日期格式不正确")
			return
		}

		ev, err := getEventByDate(db, date)
		if err == sql.ErrNoRows {
			renderError(w, r, http.StatusNotFound, "该日期没有活动")
			return
		}
		if err != nil {
			renderError(w, r, http.StatusInternalServerError, "database error")
			return
		}

		name := r.FormValue("name")
		phone := r.FormValue("phone")

		if !service.ValidateName(name) {
			http.Redirect(w, r, "/date/"+date+"?err=invalid_name", http.StatusFound)
			return
		}
		if !service.ValidatePhone(phone) {
			http.Redirect(w, r, "/date/"+date+"?err=invalid_phone", http.StatusFound)
			return
		}

		_, status, plainToken, err := service.RegisterUserWithToken(db, ev.ID, name, phone, allowDup)
		if err != nil {
			errCode := err.Error()
			http.Redirect(w, r, "/date/"+date+"?err="+errCode, http.StatusFound)
			return
		}

		data := map[string]interface{}{
			"Title":       "报名成功",
			"Name":        name,
			"MaskedPhone": service.MaskPhone(phone),
			"Status":      status,
			"LeaveToken":  plainToken,
			"EventDate":   date,
			"CSRFToken":   csrf.Token(r),
		}
		w.Header().Set("Cache-Control", "no-store")
		if err := tmpl.Render(w, "register_success.html", data); err != nil {
			http.Error(w, "template error", http.StatusInternalServerError)
		}
	}
}
