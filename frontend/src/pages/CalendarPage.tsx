import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Spin, message } from 'antd';
import { LeftOutlined, RightOutlined, UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { getCalendar, userLogout, type CalendarDay } from '../api';
import { useUserMe } from '../hooks/useUserMe';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function getDayStatus(day: CalendarDay): { color: string; label: string; dotCls: string } {
  if (!day.hasEvent) return { color: 'transparent', label: '', dotCls: '' };
  if (day.ended) return { color: 'var(--text-dim)', label: '已结束', dotCls: 'status-dot--closed' };
  if (!day.open) return { color: 'var(--text-muted)', label: '已关闭', dotCls: 'status-dot--closed' };
  if (day.full) return { color: 'var(--danger)', label: '已满', dotCls: 'status-dot--full' };
  return { color: 'var(--success)', label: '可报名', dotCls: 'status-dot--open' };
}

export default function CalendarPage() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [monthStr, setMonthStr] = useState('');
  const [prevMonth, setPrevMonth] = useState('');
  const [nextMonth, setNextMonth] = useState('');
  const [firstWeekday, setFirstWeekday] = useState(0);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, refresh: refreshUser } = useUserMe();

  const load = useCallback((month?: string) => {
    setLoading(true);
    getCalendar(month)
      .then((res) => {
        const d = res.data;
        setDays(d.days);
        setMonthStr(d.monthStr);
        setPrevMonth(d.prevMonth);
        setNextMonth(d.nextMonth);
        setFirstWeekday(d.firstWeekday);
        setYear(d.year);
        setMonth(d.month);
      })
      .catch(() => message.error('加载日历失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // 点击外部关闭年月选择器
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const handleLogout = async () => {
    try {
      await userLogout();
      message.success('已退出登录');
      refreshUser();
    } catch {
      message.error('退出失败');
    }
  };

  return (
    <div className="page-wrap">
      <div className="page-inner">

        {/* Top bar */}
        <div className="top-bar">
          <div className="flex-gap-8">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span className="page-title page-title--sm">PUBG SQUAD</span>
          </div>
          <div>
            {user.loggedIn ? (
              <div className="flex-gap-8">
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  <UserOutlined style={{ marginRight: 4, fontSize: 11 }} />
                  {user.phone}
                </span>
                <Button
                  size="small"
                  icon={<LogoutOutlined />}
                  onClick={handleLogout}
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-muted)', fontFamily: 'var(--body-font)' }}
                >
                  退出
                </Button>
              </div>
            ) : (
              <Button
                size="small"
                icon={<UserOutlined />}
                onClick={() => navigate('/login')}
                style={{ background: 'var(--surface-2)', borderColor: 'rgba(240,165,0,0.35)', color: 'var(--primary)', fontFamily: 'var(--body-font)' }}
              >
                登录 / 注册
              </Button>
            )}
          </div>
        </div>

        {/* Hero title */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div className="page-title page-title--lg" style={{ marginBottom: 6 }}>趴布鸡排队</div>
          <div className="section-label" style={{ color: 'var(--text-dim)' }}>SQUAD LOBBY CALENDAR</div>
        </div>

        {/* Month navigator */}
        <div className="flex-between" style={{ marginBottom: 14 }}>
          <Button
            icon={<LeftOutlined />}
            onClick={() => load(prevMonth)}
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          />
          <div ref={pickerRef} style={{ position: 'relative' }}>
            <span
              style={{ fontFamily: 'var(--heading-font)', fontSize: 15, letterSpacing: '0.08em', color: 'var(--text)', cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setPickerOpen((v) => !v)}
            >
              {monthStr} ▾
            </span>
            {pickerOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
                padding: 12, zIndex: 100, minWidth: 220, marginTop: 6,
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              }}>
                {/* Year selector */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 10 }}>
                  <span style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '2px 6px' }} onClick={() => setYear((y) => y - 1)}>◀</span>
                  <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: 15, minWidth: 40, textAlign: 'center' }}>{year}</span>
                  <span style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '2px 6px' }} onClick={() => setYear((y) => y + 1)}>▶</span>
                </div>
                {/* Month grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {Array.from({ length: 12 }, (_, i) => {
                    const m = i + 1;
                    const active = m === month;
                    return (
                      <span
                        key={m}
                        style={{
                          textAlign: 'center', padding: '6px 0', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                          background: active ? 'var(--primary)' : 'transparent',
                          color: active ? '#fff' : 'var(--text-muted)',
                          fontWeight: active ? 600 : 400,
                        }}
                        onClick={() => { setPickerOpen(false); load(`${year}-${String(m).padStart(2, '0')}`); }}
                      >
                        {m}月
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <Button
            icon={<RightOutlined />}
            onClick={() => load(nextMonth)}
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          />
        </div>

        {/* Weekday headers */}
        <div className="cal-grid" style={{ marginBottom: 3 }}>
          {WEEKDAYS.map((d) => (
            <div key={d} className="cal-header">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="flex-center" style={{ padding: '80px 0' }}>
            <Spin size="large" />
          </div>
        ) : (
          <div className="cal-grid">
            {Array.from({ length: firstWeekday }, (_, i) => <div key={`e${i}`} />)}
            {days.map((day) => {
              const { color, label, dotCls } = getDayStatus(day);
              const canClick = day.hasEvent;
              return (
                <div
                  key={day.date}
                  className={[
                    'cal-day',
                    canClick ? 'cal-day--event' : '',
                    day.isToday ? 'cal-day--today' : '',
                    day.past && !day.hasEvent ? 'cal-day--past' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => canClick && navigate(`/date/${day.date}`)}
                >
                  <div className={`cal-day__num${day.isToday ? ' cal-day__num--today' : ''}`}>
                    {day.day}
                  </div>
                  {day.hasEvent && (
                    <>
                      {day.startTime && (
                        <div className="cal-day__time">{day.startTime}</div>
                      )}
                      <div className="cal-day__status">
                        <span className={`status-dot ${dotCls}`} />
                        <span style={{ color }}>{label}</span>
                      </div>
                      <div className="cal-day__count">
                        {day.registered}/{day.capacity}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="page-footer" style={{ marginTop: 32 }}>
          <button className="page-footer__link" onClick={() => navigate('/stats')}>战绩查询</button>
          <span className="page-footer__sep">·</span>
          <button className="page-footer__link" onClick={() => navigate('/admin')}>管理后台</button>
        </div>

      </div>
    </div>
  );
}
