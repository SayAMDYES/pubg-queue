import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, Button, Select, message, Spin, Popconfirm, Tooltip } from 'antd';
import { CopyOutlined, ArrowLeftOutlined, UserAddOutlined, LogoutOutlined, UserOutlined, LoginOutlined } from '@ant-design/icons';
import { getEventDetail, registerEvent, leaveEvent, userLogout, type EventDetailData, type RegisterResult, type LeaveResult } from '../api';

export default function EventDetailPage() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EventDetailData | null>(null);
  const [regResult, setRegResult] = useState<RegisterResult | null>(null);
  const [leaveResult, setLeaveResult] = useState<LeaveResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [regForm] = Form.useForm();
  const [leaveForm] = Form.useForm();

  const load = () => {
    if (!date) return;
    setLoading(true);
    getEventDetail(date)
      .then((res) => { setData(res.data); })
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegister = async (values: { name: string }) => {
    if (!date) return;
    setSubmitting(true);
    try {
      const res = await registerEvent(date, { name: values.name });
      setRegResult(res.data);
      message.success('报名成功！');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '报名失败';
      const errorMap: Record<string, string> = {
        not_logged_in: '请先登录后再报名',
        invalid_name: '游戏名格式不正确（1-20字符）',
        event_closed: '报名已关闭',
        phone_already_registered: '该手机号已报名',
        name_already_registered: '该游戏名已被使用',
      };
      message.error(errorMap[errMsg] || errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeaveWithSession = async () => {
    if (!date) return;
    setSubmitting(true);
    try {
      const res = await leaveEvent(date);
      setLeaveResult(res.data);
      message.success('离队成功！');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '离队失败';
      message.error(errMsg === 'registration_not_found' ? '未找到您的报名记录' : errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeaveWithPassword = async (values: { phone: string; password: string }) => {
    if (!date) return;
    setSubmitting(true);
    try {
      const res = await leaveEvent(date, values);
      setLeaveResult(res.data);
      message.success('离队成功！');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '离队失败';
      const errorMap: Record<string, string> = { wrong_password: '密码错误', registration_not_found: '未找到您的报名记录' };
      message.error(errorMap[errMsg] || errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await userLogout();
      message.success('已退出登录');
      load();
    } catch {
      message.error('退出失败');
    }
  };

  const handleCopyInvite = () => {
    if (!data) return;
    const ev = data.event;
    const text = `🐔 PUBG 开黑召集令！\n📅 日期：${ev.eventDate}${ev.startTime ? `\n⏰ 时间：${ev.startTime}` : ''}\n👥 已报名：${data.registeredCount}/${data.capacity}\n${ev.note ? `📝 ${ev.note}\n` : ''}\n🔗 立即报名：${window.location.href}`;
    navigator.clipboard.writeText(text).then(() => message.success('邀请文案已复制！'));
  };

  if (regResult) {
    return (
      <div className="page-wrap">
        <div className="page-inner" style={{ maxWidth: 560 }}>
          <div className="g-card g-card--accent" style={{ textAlign: 'center', padding: '48px 32px' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <div className="page-title" style={{ marginBottom: 8, textShadow: '0 0 24px var(--success-glow)' }}>报名成功</div>
            <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
              {regResult.name}（{regResult.maskedPhone}）
            </p>
            <p style={{ color: regResult.status === 'assigned' ? 'var(--success)' : 'var(--warning)', marginBottom: 24 }}>
              {regResult.status === 'assigned' ? '✓ 已分配到队伍' : '⏳ 已加入候补'}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Button type="primary" onClick={() => { setRegResult(null); load(); }}>返回活动</Button>
              <Button onClick={() => navigate('/')} style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>返回首页</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (leaveResult) {
    return (
      <div className="page-wrap">
        <div className="page-inner" style={{ maxWidth: 560 }}>
          <div className="g-card g-card--accent" style={{ textAlign: 'center', padding: '48px 32px' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <div className="page-title" style={{ marginBottom: 8 }}>离队成功</div>
            <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{leaveResult.leftName} 已离队</p>
            {leaveResult.promotedName && (
              <p style={{ color: 'var(--success)', marginBottom: 24 }}>🎉 {leaveResult.promotedName} 已从候补递补入队！</p>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Button type="primary" onClick={() => { setLeaveResult(null); load(); }}>返回活动</Button>
              <Button onClick={() => navigate('/')} style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>返回首页</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="page-wrap flex-center" style={{ minHeight: '100dvh' }}>
        <Spin size="large" />
      </div>
    );
  }

  const { event: ev, teams, waitlist, gameNames, pubgEnabled, userLoggedIn, userPhone } = data;

  const statusColor = !ev.open ? 'var(--text-muted)' : data.registeredCount >= data.capacity ? 'var(--danger)' : 'var(--success)';
  const statusLabel = !ev.open ? '已关闭' : data.registeredCount >= data.capacity ? '已满员' : '报名开放';

  return (
    <div className="page-wrap">
      <div className="page-inner">

        {/* Top bar */}
        <div className="top-bar">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            日历
          </Button>
          <div>
            {userLoggedIn ? (
              <div className="flex-gap-8">
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  <UserOutlined style={{ marginRight: 4 }} />{userPhone}
                </span>
                <Button
                  size="small"
                  icon={<LogoutOutlined />}
                  onClick={handleLogout}
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  退出
                </Button>
              </div>
            ) : (
              <Button
                size="small"
                icon={<LoginOutlined />}
                onClick={() => navigate(`/login?next=/date/${date}`)}
                style={{ background: 'var(--surface-2)', borderColor: 'rgba(240,165,0,0.35)', color: 'var(--primary)' }}
              >
                登录 / 注册
              </Button>
            )}
          </div>
        </div>

        {/* Event header */}
        <div className="g-card g-card--accent" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="page-title" style={{ marginBottom: 8 }}>{ev.eventDate}</div>
              <div className="flex-gap-8" style={{ flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: statusColor }}>
                  <span className={`status-dot status-dot--${!ev.open ? 'closed' : data.registeredCount >= data.capacity ? 'full' : 'open'}`} />
                  {statusLabel}
                </span>
                {ev.startTime && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    ⏱ {ev.startTime}{ev.endTime ? ` - ${ev.endTime}` : ''}
                  </span>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  👥 {data.registeredCount}/{data.capacity}
                </span>
              </div>
            </div>
            <Button
              icon={<CopyOutlined />}
              size="small"
              onClick={handleCopyInvite}
              style={{ background: 'var(--surface-3)', borderColor: 'var(--border)', color: 'var(--text-muted)', flexShrink: 0 }}
            >
              一键邀请
            </Button>
          </div>
          {ev.note && (
            <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(240,165,0,0.06)', borderRadius: 4, borderLeft: '3px solid rgba(240,165,0,0.4)', fontSize: 13, color: 'var(--text-muted)' }}>
              {ev.note}
            </div>
          )}
        </div>

        {/* Teams */}
        <div style={{ marginBottom: 4 }}>
          <div className="section-label" style={{ marginBottom: 10 }}>SQUAD TEAMS</div>
        </div>
        <div className="teams-grid">
          {teams.map((team) => (
            <div key={team.teamNo} className="team-card">
              <div className="team-card__header">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                第 {team.teamNo} 队
              </div>
              {team.slots.map((slot, idx) => (
                <div key={idx} className={`team-slot${!slot.filled ? ' team-slot--empty' : ''}`}>
                  <span className="team-slot__no">{slot.slotNo}</span>
                  <span className="team-slot__name">
                    {slot.filled ? slot.name : '— 空位 —'}
                  </span>
                  {slot.filled && (
                    <>
                      <span className="team-slot__phone">{slot.phone}</span>
                      {pubgEnabled && slot.stats?.found && (
                        <Tooltip title={`场次: ${slot.stats.matches} | KDA: ${slot.stats.kda.toFixed(2)}`}>
                          <span className="team-slot__tag team-slot__tag--gold">
                            {slot.stats.matches}场 {slot.stats.kda.toFixed(1)}KDA
                          </span>
                        </Tooltip>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Waitlist */}
        {waitlist.length > 0 && (
          <div className="g-card" style={{ marginBottom: 16 }}>
            <div className="g-card__header">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              候补名单 ({waitlist.length})
            </div>
            {waitlist.map((w, idx) => (
              <div key={idx} className="waitlist-item">
                <span className="waitlist-no">#{idx + 1}</span>
                <span style={{ fontSize: 13, flex: 1 }}>{w.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{w.phone}</span>
              </div>
            ))}
          </div>
        )}

        {/* Register */}
        {ev.open && (
          <div className="g-card" style={{ marginBottom: 12 }}>
            <div className="g-card__header">
              <UserAddOutlined />
              报名参赛
            </div>
            {userLoggedIn ? (
              <>
                <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  报名账号：<span style={{ color: 'var(--primary)' }}>{userPhone}</span>
                </div>
                <Form form={regForm} onFinish={handleRegister} layout="vertical">
                  <Form.Item name="name" label="游戏昵称" rules={[{ required: true, message: '请输入游戏昵称' }]}>
                    {gameNames.length > 0 ? (
                      <Select
                        showSearch
                        allowClear
                        placeholder="选择或输入游戏昵称"
                        options={gameNames.map((n) => ({ label: n, value: n }))}
                        filterOption={(input, option) => (option?.label ?? '').includes(input)}
                      />
                    ) : (
                      <Input placeholder="游戏昵称" maxLength={20} />
                    )}
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button type="primary" htmlType="submit" loading={submitting} block>
                      提交报名
                    </Button>
                  </Form.Item>
                </Form>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 13 }}>报名需要先登录账号</p>
                <Button
                  type="primary"
                  icon={<LoginOutlined />}
                  onClick={() => navigate(`/login?next=/date/${date}`)}
                >
                  登录 / 注册
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Leave */}
        <div className="g-card">
          <div className="g-card__header">
            <LogoutOutlined />
            退出报名
          </div>
          {userLoggedIn ? (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
                已登录，点击确认即可离队，系统会自动递补候补。
              </p>
              <Popconfirm
                title="确认离队？"
                description="离队后将失去当前位置，候补玩家会自动递补。"
                onConfirm={handleLeaveWithSession}
                okText="确认离队"
                cancelText="取消"
              >
                <Button danger loading={submitting} block>
                  确认离队
                </Button>
              </Popconfirm>
            </>
          ) : (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
                输入报名时使用的手机号和密码即可离队。
              </p>
              <Form form={leaveForm} onFinish={handleLeaveWithPassword} layout="vertical">
                <Form.Item name="phone" label="手机号" rules={[{ required: true, pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }]}>
                  <Input placeholder="手机号" maxLength={11} />
                </Form.Item>
                <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '密码至少6位' }]} style={{ marginBottom: 12 }}>
                  <Input.Password placeholder="密码" />
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                  <Button danger htmlType="submit" loading={submitting} block>确认离队</Button>
                </Form.Item>
              </Form>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
