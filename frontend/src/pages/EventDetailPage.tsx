import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form, Input, Button, Select, message, Spin, Popconfirm, Tooltip, Modal, Row, Col, Statistic, Table, Space, Tag, Divider, Pagination, Progress, Descriptions } from 'antd';
import { CopyOutlined, ArrowLeftOutlined, UserAddOutlined, LogoutOutlined, UserOutlined, LoginOutlined, TrophyOutlined } from '@ant-design/icons';
import {
  getEventDetail, registerEvent, leaveEvent, userLogout, getPlayerStats, getMatchDetail, getSeasons,
  type EventDetailData, type RegisterResult, type LeaveResult, type PlayerStatsOverview, type MatchDetail, type SeasonInfo,
} from '../api';

export default function EventDetailPage() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EventDetailData | null>(null);
  const [regResult, setRegResult] = useState<RegisterResult | null>(null);
  const [leaveResult, setLeaveResult] = useState<LeaveResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [regForm] = Form.useForm();

  const [statsModal, setStatsModal] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsData, setStatsData] = useState<PlayerStatsOverview | null>(null);
  const [statsSeasons, setStatsSeasons] = useState<SeasonInfo[]>([]);
  const [statsSelectedSeason, setSelectedSeason] = useState<string | undefined>(undefined);
  const [matchRows, setMatchRows] = useState<{ matchId: string; playerName: string; loading: boolean; detail: MatchDetail | null; error: boolean }[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchDetail | null>(null);
  const [statsCurrentPage, setStatsCurrentPage] = useState(1);
  const autoLoadedRef = useRef<string>('');
  const matchLoadTriggeredRef = useRef(false);

  const load = () => {
    if (!date) return;
    setLoading(true);
    getEventDetail(date)
      .then((res) => { setData(res.data); })
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getSeasons().then((res) => {
      setStatsSeasons(res.data);
      const current = res.data.find((s) => s.isCurrentSeason);
      if (current) setSelectedSeason(current.id);
    }).catch(() => {});
  }, []);

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
        event_ended: '活动已结束',
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
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => message.success('邀请文案已复制！')).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text: string) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      message.success('邀请文案已复制！');
    } catch {
      message.error('复制失败，请手动复制');
    }
    document.body.removeChild(ta);
  };

  const handleOpenStats = (name: string) => {
    setStatsModal(name);
    setStatsData(null);
    setMatchRows([]);
    setStatsCurrentPage(1);
    setStatsLoading(true);
    matchLoadTriggeredRef.current = false;
    getPlayerStats(name, statsSelectedSeason)
      .then((res) => {
        const data = res.data;
        setStatsData(data);
        const rows = data.recentMatchIds.map((id) => ({
          matchId: id, playerName: data.playerName, loading: false, detail: null as MatchDetail | null, error: false,
        }));
        setMatchRows(rows);
        autoLoadedRef.current = data.recentMatchIds[0] ?? '';
      })
      .catch(() => setStatsData(null))
      .finally(() => setStatsLoading(false));
  };

  const loadMatchDetail = useCallback(async (matchId: string, playerName: string, index: number) => {
    setMatchRows((prev) => prev.map((r, i) => i === index ? { ...r, loading: true } : r));
    try {
      const res = await getMatchDetail(matchId, playerName);
      setMatchRows((prev) => prev.map((r, i) => i === index ? { ...r, loading: false, detail: res.data } : r));
    } catch {
      setMatchRows((prev) => prev.map((r, i) => i === index ? { ...r, loading: false, error: true } : r));
    }
  }, []);

  // 自动加载对局详情
  useEffect(() => {
    if (matchRows.length === 0 || matchLoadTriggeredRef.current) return;
    if (autoLoadedRef.current !== matchRows[0]?.matchId) return;
    matchLoadTriggeredRef.current = true;
    matchRows.forEach((row, i) => {
      setTimeout(() => loadMatchDetail(row.matchId, row.playerName, i), i * 800);
    });
    autoLoadedRef.current = '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoadedRef.current]);

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

  const { event: ev, teams, waitlist, gameNames, pubgEnabled, userLoggedIn, userPhone, userRegistered, userStatus, userTeamNo, userSlotNo } = data;

  const statusColor = ev.ended ? 'var(--text-dim)' : !ev.open ? 'var(--text-muted)' : data.registeredCount >= data.capacity ? 'var(--danger)' : 'var(--success)';
  const statusLabel = ev.ended ? '已结束' : !ev.open ? '已关闭' : data.registeredCount >= data.capacity ? '已满员' : '报名开放';

  // 截止时间判断：若活动有开始时间且已过开始时间，则不允许报名/离队
  const isPastDeadline = (() => {
    if (!ev.startTime) return false;
    const deadlineStr = `${ev.eventDate}T${ev.startTime}`;
    return new Date() >= new Date(deadlineStr);
  })();

  // 战绩弹窗 — 对局列表相关
  const loadedRows = matchRows.filter((r) => r.detail !== null);
  const pageSize = 10;
  const pagedRows = matchRows.slice((statsCurrentPage - 1) * pageSize, statsCurrentPage * pageSize);

  // 注册对局详情弹窗回调
  (window as unknown as Record<string, (m: MatchDetail) => void>).__openMatchDetail = setSelectedMatch;

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
              {team.slots.map((slot, idx) => {
                const isMySlot = userLoggedIn && userRegistered && userStatus === 'assigned'
                  && userTeamNo === slot.teamNo && userSlotNo === slot.slotNo;
                return (
                  <div key={idx} className={`team-slot${!slot.filled ? ' team-slot--empty' : ''}`}>
                    <span className="team-slot__no">{slot.slotNo}</span>
                    <span
                      className="team-slot__name"
                      style={pubgEnabled && slot.filled ? { cursor: 'pointer', textDecoration: 'underline dotted' } : undefined}
                      onClick={pubgEnabled && slot.filled ? () => handleOpenStats(slot.name) : undefined}
                    >
                      {slot.filled ? slot.name : '— 空位 —'}
                    </span>
                    {slot.filled && (
                      <>
                        <span className="team-slot__phone">{slot.phone}</span>
                        {pubgEnabled && slot.stats?.found && (
                          <Tooltip title={`场次: ${slot.stats.matches} | K/D: ${slot.stats.kda.toFixed(2)}`}>
                            <span
                              className="team-slot__tag team-slot__tag--gold"
                              style={{ cursor: 'pointer' }}
                              onClick={() => handleOpenStats(slot.name)}
                            >
                              <TrophyOutlined style={{ marginRight: 2 }} />
                              {slot.stats.matches}场 K/D {slot.stats.kda.toFixed(1)}
                            </span>
                          </Tooltip>
                        )}
                        {isMySlot && !isPastDeadline && (
                          <Popconfirm
                            title="确认离队？"
                            description="离队后将失去当前位置，候补玩家会自动递补。"
                            onConfirm={handleLeaveWithSession}
                            okText="确认离队"
                            cancelText="取消"
                          >
                            <Button
                              size="small"
                              danger
                              loading={submitting}
                              style={{ marginLeft: 4, fontSize: 11, height: 20, padding: '0 6px' }}
                            >
                              离队
                            </Button>
                          </Popconfirm>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
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
        {ev.open && !userRegistered && !isPastDeadline && (
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

        {/* Leave — only show for logged-in waitlist users; assigned users have inline leave button */}
        {!isPastDeadline && userLoggedIn && userRegistered && userStatus === 'waitlist' && (
          <div className="g-card">
            <div className="g-card__header">
              <LogoutOutlined />
              退出报名
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
              您当前在候补列表，点击确认可退出。
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
          </div>
        )}

        {/* Stats Modal */}
        <Modal
          title={<span><TrophyOutlined style={{ marginRight: 8, color: '#f0a500' }} />{statsModal} 战绩</span>}
          open={!!statsModal}
          onCancel={() => { setStatsModal(null); setStatsData(null); setMatchRows([]); matchLoadTriggeredRef.current = false; }}
          footer={null}
          destroyOnClose
          width={720}
        >
          {statsLoading ? (
            <div style={{ textAlign: 'center', padding: 32 }}><Spin size="large" /></div>
          ) : statsData ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 16 }}>{statsData.playerName}</span>
                {statsSeasons.length > 0 && (
                  <Space>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>赛季：</span>
                    <Select
                      style={{ minWidth: 120 }}
                      size="small"
                      value={statsSelectedSeason}
                      onChange={(val) => { setSelectedSeason(val); handleOpenStats(statsModal!); }}
                      options={statsSeasons.map((s) => ({
                        label: seasonLabel(s.id) + (s.isCurrentSeason ? ' (当前)' : ''),
                        value: s.id,
                      }))}
                    />
                  </Space>
                )}
              </div>
              <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                <Col xs={12} sm={6}><Statistic title="场次" value={statsData.matches} /></Col>
                <Col xs={12} sm={6}><Statistic title="K/D" value={statsData.kda.toFixed(2)} /></Col>
                <Col xs={12} sm={6}><Statistic title="总击杀" value={statsData.kills} /></Col>
                <Col xs={12} sm={6}><Statistic title="均伤" value={Math.round(statsData.avgDamage)} /></Col>
                <Col xs={12} sm={6}><Statistic title="总助攻" value={statsData.assists} /></Col>
                <Col xs={12} sm={6}><Statistic title="总死亡" value={statsData.deaths} /></Col>
                <Col xs={12} sm={6}><Statistic title="总伤害" value={Math.round(statsData.totalDamage)} /></Col>
              </Row>

              {matchRows.length > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div className="section-label">近期对局</div>
                    {loadedRows.length < matchRows.length && (
                      <Progress
                        percent={Math.round(loadedRows.length / matchRows.length * 100)}
                        size="small"
                        style={{ width: 120 }}
                        format={() => `${loadedRows.length}/${matchRows.length}`}
                      />
                    )}
                  </div>
                  <Table
                    dataSource={pagedRows}
                    columns={matchColumns}
                    rowKey="matchId"
                    pagination={false}
                    size="small"
                    scroll={{ x: 560 }}
                  />
                  {matchRows.length > pageSize && (
                    <div style={{ textAlign: 'center', marginTop: 12 }}>
                      <Pagination
                        current={statsCurrentPage}
                        pageSize={pageSize}
                        total={matchRows.length}
                        onChange={(page) => setStatsCurrentPage(page)}
                        simple
                      />
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)' }}>
              未找到该玩家的战绩数据
            </div>
          )}
        </Modal>

        {/* Match Detail Modal */}
        <Modal
          open={!!selectedMatch}
          onCancel={() => setSelectedMatch(null)}
          footer={<Button onClick={() => setSelectedMatch(null)}>关闭</Button>}
          title={selectedMatch ? `比赛详情 · #${selectedMatch.playerRank}/${selectedMatch.totalTeams}` : ''}
          width={700}
        >
          {selectedMatch && <MatchDetailView match={selectedMatch} />}
        </Modal>

      </div>
    </div>
  );
}

// ─── 战绩弹窗共享组件 ─────────────────────────────────────────

const gameModeLabel: Record<string, string> = {
  'squad-fpp': '四排FPP', 'squad': '四排TPP',
  'duo-fpp': '双排FPP', 'duo': '双排TPP',
  'solo-fpp': '单排FPP', 'solo': '单排TPP',
};

const mapNameLabel: Record<string, string> = {
  'Baltic_Main': '艾伦格', 'Erangel_Main': '艾伦格',
  'Desert_Main': '米拉玛', 'Savage_Main': '萨诺',
  'DihorOtok_Main': '维肯迪', 'Summerland_Main': '卡拉金',
  'Range_Main': '训练场', 'Kiki_Main': '德斯顿',
  'Tiger_Main': '塔戈', 'Neon_Main': '荣光',
  'Heaven_Main': '里维拉', 'Chimera_Main': '帕拉莫',
  'Rondo_Main': '荣耀', 'LaboratoryMain': '绝境岛',
  'Shipment_Main': '战舰',
};

const rankColor = (rank: number) => {
  if (rank === 1) return '#f5a623';
  if (rank <= 5) return '#f0a500';
  if (rank <= 10) return '#4a9e4a';
  return '#555';
};

function formatTime(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m${Math.round(seconds % 60)}s`;
}

function formatKm(meters: number) {
  return `${(meters / 1000).toFixed(1)}km`;
}

function seasonLabel(id: string) {
  const parts = id.split('.');
  const last = parts[parts.length - 1] || id;
  const numMatch = last.match(/(\d+)$/);
  if (numMatch) return `第 ${parseInt(numMatch[1], 10)} 赛季`;
  return last;
}

interface MatchRow {
  matchId: string;
  playerName: string;
  loading: boolean;
  detail: MatchDetail | null;
  error: boolean;
}

const matchColumns = [
  {
    title: '排名', key: 'rank', width: 60,
    render: (_: unknown, row: MatchRow) => {
      if (row.loading) return <Spin size="small" />;
      if (!row.detail) return '-';
      const r = row.detail.playerRank;
      return (
        <div style={{
          display: 'inline-block', width: 36, height: 36, lineHeight: '36px', textAlign: 'center',
          borderRadius: 6, background: rankColor(r), color: '#fff', fontWeight: 700, fontSize: 13,
        }}>
          #{r}
        </div>
      );
    },
  },
  {
    title: '模式/地图', key: 'mode', width: 90,
    render: (_: unknown, row: MatchRow) => {
      if (!row.detail) return '-';
      return (
        <Space direction="vertical" size={0}>
          <Tag color="blue" style={{ fontSize: 11 }}>{gameModeLabel[row.detail.gameMode] || row.detail.gameMode}</Tag>
          <span style={{ fontSize: 11, color: '#888' }}>{mapNameLabel[row.detail.mapName] || row.detail.mapName}</span>
        </Space>
      );
    },
  },
  {
    title: '时间', key: 'time', width: 100,
    render: (_: unknown, row: MatchRow) => {
      if (!row.detail) return '-';
      const start = new Date(row.detail.createdAt);
      return (
        <Space direction="vertical" size={0}>
          <span style={{ fontSize: 12 }}>{start.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>
          <span style={{ fontSize: 11, color: '#888' }}>{start.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · {formatTime(row.detail.duration)}</span>
        </Space>
      );
    },
  },
  {
    title: '击杀', key: 'kills', width: 55,
    render: (_: unknown, row: MatchRow) => {
      if (!row.detail) return '-';
      return <span style={{ color: row.detail.player.kills > 0 ? '#f0a500' : '#ccc' }}>{row.detail.player.kills}</span>;
    },
  },
  {
    title: '击倒', key: 'dbnos', width: 55,
    render: (_: unknown, row: MatchRow) => !row.detail ? '-' : row.detail.player.dbnos,
  },
  {
    title: '助攻', key: 'assists', width: 55,
    render: (_: unknown, row: MatchRow) => !row.detail ? '-' : row.detail.player.assists,
  },
  {
    title: '伤害', key: 'damage', width: 65,
    render: (_: unknown, row: MatchRow) => !row.detail ? '-' : Math.round(row.detail.player.damage),
  },
  {
    title: '生存', key: 'survive', width: 70,
    render: (_: unknown, row: MatchRow) => !row.detail ? '-' : <span style={{ fontSize: 12 }}>{formatTime(row.detail.player.timeSurvived)}</span>,
  },
  {
    title: '详情', key: 'action', width: 55,
    render: (_: unknown, row: MatchRow) => {
      if (!row.detail) return null;
      return <Button size="small" onClick={() => {
        // 触发详情弹窗 — 使用全局事件避免组件间状态传递
        (window as unknown as Record<string, (m: MatchDetail) => void>).__openMatchDetail?.(row.detail!);
      }}>详情</Button>;
    },
  },
];

function MatchDetailView({ match }: { match: MatchDetail }) {
  return (
    <div>
      <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="时间">{new Date(match.createdAt).toLocaleString('zh-CN')}</Descriptions.Item>
        <Descriptions.Item label="模式">{gameModeLabel[match.gameMode] || match.gameMode}</Descriptions.Item>
        <Descriptions.Item label="地图">{mapNameLabel[match.mapName] || match.mapName}</Descriptions.Item>
        <Descriptions.Item label="总队伍/玩家">{match.totalTeams} 队 / {match.totalPlayers} 人</Descriptions.Item>
      </Descriptions>
      <Divider>我的战绩</Divider>
      <ParticipantStats p={match.player} highlight />
      {match.teammates && match.teammates.length > 0 && (
        <>
          <Divider>队友</Divider>
          {match.teammates.map((tm, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <span style={{ fontWeight: 600, color: '#ccc' }}>{tm.name}</span>
              <ParticipantStats p={tm} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function ParticipantStats({ p, highlight }: { p: import('../api').MatchParticipantDetail; highlight?: boolean }) {
  const color = highlight ? '#f0a500' : '#888';
  return (
    <Row gutter={[8, 8]} style={{ marginBottom: 8, padding: 8, background: highlight ? '#1a1a2e' : 'transparent', borderRadius: 6 }}>
      <Col xs={8} sm={4}><Statistic title="击杀" value={p.kills} valueStyle={{ color, fontSize: 16 }} /></Col>
      <Col xs={8} sm={4}><Statistic title="击倒" value={p.dbnos} valueStyle={{ fontSize: 16 }} /></Col>
      <Col xs={8} sm={4}><Statistic title="助攻" value={p.assists} valueStyle={{ fontSize: 16 }} /></Col>
      <Col xs={12} sm={6}><Statistic title="伤害" value={Math.round(p.damage)} valueStyle={{ fontSize: 16 }} /></Col>
      <Col xs={12} sm={6}><Statistic title="生存" value={formatTime(p.timeSurvived)} valueStyle={{ fontSize: 16 }} /></Col>
      <Col xs={8} sm={4}><Statistic title="步行" value={formatKm(p.walkDistance)} valueStyle={{ fontSize: 16 }} /></Col>
      <Col xs={8} sm={4}><Statistic title="驾驶" value={formatKm(p.rideDistance)} valueStyle={{ fontSize: 16 }} /></Col>
      <Col xs={8} sm={4}><Statistic title="爆头" value={p.headshotKills} valueStyle={{ fontSize: 16 }} /></Col>
      <Col xs={8} sm={4}><Statistic title="治疗" value={p.heals} valueStyle={{ fontSize: 16 }} /></Col>
      <Col xs={8} sm={4}><Statistic title="加速" value={p.boosts} valueStyle={{ fontSize: 16 }} /></Col>
      <Col xs={8} sm={4}><Statistic title="复活" value={p.revives} valueStyle={{ fontSize: 16 }} /></Col>
      <Col xs={12} sm={6}>
        <div style={{ paddingTop: 4 }}>
          <span style={{ fontSize: 12, color: '#888' }}>状态</span>
          <div style={{ marginTop: 4 }}>
            {p.survived ? <Tag color="green">存活</Tag> : <Tag color="default">阵亡</Tag>}
          </div>
        </div>
      </Col>
    </Row>
  );
}
