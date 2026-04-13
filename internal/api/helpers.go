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
// startTime/endTime 格式为 HH:mm（如 "21:30"），需结合 eventDate 拼接完整时间
func autoEndCheck(eventDate, startTime, endTime string, ended bool) (bool, bool) {
	if ended {
		return true, false
	}
	endDT := resolveEndTime(eventDate, startTime, endTime)
	if !endDT.IsZero() && time.Now().After(endDT) {
		return true, false
	}
	return false, true
}

// resolveEndTime 将 HH:mm 格式的 startTime/endTime 解析为完整时间
// 处理跨天情况：如果 endTime < startTime 则结束时间在次日
func resolveEndTime(eventDate, startTime, endTime string) time.Time {
	if endTime != "" && startTime != "" {
		s, serr := time.Parse("15:04", startTime)
		e, eerr := time.Parse("15:04", endTime)
		if serr == nil && eerr == nil {
			dateBase, _ := time.ParseInLocation("2006-01-02", eventDate, time.Local)
			endDT := time.Date(dateBase.Year(), dateBase.Month(), dateBase.Day(), e.Hour(), e.Minute(), 0, 0, time.Local)
			// 结束时间小于开始时间，说明跨天
			if e.Hour() < s.Hour() || (e.Hour() == s.Hour() && e.Minute() < s.Minute()) {
				endDT = endDT.AddDate(0, 0, 1)
			}
			return endDT
		}
	}
	if endTime != "" {
		if t, err := time.ParseInLocation("2006-01-02T15:04", endTime, time.Local); err == nil {
			return t
		}
	}
	if startTime != "" {
		if t, err := time.ParseInLocation("2006-01-02T15:04", eventDate+"T"+startTime, time.Local); err == nil {
			return t.Add(4 * time.Hour)
		}
	}
	// 没有时间信息，按日期判断（次日零点后视为已结束）
	today := time.Now().Format("2006-01-02")
	if eventDate < today {
		return time.Date(2000, 1, 1, 0, 0, 0, 0, time.Local) // 一个过去的任意时间
	}
	return time.Time{}
}

func getClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return xff
	}
	return r.RemoteAddr
}
