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

		// Compute the deterministic hash for direct indexed lookup.
		_, tokenHash, _, _ := service.GenerateLeaveTokenHash(token)

		leftName, promotedName, err := service.LeaveAndPromote(db, tokenHash)
		if err != nil {
			renderError(w, r, http.StatusNotFound, "无效或已使用的离队令牌")
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
