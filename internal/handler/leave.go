package handler

import (
	"database/sql"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/SayAMDYES/pubg-queue/internal/config"
	"github.com/SayAMDYES/pubg-queue/internal/middleware"
	"github.com/SayAMDYES/pubg-queue/internal/service"
	"github.com/SayAMDYES/pubg-queue/internal/tmpl"
	"github.com/gorilla/csrf"
)

// LeaveHandler 通过手机号+密码离队（绑定具体活动日期）。
func LeaveHandler(db *sql.DB, cfg *config.Config, bans interface {
	IsBanned(string) bool
	RecordFailure(string)
	ClearFailures(string)
}) http.HandlerFunc {
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

		phone := r.FormValue("phone")
		password := r.FormValue("password")
		ip := getClientIP(r)

		// 检查封禁
		if bans.IsBanned(ip) || (phone != "" && bans.IsBanned(phone)) {
			renderError(w, r, http.StatusTooManyRequests, "您的账号或网络已被暂时封禁（24小时），请稍后再试。")
			return
		}

		// 验证手机号+密码
		userID, _, authErr := service.GetOrCreateUser(db, phone, password)
		if authErr != nil {
			errCode := authErr.Error()
			if errCode == "wrong_password" {
				bans.RecordFailure(ip)
				bans.RecordFailure(phone)
			}
			http.Redirect(w, r, "/date/"+date+"?err=leave_"+errCode, http.StatusFound)
			return
		}
		bans.ClearFailures(ip)
		bans.ClearFailures(phone)

		// 保存用户 session
		middleware.SaveUserSession(w, db, cfg, userID, phone)

		leftName, promotedName, leaveErr := service.LeaveByUser(db, ev.ID, userID, phone)
		if leaveErr != nil {
			http.Redirect(w, r, "/date/"+date+"?err=registration_not_found", http.StatusFound)
			return
		}

		data := map[string]interface{}{
			"Title":        "离队成功",
			"LeftName":     leftName,
			"PromotedName": promotedName,
			"EventDate":    date,
			"CSRFToken":    csrf.Token(r),
		}
		if err := tmpl.Render(w, "leave_result.html", data); err != nil {
			http.Error(w, "template error", http.StatusInternalServerError)
		}
	}
}

// LegacyLeaveHandler 保留旧的6位码离队方式（向后兼容已有数据）。
func LegacyLeaveHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := r.FormValue("token")
		if token == "" {
			renderError(w, r, http.StatusBadRequest, "missing token")
			return
		}

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
			"EventDate":    "",
			"CSRFToken":    csrf.Token(r),
		}
		if err := tmpl.Render(w, "leave_result.html", data); err != nil {
			http.Error(w, "template error", http.StatusInternalServerError)
		}
	}
}
