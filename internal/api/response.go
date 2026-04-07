package api

import (
	"encoding/json"
	"net/http"
)

// Response 统一 API 响应结构
type Response struct {
	Code int         `json:"code"`
	Msg  string      `json:"msg"`
	Data interface{} `json:"data,omitempty"`
}

func JSON(w http.ResponseWriter, code int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(Response{Code: code, Msg: "ok", Data: data})
}

func Error(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(Response{Code: code, Msg: msg})
}

func Success(w http.ResponseWriter, data interface{}) {
	JSON(w, http.StatusOK, data)
}
