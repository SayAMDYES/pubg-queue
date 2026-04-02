package handler

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/SayAMDYES/pubg-queue/internal/tmpl"
	"github.com/gorilla/csrf"
)

type CalendarDay struct {
	Day        int
	Date       string
	HasEvent   bool
	Open       bool
	Full       bool
	Past       bool
	IsToday    bool
	Registered int
	Capacity   int
	StartTime  string // HH:MM，可为空
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
			renderError(w, r, http.StatusInternalServerError, "database error")
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
		var days []CalendarDay
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

		prevMonth := firstDay.AddDate(0, -1, 0).Format("2006-01")
		nextMonth := firstDay.AddDate(0, 1, 0).Format("2006-01")

		data := map[string]interface{}{
			"Title":        "PUBG 排队",
			"Days":         days,
			"Year":         year,
			"Month":        month,
			"MonthStr":     firstDay.Format("2006年01月"),
			"PrevMonth":    prevMonth,
			"NextMonth":    nextMonth,
			"FirstWeekday": int(firstDay.Weekday()),
			"CSRFToken":    csrf.Token(r),
		}

		if err := tmpl.Render(w, "calendar.html", data); err != nil {
			http.Error(w, "template error: "+err.Error(), http.StatusInternalServerError)
		}
	}
}

func renderError(w http.ResponseWriter, r *http.Request, code int, msg string) {
	w.WriteHeader(code)
	data := map[string]interface{}{
		"Title":     "错误",
		"Code":      code,
		"Message":   msg,
		"CSRFToken": csrf.Token(r),
	}
	if err := tmpl.Render(w, "error.html", data); err != nil {
		http.Error(w, msg, code)
	}
}
