package api

import (
	"context"
	"sync"
)

type jobStatus struct {
	status  string // "calculating" | "done" | "idle"
	current int
	total   int
	cancel  context.CancelFunc
}

// RankingJobManager 追踪每个活动的战绩计算任务状态。
type RankingJobManager struct {
	mu   sync.Mutex
	jobs map[int64]*jobStatus
}

func newRankingJobManager() *RankingJobManager {
	return &RankingJobManager{jobs: make(map[int64]*jobStatus)}
}

// Start 取消该活动已有的任务并启动新任务，返回可取消的 context 及 cancel 函数。
func (m *RankingJobManager) Start(eventID int64, total int) (context.Context, context.CancelFunc) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if j, ok := m.jobs[eventID]; ok && j.cancel != nil {
		j.cancel()
	}

	ctx, cancel := context.WithCancel(context.Background())
	m.jobs[eventID] = &jobStatus{
		status:  "calculating",
		current: 0,
		total:   total,
		cancel:  cancel,
	}
	return ctx, cancel
}

// SetProgress 更新当前处理进度。
func (m *RankingJobManager) SetProgress(eventID int64, current, total int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if j, ok := m.jobs[eventID]; ok {
		j.current = current
		j.total = total
	}
}

// Done 将任务标记为完成。
func (m *RankingJobManager) Done(eventID int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if j, ok := m.jobs[eventID]; ok {
		j.status = "done"
		j.cancel = nil
	}
}

// GetStatus 返回任务状态及进度，未找到时返回 "idle"。
func (m *RankingJobManager) GetStatus(eventID int64) (status string, current, total int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if j, ok := m.jobs[eventID]; ok {
		return j.status, j.current, j.total
	}
	return "idle", 0, 0
}
