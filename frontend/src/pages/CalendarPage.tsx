import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Badge, Typography, Space, Spin } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { getCalendar, type CalendarDay } from '../api';

const { Title, Text } = Typography;

const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

export default function CalendarPage() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [monthStr, setMonthStr] = useState('');
  const [prevMonth, setPrevMonth] = useState('');
  const [nextMonth, setNextMonth] = useState('');
  const [firstWeekday, setFirstWeekday] = useState(0);
  const navigate = useNavigate();

  const load = useCallback((month?: string) => {
    setLoading(true);
    getCalendar(month).then((res) => {
      const d = res.data;
      setDays(d.days);
      setMonthStr(d.monthStr);
      setPrevMonth(d.prevMonth);
      setNextMonth(d.nextMonth);
      setFirstWeekday(d.firstWeekday);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const getStatusColor = (day: CalendarDay) => {
    if (!day.hasEvent) return undefined;
    if (!day.open) return '#666';
    if (day.full) return '#e74c3c';
    return '#2ecc71';
  };

  const getStatusText = (day: CalendarDay) => {
    if (!day.hasEvent) return '';
    if (!day.open) return '已关闭';
    if (day.full) return '已满';
    return '可报名';
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px', background: '#0a0a0a', minHeight: '100vh' }}>
      <Title level={2} style={{ textAlign: 'center', color: '#f0a500' }}>🐔 趴布鸡排队</Title>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Button icon={<LeftOutlined />} onClick={() => load(prevMonth)} />
        <Title level={4} style={{ margin: 0, color: '#fff' }}>{monthStr}</Title>
        <Button icon={<RightOutlined />} onClick={() => load(nextMonth)} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {weekDays.map((d) => (
              <div key={d} style={{ textAlign: 'center', padding: 8, color: '#999', fontWeight: 600 }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {Array.from({ length: firstWeekday }, (_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {days.map((day) => {
              const statusColor = getStatusColor(day);
              const canClick = day.hasEvent;
              return (
                <div
                  key={day.date}
                  onClick={() => canClick && navigate(`/date/${day.date}`)}
                  style={{
                    padding: '8px 4px',
                    textAlign: 'center',
                    borderRadius: 8,
                    cursor: canClick ? 'pointer' : 'default',
                    background: day.isToday ? '#1a1a2e' : '#111',
                    border: day.isToday ? '2px solid #f0a500' : '1px solid #222',
                    opacity: day.past && !day.hasEvent ? 0.4 : 1,
                    minHeight: 70,
                  }}
                >
                  <div style={{ fontWeight: day.isToday ? 700 : 400, color: day.isToday ? '#f0a500' : '#ccc' }}>
                    {day.day}
                  </div>
                  {day.hasEvent && (
                    <Space direction="vertical" size={0} style={{ marginTop: 4 }}>
                      {day.startTime && (
                        <Text style={{ fontSize: 10, color: '#888' }}>{day.startTime}</Text>
                      )}
                      <Badge
                        color={statusColor}
                        text={<Text style={{ fontSize: 11, color: statusColor }}>{getStatusText(day)}</Text>}
                      />
                      <Text style={{ fontSize: 10, color: '#888' }}>
                        {day.registered}/{day.capacity}
                      </Text>
                    </Space>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <Button type="link" onClick={() => navigate('/admin/login')}>管理后台</Button>
      </div>
    </div>
  );
}
