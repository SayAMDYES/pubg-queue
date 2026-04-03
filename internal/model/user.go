package model

type User struct {
	ID           int64
	Phone        string
	PasswordHash string
	CreatedAt    string
	UpdatedAt    string
}

type UserGameName struct {
	ID         int64
	UserID     int64
	GameName   string
	UsedCount  int
	LastUsedAt string
}
