package model

type Event struct {
	ID          int64
	EventDate   string
	Open        bool
	Ended       bool
	TeamCount   int
	Note        string
	StartTime   string // HH:MM 格式，例如 "20:00"，可为空
	EndTime     string // HH:MM 格式，例如 "23:00"，可为空
	ActualStart string // 实际开战时间，"YYYY-MM-DDTHH:MM" 格式，可为空
	ActualEnd   string // 实际结束时间，"YYYY-MM-DDTHH:MM" 格式，可为空
	CreatedAt   string
	UpdatedAt   string
}
