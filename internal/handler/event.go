package handler

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/SayAMDYES/pubg-queue/internal/model"
	"github.com/SayAMDYES/pubg-queue/internal/service"
	"github.com/SayAMDYES/pubg-queue/internal/tmpl"
	"github.com/gorilla/csrf"
)

func EventDetailHandler(db *sql.DB, allowDup bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		idStr := chi.URLParam(r, "id")
		eventID, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			renderError(w, r, http.StatusBadRequest, "invalid event id")
			return
		}

		var ev model.Event
		var openInt int
		err = db.QueryRow(`SELECT id, event_date, open, team_count, COALESCE(note,'') FROM events WHERE id=?`, eventID).
			Scan(&ev.ID, &ev.EventDate, &openInt, &ev.TeamCount, &ev.Note)
		if err == sql.ErrNoRows {
			renderError(w, r, http.StatusNotFound, "event not found")
			return
		}
		if err != nil {
			renderError(w, r, http.StatusInternalServerError, "database error")
			return
		}
		ev.Open = openInt == 1

		rows, err := db.Query(
			`SELECT id, name, status, COALESCE(team_no,0), COALESCE(slot_no,0) FROM registrations WHERE event_id=? AND status != 'cancelled' ORDER BY created_at`,
			eventID,
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
			Filled bool
		}

		capacity := ev.TeamCount * 4
		slots := make([]SlotInfo, capacity)
		for t := 0; t < ev.TeamCount; t++ {
			for s := 0; s < 4; s++ {
				slots[t*4+s] = SlotInfo{TeamNo: t + 1, SlotNo: s + 1}
			}
		}

		var waitlist []string
		for rows.Next() {
			var id int64
			var name, status string
			var teamNo, slotNo int
			if err := rows.Scan(&id, &name, &status, &teamNo, &slotNo); err != nil {
				continue
			}
			if status == "assigned" && teamNo > 0 && slotNo > 0 {
				idx := (teamNo-1)*4 + (slotNo - 1)
				if idx >= 0 && idx < len(slots) {
					slots[idx].Name = name
					slots[idx].Filled = true
				}
			} else if status == "waitlist" {
				waitlist = append(waitlist, name)
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
		idStr := chi.URLParam(r, "id")
		eventID, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			renderError(w, r, http.StatusBadRequest, "invalid event id")
			return
		}

		name := r.FormValue("name")
		if !service.ValidateName(name) {
			http.Redirect(w, r, "/events/"+idStr+"?err=invalid_name", http.StatusFound)
			return
		}

		_, status, plainToken, err := service.RegisterUserWithToken(db, eventID, name, allowDup)
		if err != nil {
			http.Redirect(w, r, "/events/"+idStr+"?err="+err.Error(), http.StatusFound)
			return
		}

		data := map[string]interface{}{
			"Title":      "报名成功",
			"Name":       name,
			"Status":     status,
			"LeaveToken": plainToken,
			"CSRFToken":  csrf.Token(r),
		}
		w.Header().Set("Cache-Control", "no-store")
		if err := tmpl.Render(w, "register_success.html", data); err != nil {
			http.Error(w, "template error", http.StatusInternalServerError)
		}
	}
}
