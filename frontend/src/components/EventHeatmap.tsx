import { Tooltip } from 'antd';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AdminEventRow } from '../api';

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const VISIBLE_DAY_ROWS = new Set([0, 2, 4]);
const TOTAL_WEEKS = 53;
const CELL_SIZE = 12;
const CELL_GAP = 3;
const MONTH_ROW_HEIGHT = 16;

type Cell = {
  date: string;
  weekIdx: number;
  dow: number;
  ev?: AdminEventRow;
  isToday: boolean;
  isFuture: boolean;
};

type MonthSpan = {
  label: string;
  start: number;
  end: number;
};

function levelFor(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 4) return 1;
  if (count <= 8) return 2;
  if (count <= 12) return 3;
  return 4;
}

function statusText(ev: AdminEventRow): string {
  if (ev.ended) return '已结束';
  return ev.open ? '开放报名' : '已关闭';
}

export interface EventHeatmapProps {
  events: AdminEventRow[];
}

export default function EventHeatmap({ events }: EventHeatmapProps) {
  const navigate = useNavigate();

  const { cells, months } = useMemo(() => {
    const map = new Map<string, AdminEventRow>();
    for (const e of events) map.set(e.eventDate, e);

    const today = dayjs();
    const todayDow = (today.day() + 6) % 7;
    const start = today.subtract(todayDow, 'day').subtract(TOTAL_WEEKS - 1, 'week');

    const cells: Cell[] = [];
    const monthStarts: { label: string; weekIdx: number }[] = [];
    let prevMonth = -1;

    for (let w = 0; w < TOTAL_WEEKS; w++) {
      for (let d = 0; d < 7; d++) {
        const day = start.add(w * 7 + d, 'day');
        const dateStr = day.format('YYYY-MM-DD');
        cells.push({
          date: dateStr,
          weekIdx: w,
          dow: d,
          ev: map.get(dateStr),
          isToday: day.isSame(today, 'day'),
          isFuture: day.isAfter(today, 'day'),
        });
        if (d === 0) {
          const m = day.month();
          if (m !== prevMonth) {
            monthStarts.push({ label: MONTH_LABELS[m], weekIdx: w });
            prevMonth = m;
          }
        }
      }
    }

    const months: MonthSpan[] = monthStarts.map((m, i) => ({
      label: m.label,
      start: m.weekIdx,
      end: i + 1 < monthStarts.length ? monthStarts[i + 1].weekIdx : TOTAL_WEEKS,
    }));

    return { cells, months };
  }, [events]);

  return (
    <div className="g-card heatmap" style={{ marginBottom: 16 }}>
      <div className="g-card__header">
        <span>年度活动热力图</span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--body-font)',
            fontSize: 11,
            color: 'var(--text-muted)',
            textTransform: 'none',
            letterSpacing: 0,
          }}
        >
          点击格子查看活动详情
        </span>
      </div>

      <div className="heatmap__scroll">
        <div className="heatmap__layout">
          <div
            className="heatmap__days"
            style={{
              gridTemplateRows: `${MONTH_ROW_HEIGHT}px repeat(7, ${CELL_SIZE}px)`,
              rowGap: CELL_GAP,
            }}
          >
            <span aria-hidden />
            {DAY_LABELS.map((label, i) => (
              <span
                key={label}
                className="heatmap__day-label"
                style={{ visibility: VISIBLE_DAY_ROWS.has(i) ? 'visible' : 'hidden' }}
                aria-hidden={!VISIBLE_DAY_ROWS.has(i)}
              >
                {label}
              </span>
            ))}
          </div>

          <div
            className="heatmap__grid"
            style={{
              gridTemplateColumns: `repeat(${TOTAL_WEEKS}, ${CELL_SIZE}px)`,
              gridTemplateRows: `${MONTH_ROW_HEIGHT}px repeat(7, ${CELL_SIZE}px)`,
              gap: CELL_GAP,
            }}
          >
            {months.map((m) => (
              <span
                key={`${m.label}-${m.start}`}
                className="heatmap__month"
                style={{ gridRow: 1, gridColumn: `${m.start + 1} / ${m.end + 1}` }}
              >
                {m.end - m.start >= 2 ? m.label : ''}
              </span>
            ))}

            {cells.map((c) => {
              const lvl = c.ev ? levelFor(c.ev.registeredCount) : 0;
              const clickable = !!c.ev;
              const className = [
                'heatmap__cell',
                `heatmap__cell--lvl${lvl}`,
                clickable ? 'heatmap__cell--clickable' : '',
                c.isToday ? 'heatmap__cell--today' : '',
              ]
                .filter(Boolean)
                .join(' ');

              const tip = c.ev ? (
                <div style={{ display: 'grid', gap: 4, fontSize: 12, minWidth: 140 }}>
                  <div style={{ fontWeight: 700, fontFamily: 'var(--heading-font)' }}>{c.date}</div>
                  <div>
                    报名 {c.ev.registeredCount} / {c.ev.teamCount * 4} 人
                    {c.ev.waitlistCount > 0 ? ` · 候补 ${c.ev.waitlistCount}` : ''}
                  </div>
                  <div style={{ color: '#8a95a5' }}>{statusText(c.ev)}</div>
                </div>
              ) : (
                <span style={{ fontSize: 12 }}>
                  {c.date} · {c.isFuture ? '暂未安排' : '无活动'}
                </span>
              );

              const ariaLabel = c.ev
                ? `${c.date}，报名 ${c.ev.registeredCount} 人，${statusText(c.ev)}`
                : `${c.date}，无活动`;

              return (
                <Tooltip key={c.date} title={tip} placement="top" mouseEnterDelay={0.05}>
                  <div
                    className={className}
                    style={{ gridRow: c.dow + 2, gridColumn: c.weekIdx + 1 }}
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : -1}
                    aria-label={ariaLabel}
                    onClick={() => {
                      if (clickable && c.ev) navigate(`/admin/events/${c.ev.eventDate}`);
                    }}
                    onKeyDown={(e) => {
                      if (!clickable || !c.ev) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/admin/events/${c.ev.eventDate}`);
                      }
                    }}
                  />
                </Tooltip>
              );
            })}
          </div>
        </div>

        <div className="heatmap__legend">
          <span>少</span>
          <span className="heatmap__cell heatmap__cell--lvl0 heatmap__legend-cell" />
          <span className="heatmap__cell heatmap__cell--lvl1 heatmap__legend-cell" />
          <span className="heatmap__cell heatmap__cell--lvl2 heatmap__legend-cell" />
          <span className="heatmap__cell heatmap__cell--lvl3 heatmap__legend-cell" />
          <span className="heatmap__cell heatmap__cell--lvl4 heatmap__legend-cell" />
          <span>多</span>
          <span className="heatmap__legend-hint">按当日报名人数着色（每队 4 人，{TOTAL_WEEKS} 周窗口）</span>
        </div>
      </div>
    </div>
  );
}
