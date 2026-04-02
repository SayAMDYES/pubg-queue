package handler

import (
	"database/sql"
	"net/http"

	"github.com/SayAMDYES/pubg-queue/internal/service"
	"github.com/SayAMDYES/pubg-queue/internal/tmpl"
	"github.com/gorilla/csrf"
)

func LeaveHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := r.FormValue("token")
		if token == "" {
			renderError(w, r, http.StatusBadRequest, "missing token")
			return
		}

		rows, err := db.Query(`SELECT leave_token_hash, leave_token_salt FROM registrations WHERE status != 'cancelled' LIMIT 10000`)
		if err != nil {
			renderError(w, r, http.StatusInternalServerError, "database error")
			return
		}
		defer rows.Close()

		var matchedHash string
		for rows.Next() {
			var hash, salt string
			if err := rows.Scan(&hash, &salt); err != nil {
				continue
			}
			if service.VerifyToken(token, hash, salt) {
				matchedHash = hash
				break
			}
		}
		rows.Close()

		if matchedHash == "" {
			renderError(w, r, http.StatusNotFound, "无效或已使用的离队令牌")
			return
		}

		leftName, promotedName, err := service.LeaveAndPromote(db, matchedHash)
		if err != nil {
			renderError(w, r, http.StatusBadRequest, err.Error())
			return
		}

		data := map[string]interface{}{
			"Title":        "离队成功",
			"LeftName":     leftName,
			"PromotedName": promotedName,
			"CSRFToken":    csrf.Token(r),
		}
		if err := tmpl.Render(w, "leave_result.html", data); err != nil {
			http.Error(w, "template error", http.StatusInternalServerError)
		}
	}
}
