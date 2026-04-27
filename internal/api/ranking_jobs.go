package api

import (
	"context"
	"sync"
)

// 任务阶段，与设计稿 §18.2 对齐。
const (
	JobPhaseIdle                = "idle"
	JobPhaseMatchFetching       = "match_fetching"
	JobPhaseBasicReady          = "basic_ready"
	JobPhaseTelemetryProcessing = "telemetry_processing"
	JobPhaseFullReady           = "full_ready"
	JobPhasePartialReady        = "partial_ready"
	JobPhaseFailed              = "failed"
)

type jobStatus struct {
	status  string // "calculating" | "done" | "idle"，向前兼容旧前端
	phase   string // 多阶段，详见 JobPhase* 常量
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
		phase:   JobPhaseMatchFetching,
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

// SetPhase 更新阶段（match_fetching / basic_ready / telemetry_processing 等）。
func (m *RankingJobManager) SetPhase(eventID int64, phase string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if j, ok := m.jobs[eventID]; ok {
		j.phase = phase
	}
}

// Done 将任务标记为完成。finalPhase 用于决定收尾阶段（full_ready / partial_ready / failed）。
func (m *RankingJobManager) Done(eventID int64, finalPhase string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if j, ok := m.jobs[eventID]; ok {
		j.status = "done"
		if finalPhase != "" {
			j.phase = finalPhase
		}
		j.cancel = nil
	}
}

// GetStatus 返回任务状态、阶段和进度。未找到任务时返回 idle。
func (m *RankingJobManager) GetStatus(eventID int64) (status, phase string, current, total int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if j, ok := m.jobs[eventID]; ok {
		ph := j.phase
		if ph == "" {
			ph = JobPhaseIdle
		}
		return j.status, ph, j.current, j.total
	}
	return "idle", JobPhaseIdle, 0, 0
}
