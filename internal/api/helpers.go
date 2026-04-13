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
	ev.Ended, ev.Open = autoEndCheck(ev.EventDate, ev.StartTime, ev.EndTime, ev.Ended)
	return ev, nil
}

// autoEndCheck 根据 end_time、start_time 和活动日期自动判定已结束状态
func autoEndCheck(eventDate, startTime, endTime string, ended bool) (bool, bool) {
	if ended {
		return true, false
	}
	if endTime != "" {
		if t, err := time.ParseInLocation("2006-01-02T15:04", endTime, time.Local); err == nil && time.Now().After(t) {
			return true, false
		}
	} else if startTime != "" {
		if t, err := time.ParseInLocation("2006-01-02T15:04", eventDate+"T"+startTime, time.Local); err == nil && time.Now().After(t.Add(4*time.Hour)) {
			return true, false
		}
	} else {
		today := time.Now().Format("2006-01-02")
		if eventDate < today {
			return true, false
		}
	}
	return false, true
}

func getClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return xff
	}
	return r.RemoteAddr
}
