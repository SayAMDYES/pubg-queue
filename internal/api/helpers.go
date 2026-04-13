package api

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/SayAMDYES/pubg-queue/internal/model"
)

func validateDate(date string) bool {
	_, err := time.Parse("2006-01-02", date)
	return err == nil
}

func getEventByDate(db *sql.DB, date string) (model.Event, error) {
	var ev model.Event
	var openInt, endedInt int
	err := db.QueryRow(
		`SELECT id, event_date, open, COALESCE(ended,0), team_count, COALESCE(note,''), COALESCE(start_time,''), COALESCE(end_time,''),
		 COALESCE(actual_start,''), COALESCE(actual_end,'') FROM events WHERE event_date=?`,
		date,
	).Scan(&ev.ID, &ev.EventDate, &openInt, &endedInt, &ev.TeamCount, &ev.Note,
		&ev.StartTime, &ev.EndTime, &ev.ActualStart, &ev.ActualEnd)
	if err != nil {
		return ev, err
	}
	ev.Open = openInt == 1
	ev.Ended = endedInt == 1
	// 根据预设结束时间自动判定已结束状态
	if !ev.Ended && ev.EndTime != "" {
		if t, err := time.ParseInLocation("2006-01-02T15:04", ev.EndTime, time.Local); err == nil && time.Now().After(t) {
			ev.Ended = true
			ev.Open = false
		}
	}
	return ev, nil
}

func getClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return xff
	}
	return r.RemoteAddr
}
