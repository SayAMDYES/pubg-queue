package model

type Registration struct {
	ID             int64
	EventID        int64
	Name           string
	Phone          string
	Status         string
	TeamNo         *int
	SlotNo         *int
	CreatedAt      string
	CancelledAt    *string
	LeaveTokenHash string
	LeaveTokenSalt string
}
