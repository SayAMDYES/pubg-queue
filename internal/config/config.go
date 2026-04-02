package config

import (
	"os"
	"strconv"
)

// AdminUsername 是固定的管理员用户名
const AdminUsername = "admin"

type Config struct {
	Port               string
	DBPath             string
	AdminPassHash      string // bcrypt 哈希，启动时由 --admin-pass 参数生成
	SessionSecret      string
	CSRFSecret         string
	TZ                 string
	AllowDuplicateName bool
	RateLimitRegister  int
	RateLimitLeave     int
	SecureCookie       bool
}

func Load() *Config {
	c := &Config{
		Port:               getEnv("PORT", "8080"),
		DBPath:             getEnv("DB_PATH", "./data/pubg_queue.db"),
		SessionSecret:      getEnv("SESSION_SECRET", "change-this-to-a-random-32-byte-string"),
		CSRFSecret:         getEnv("CSRF_SECRET", "change-this-to-another-32byte-str!"),
		TZ:                 getEnv("TZ", "Asia/Shanghai"),
		AllowDuplicateName: getBoolEnv("ALLOW_DUPLICATE_NAME", false),
		RateLimitRegister:  getIntEnv("RATE_LIMIT_REGISTER", 5),
		RateLimitLeave:     getIntEnv("RATE_LIMIT_LEAVE", 5),
		SecureCookie:       getBoolEnv("SECURE_COOKIE", false),
	}
	return c
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getBoolEnv(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}

func getIntEnv(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return i
}
