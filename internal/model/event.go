package model

type Event struct {
	ID        int64
	EventDate string
	Open      bool
	TeamCount int
	Note      string
	StartTime string // HH:MM 格式，例如 "20:00"，可为空
	EndTime   string // HH:MM 格式，例如 "23:00"，可为空
	CreatedAt string
	UpdatedAt string
}
