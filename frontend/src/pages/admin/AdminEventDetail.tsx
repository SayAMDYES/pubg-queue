import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Table, Tag, Button, Space, message, Modal, Spin, Descriptions, Input, Popconfirm, Progress, Tooltip } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, ReloadOutlined, ClearOutlined, DeleteOutlined, PlayCircleOutlined, StopOutlined, PlusOutlined, CloseOutlined, LoadingOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { adminGetEventDetail, adminClearEvent, adminDeleteEvent, adminRefreshRankings, adminGetRankingStatus, adminStartEvent, adminEndEvent, adminManualRegister, adminRemoveRegistration, type AdminEventDetailData, type RankEntry, type RankingStatusData } from '../../api';
import { formatDateTime } from '../../utils';

/** 格式化时间范围，支持 HH:mm 和 YYYY-MM-DDTHH:mm 两种输入 */
function formatTimeRange(start?: string, end?: string): string {
  if (!start && !end) return '-';
  const fmt = (s: string) => {
    const d = new Date(s.includes('T') ? s : `1970-01-01T${s}`);
    if (isNaN(d.getTime())) return s;
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const s = start ? fmt(start) : '-';
  const e = end ? fmt(end) : '-';
  return `${s} ~ ${e}`;
}

const rankLabelColors: Record<string, string> = {
  '战神': '#ff4d4f',
  '精锐': '#faad14',
  '骨干': '#1677ff',
  '菜鸟': '#52c41a',
  '战犯': '#666',
  '缺席': '#999',
};

/** 从含 emoji 的标签中提取中文关键词，兼容新旧数据 */
function getRankKey(label: string): string {
  for (const key of Object.keys(rankLabelColors)) {
    if (label.includes(key)) return key;
  }
  return label;
}

const statusLabel: Record<string, string> = {
  assigned: '已分配',
  waitlist: '候补',
  cancelled: '已取消',
};
const statusColor: Record<string, string> = {
  assigned: 'green',
  waitlist: 'orange',
  cancelled: 'red',
};

const rankAnimations = `
@keyframes fireGlow {
  0%, 100% { box-shadow: 0 0 4px #ff660088, 0 0 8px #ff330044; }
  50% { box-shadow: 0 0 8px #ff9900cc, 0 0 16px #ff660088, 0 0 24px #ff330044; }
}
@keyframes skullPulse {
  0%, 100% { opacity: 0.65; }
  50% { opacity: 1; }
}
@keyframes eggBob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}
.rank-tag--fire { animation: fireGlow 1.5s ease-in-out infinite; }
.rank-tag--skull { animation: skullPulse 2s ease-in-out infinite; }
.rank-tag--egg { animation: eggBob 1.8s ease-in-out infinite; }
`;

const rankTagClass: Record<string, string> = {
  '战神': 'rank-tag--fire',
  '战犯': 'rank-tag--skull',
  '菜鸟': 'rank-tag--egg',
};

export default function AdminEventDetail() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminEventDetailData | null>(null);
  const [rankingCalc, setRankingCalc] = useState<RankingStatusData>({ status: 'idle', current: 0, total: 0 });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPoll = () => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      if (!date) return;
      try {
        const res = await adminGetRankingStatus(date);
        setRankingCalc(res.data);
        if (res.data.status !== 'calculating') {
          stopPoll();
          if (res.data.status === 'done') load();
        }
      } catch {
        stopPoll();
      }
    }, 2000);
  };

  useEffect(() => () => stopPoll(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = () => {
    if (!date) return;
    setLoading(true);
    adminGetEventDetail(date)
      .then((res) => setData(res.data))
      .catch((err: Error) => {
        if (err.message === '未登录') navigate('/admin/login');
        else message.error(err.message);
      })
      .finally(() => setLoading(false));
  };

  // 初始加载后同步一次排名计算状态
  const syncRankingStatus = async () => {
    if (!date) return;
    try {
      const res = await adminGetRankingStatus(date);
      setRankingCalc(res.data);
      if (res.data.status === 'calculating') startPoll();
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); syncRankingStatus(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh rankings once on load if pubgEnabled and no rankings yet
  useEffect(() => {
    if (!date || !data) return;
    if (data.pubgEnabled && (!data.rankings || data.rankings.length === 0)) {
      adminRefreshRankings(date).catch(() => { /* silent */ });
    }
  }, [date, data?.pubgEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = () => {
    Modal.confirm({
      title: '确认清空',
      content: '确定要清空所有报名吗？此操作不可恢复。',
      okText: '清空',
      okType: 'danger',
      onOk: async () => {
        try {
          await adminClearEvent(date!);
          message.success('已清空');
          load();
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : '清空失败');
        }
      },
    });
  };

  const handleDelete = () => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除 ${date} 的活动吗？此操作不可恢复。`,
      okText: '删除',
      okType: 'danger',
      onOk: async () => {
        try {
          await adminDeleteEvent(date!);
          message.success('已删除');
          navigate('/admin');
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : '删除失败');
        }
      },
    });
  };

  const handleRefreshRankings = async () => {
    try {
      await adminRefreshRankings(date!);
      setRankingCalc({ status: 'calculating', current: 0, total: 0 });
      startPoll();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '刷新失败');
    }
  };

  const handleStart = async () => {
    try {
      await adminStartEvent(date!);
      message.success('开始时间已记录');
      load();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleEnd = async () => {
    try {
      await adminEndEvent(date!);
      message.success('结束时间已记录，战绩刷新已自动触发');
      setRankingCalc({ status: 'calculating', current: 0, total: 0 });
      startPoll();
      load();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  if (loading || !data) {
    return <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin size="large" /></div>;
  }

  const { event: ev, registrations, teams, waitlist, pubgEnabled, rankings } = data;

  const regColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '游戏名', dataIndex: 'name', key: 'name' },
    { title: '手机号', dataIndex: 'phone', key: 'phone' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag color={statusColor[s] || 'default'}>{statusLabel[s] || s}</Tag>,
    },
    { title: '队伍', dataIndex: 'teamNo', key: 'teamNo' },
    { title: '位置', dataIndex: 'slotNo', key: 'slotNo' },
    { title: '报名时间', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => formatDateTime(v) },
  ];

  // 各指标最高值
  let maxKills = 0, maxDeaths = 0, maxAvgDamage = 0, maxAssists = 0;
  let maxKDA = 0, maxKPG = 0, maxAvgDamageTaken = 0, maxTradeRatio = 0;
  let maxHitEfficiency = 0, maxTimeAlive = 0, maxScore = 0;
  if (rankings && rankings.length > 0) {
    for (const r of rankings) {
      if (r.Kills > maxKills) maxKills = r.Kills;
      if (r.Deaths > maxDeaths) maxDeaths = r.Deaths;
      if (r.AvgDamage > maxAvgDamage) maxAvgDamage = r.AvgDamage;
      if (r.Assists > maxAssists) maxAssists = r.Assists;
      if ((r.KDA || 0) > maxKDA) maxKDA = r.KDA || 0;
      if ((r.KPG || 0) > maxKPG) maxKPG = r.KPG || 0;
      if ((r.AvgDamageTaken || 0) > maxAvgDamageTaken) maxAvgDamageTaken = r.AvgDamageTaken || 0;
      if ((r.TradeRatio || 0) > maxTradeRatio) maxTradeRatio = r.TradeRatio || 0;
      if ((r.HitEfficiency || 0) > maxHitEfficiency) maxHitEfficiency = r.HitEfficiency || 0;
      if ((r.TimeAlive || 0) > maxTimeAlive) maxTimeAlive = r.TimeAlive || 0;
      if ((r.Score || 0) > maxScore) maxScore = r.Score || 0;
    }
  }
  const highlightIf = (val: number, max: number) =>
    val === max && val > 0 ? { fontWeight: 700, color: '#f0a500' } : {};
  const ct = (title: string, tip: string) => (
    <Tooltip title={tip}><span style={{ cursor: 'help' }}>{title} <InfoCircleOutlined style={{ fontSize: 10, opacity: 0.45 }} /></span></Tooltip>
  );
  const computeRankTags = (record: RankEntry) => {
    const key = getRankKey(record.RankLabel);
    const tags: { label: string; color: string; cls?: string }[] = [
      { label: record.RankLabel, color: rankLabelColors[key] || '#999', cls: rankTagClass[key] },
    ];
    if (record.RankNo === 1) tags.push({ label: '🏅 MVP', color: '#f0a500' });
    if (record.EventMatches > 0 && record.Matches >= record.EventMatches) tags.push({ label: '✅ 全勤', color: '#52c41a' });
    if (record.TelemetryMatches > 0 && record.TradeRatio >= 1.0) tags.push({ label: '💰 换血赚', color: '#13c2c2' });
    if (record.EventMatches > 0 && record.MissedMatches > record.EventMatches * 0.4) tags.push({ label: '🚫 缺席多', color: '#d9d9d9' });
    return tags;
  };

  const rankColumns = [
    { title: '排名', dataIndex: 'RankNo', key: 'rankNo', width: 60 },
    {
      title: '总结',
      dataIndex: 'RankLabel',
      key: 'rankLabel',
      render: (_: string, record: RankEntry) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minWidth: 120 }}>
          {computeRankTags(record).map((t, i) => (
            <Tag key={i} color={t.color} className={t.cls}>{t.label}</Tag>
          ))}
        </div>
      ),
    },
    { title: '游戏名', dataIndex: 'GameName', key: 'gameName' },
    {
      title: '版本', dataIndex: 'AnalysisVersion', key: 'analysisVersion', width: 70,
      render: (v: string) => <Tag color={v === 'v2' ? 'geekblue' : 'default'}>{(v || 'v1').toUpperCase()}</Tag>,
    },
    {
      title: ct('场次', '本场活动该玩家实际出勤的局数'),
      dataIndex: 'Matches', key: 'attendance',
      render: (v: number) => v,
    },
    {
      title: ct('击杀', '活动期间总击杀数'),
      dataIndex: 'Kills', key: 'kills',
      render: (v: number) => <span style={highlightIf(v, maxKills)}>{v === maxKills && v > 0 ? '🏆 ' : ''}{v}</span>,
    },
    {
      title: ct('死亡', '活动期间总死亡次数（deathType ≠ alive）'),
      dataIndex: 'Deaths', key: 'deaths',
      render: (v: number) => <span style={highlightIf(v, maxDeaths)}>{v === maxDeaths && v > 0 ? '💀 ' : ''}{v}</span>,
    },
    {
      title: ct('助攻', '活动期间总助攻数'),
      dataIndex: 'Assists', key: 'assists',
      render: (v: number) => <span style={highlightIf(v, maxAssists)}>{v === maxAssists && v > 0 ? '🤝 ' : ''}{v}</span>,
    },
    {
      title: ct('K/D', '击杀数 ÷ 死亡数，衡量对枪正向收益'),
      dataIndex: 'KDA', key: 'kda',
      render: (v: number) => <span style={highlightIf(v || 0, maxKDA)}>{v === maxKDA && v > 0 ? '⚔️ ' : ''}{v?.toFixed(2) || '-'}</span>,
    },
    {
      title: ct('KPG', '击杀数 ÷ 出勤场次，场均击杀效率'),
      dataIndex: 'KPG', key: 'kpg',
      render: (v: number) => <span style={highlightIf(v || 0, maxKPG)}>{v === maxKPG && v > 0 ? '💥 ' : ''}{v?.toFixed(2) || '-'}</span>,
    },
    {
      title: ct('场均伤害', '总造成伤害 ÷ 出勤场次（ADR）'),
      dataIndex: 'AvgDamage', key: 'avgDamage',
      render: (v: number) => <span style={highlightIf(v, maxAvgDamage)}>{v === maxAvgDamage && v > 0 ? '🔥 ' : ''}{v?.toFixed(0) || '-'}</span>,
    },
    {
      title: ct('场均承伤', '承受伤害 ÷ 出勤场次，反映被攻击压力，来自遥测数据'),
      dataIndex: 'AvgDamageTaken', key: 'avgDamageTaken',
      render: (v: number) => <span style={highlightIf(v || 0, maxAvgDamageTaken)}>{v === maxAvgDamageTaken && v > 0 ? '🛡️ ' : ''}{v?.toFixed(0) || '-'}</span>,
    },
    {
      title: ct('换血比', '造成伤害 ÷ 承受伤害，≥1 表示对枪不亏，来自遥测数据'),
      dataIndex: 'TradeRatio', key: 'tradeRatio',
      render: (v: number) => <span style={highlightIf(v || 0, maxTradeRatio)}>{v === maxTradeRatio && v > 0 ? '💰 ' : ''}{v?.toFixed(2) || '-'}</span>,
    },
    {
      title: ct('命中效', '伤害产出 ÷ 开火次数，衡量每次开火收益，来自遥测数据'),
      dataIndex: 'HitEfficiency', key: 'hitEfficiency',
      render: (v: number) => <span style={highlightIf(v || 0, maxHitEfficiency)}>{v === maxHitEfficiency && v > 0 ? '🎯 ' : ''}{v?.toFixed(2) || '-'}</span>,
    },
    {
      title: ct('总生存时长', '活动期间所有出勤场次的生存时间总和'),
      dataIndex: 'TimeAlive', key: 'timeAlive',
      render: (v: number) => {
        if (!v) return '-';
        const m = Math.floor(v / 60);
        const s = Math.floor(v % 60);
        return <span style={highlightIf(v, maxTimeAlive)}>{v === maxTimeAlive && v > 0 ? '⏱️ ' : ''}{m}分{String(s).padStart(2, '0')}秒</span>;
      },
    },
    {
      title: ct('评分', '综合战斗、效率、生存指标的加权得分'),
      dataIndex: 'Score', key: 'score',
      render: (v: number) => <span style={highlightIf(v || 0, maxScore)}>{v === maxScore && v > 0 ? '👑 ' : ''}{v?.toFixed(1) || '-'}</span>,
    },
  ];

  return (
    <div className="page-wrap">
      <style>{rankAnimations}</style>
      <div className="page-inner page-inner--wide">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin')}>返回</Button>
            <div className="page-title page-title--lg">{ev.eventDate} 报名详情</div>
          </div>
        </div>

        {/* Event info */}
        <div className="g-card" style={{ marginBottom: 16 }}>
          <Descriptions column={{ xs: 1, sm: 2 }} size="small">
            <Descriptions.Item label="状态">
              {ev.ended ? (
                <Tag color="default">已结束</Tag>
              ) : ev.open ? (
                <Tag color="green">开放</Tag>
              ) : (
                <Tag color="red">关闭</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="队伍数">{ev.teamCount}</Descriptions.Item>
            <Descriptions.Item label="预计时间">{formatTimeRange(ev.startTime, ev.endTime)}</Descriptions.Item>
            <Descriptions.Item label="实际时间">{formatTimeRange(ev.actualStart, ev.actualEnd)}</Descriptions.Item>
            {ev.note && <Descriptions.Item label="备注" span={2}>{ev.note}</Descriptions.Item>}
          </Descriptions>
        </div>

        <Space wrap style={{ marginBottom: 20 }}>
          <Button icon={<DownloadOutlined />} onClick={() => window.open(`/api/admin/events/${date}/export`, '_blank')}>导出 CSV</Button>
          <Button onClick={() => navigate(`/admin/events/${date}/edit`)}>编辑活动</Button>
          {!ev.actualStart && <Button icon={<PlayCircleOutlined />} onClick={handleStart}>记录开始时间</Button>}
          {!ev.actualEnd && <Button icon={<StopOutlined />} onClick={handleEnd}>记录结束时间</Button>}
          {pubgEnabled && (
            <Button
              icon={rankingCalc.status === 'calculating' ? <LoadingOutlined /> : <ReloadOutlined />}
              onClick={handleRefreshRankings}
              loading={false}
              disabled={rankingCalc.status === 'calculating'}
            >
              {rankingCalc.status === 'calculating' ? '计算中…' : '重新计算战绩'}
            </Button>
          )}
          {!ev.ended && <Button icon={<ClearOutlined />} danger onClick={handleClear}>清空报名</Button>}
          <Button icon={<DeleteOutlined />} danger type="primary" onClick={handleDelete}>删除活动</Button>
        </Space>

        {/* Teams & Rankings */}
        <div className="g-card" style={{ marginBottom: 16 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>队伍与战绩</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 16 }}>
            {teams.map((team) => (
              <div key={team.teamNo} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
                <div className="section-label" style={{ marginBottom: 10 }}>第 {team.teamNo} 队</div>
                {team.slots.map((slot, idx) => (
                  <SlotRow
                    key={idx}
                    slot={slot}
                    date={date!}
                    onRefresh={load}
                  />
                ))}
              </div>
            ))}
          </div>

          {waitlist.length > 0 && (
            <>
              <div className="section-label" style={{ margin: '12px 0 8px' }}>候补名单</div>
              <Table
                dataSource={waitlist}
                columns={[
                  { title: '序号', key: 'idx', width: 60, render: (_: unknown, __: unknown, idx: number) => idx + 1 },
                  { title: '游戏名', dataIndex: 'name', key: 'name' },
                  { title: '手机号', dataIndex: 'phone', key: 'phone' },
                ]}
                pagination={false}
                size="small"
                scroll={{ x: 360 }}
                rowKey={(_, idx) => String(idx)}
                style={{ marginBottom: 16 }}
              />
            </>
          )}

          {pubgEnabled && rankingCalc.status === 'calculating' && (
            <div style={{ margin: '12px 0 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <LoadingOutlined style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  正在计算战绩…
                  {rankingCalc.total > 0 && ` (${rankingCalc.current}/${rankingCalc.total})`}
                </span>
              </div>
              {rankingCalc.total > 0 && (
                <Progress
                  percent={Math.round((rankingCalc.current / rankingCalc.total) * 100)}
                  size="small"
                  status="active"
                  format={() => `${rankingCalc.current}/${rankingCalc.total}`}
                />
              )}
            </div>
          )}

          {pubgEnabled && rankings && rankings.length > 0 && (
            <>
              <div className="section-label" style={{ margin: '12px 0 8px' }}>战绩排名</div>
              <Table
                dataSource={rankings}
                columns={rankColumns}
                pagination={false}
                size="small"
                scroll={{ x: 1300 }}
                rowKey="RankNo"
              />
            </>
          )}
        </div>

        {/* All registrations */}
        <div className="g-card" style={{ marginBottom: 16 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>报名记录</div>
          <Table
            dataSource={registrations}
            columns={regColumns}
            pagination={false}
            size="small"
            scroll={{ x: 640 }}
            rowKey="id"
          />
        </div>
      </div>
    </div>
  );
}

interface SlotRowProps {
  slot: { teamNo: number; slotNo: number; name: string; phone: string; filled: boolean; regId: number };
  date: string;
  onRefresh: () => void;
}

function SlotRow({ slot, date, onRefresh }: SlotRowProps) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const name = inputVal.trim();
    if (!name) return;
    setSubmitting(true);
    try {
      await adminManualRegister(date, { name, teamNo: slot.teamNo, slotNo: slot.slotNo });
      message.success('添加成功');
      setEditing(false);
      setInputVal('');
      onRefresh();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (!slot.regId) return;
    try {
      await adminRemoveRegistration(date, slot.regId);
      message.success('已移除');
      onRefresh();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '移除失败');
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-dim)', width: 20, fontSize: 12 }}>{slot.slotNo}</span>
      {slot.filled ? (
        <>
          <span style={{ color: 'var(--text)', flex: 1 }}>{slot.name}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{slot.phone}</span>
          <Popconfirm title={`确定移除 ${slot.name}？`} onConfirm={handleRemove} okText="移除" cancelText="取消" okButtonProps={{ danger: true }}>
            <Button size="small" type="text" danger icon={<CloseOutlined />} style={{ fontSize: 11 }} />
          </Popconfirm>
        </>
      ) : editing ? (
        <>
          <Input
            size="small"
            placeholder="输入游戏名"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onPressEnter={handleSubmit}
            style={{ flex: 1 }}
            autoFocus
          />
          <Button size="small" type="primary" loading={submitting} onClick={handleSubmit}>确定</Button>
          <Button size="small" onClick={() => { setEditing(false); setInputVal(''); }}>取消</Button>
        </>
      ) : (
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setEditing(true)} style={{ color: 'var(--text-dim)' }}>
          添加
        </Button>
      )}
    </div>
  );
}