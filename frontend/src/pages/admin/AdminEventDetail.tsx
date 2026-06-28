import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Table, Tag, Button, message, Modal, Spin, Descriptions, Input, AutoComplete, Popconfirm, Progress } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, ReloadOutlined, ClearOutlined, DeleteOutlined, PlayCircleOutlined, StopOutlined, PlusOutlined, CloseOutlined, LoadingOutlined, WarningOutlined } from '@ant-design/icons';
import { adminGetEventDetail, adminClearEvent, adminDeleteEvent, adminRefreshRankings, adminGetRankingStatus, adminStartEvent, adminEndEvent, adminManualRegister, adminRemoveRegistration, adminListGameNames, type AdminEventDetailData, type AdminGameNameStat, type RankingStatusData } from '../../api';
import { formatDateTime, fuzzyScore } from '../../utils';
import CompactRankingTable from '../../components/CompactRankingTable';

function rankGameNames(query: string, pool: AdminGameNameStat[], limit: number): AdminGameNameStat[] {
  const q = query.trim();
  if (!q) return [];
  return pool
    .map((candidate) => ({ candidate, score: fuzzyScore(q, candidate.name) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score || b.candidate.total - a.candidate.total)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

/** 格式化时间范围，支持 HH:mm 和 YYYY-MM-DDTHH:mm 两种输入 */
function formatTimeRange(start?: string, end?: string): string {
  if (!start && !end) return '-';
  const fmt = (s: string) => {
    if (!s.includes('T')) {
      // 纯时间 HH:mm，直接返回不带日期
      return s.length >= 5 ? s.slice(0, 5) : s;
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const s = start ? fmt(start) : '-';
  const e = end ? fmt(end) : '-';
  return `${s} ~ ${e}`;
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

export default function AdminEventDetail() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminEventDetailData | null>(null);
  const [rankingCalc, setRankingCalc] = useState<RankingStatusData>({ status: 'idle', current: 0, total: 0 });
  const [gameNameCandidates, setGameNameCandidates] = useState<AdminGameNameStat[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPhaseRef = useRef<string>('');

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
        const phase = res.data.phase || '';
        // 进入 basic_ready 阶段就先拉一次 detail，让基础榜立刻显示。
        if (phase && phase !== lastPhaseRef.current) {
          lastPhaseRef.current = phase;
          if (phase === 'basic_ready' || phase === 'telemetry_processing') {
            load();
          }
        }
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

  useEffect(() => {
    adminListGameNames()
      .then((res) => setGameNameCandidates(res.data))
      .catch(() => { /* 候选加载失败不影响手动输入 */ });
  }, []);

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

  return (
    <div className="page-wrap">
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

        <div className="admin-action-panel">
          <div className="admin-action-group">
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
          </div>
          <div className="admin-action-group admin-action-group--danger">
            {!ev.ended && <Button icon={<ClearOutlined />} danger onClick={handleClear}>清空报名</Button>}
            <Button icon={<DeleteOutlined />} danger type="primary" onClick={handleDelete}>删除活动</Button>
          </div>
        </div>

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
                    gameNameCandidates={gameNameCandidates}
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
                  {rankingCalc.phase === 'basic_ready' && '基础榜单已就绪，遥测分析中…'}
                  {rankingCalc.phase === 'telemetry_processing' && '遥测分析中…'}
                  {(!rankingCalc.phase || rankingCalc.phase === 'match_fetching' || rankingCalc.phase === 'idle') && '获取比赛数据中…'}
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

          {pubgEnabled && rankingCalc.status === 'done' && rankingCalc.phase === 'partial_ready' && (
            <div style={{ margin: '12px 0 8px', fontSize: 12, color: '#faad14' }}>
              <WarningOutlined style={{ marginRight: 6 }} />部分场次的遥测数据缺失，承伤 / 换血比 / 命中效可能不完整。
            </div>
          )}

          {pubgEnabled && rankings && rankings.length > 0 && (
            <>
              <div className="section-label" style={{ margin: '12px 0 8px' }}>战绩排名</div>
              <CompactRankingTable rankings={rankings} />
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
  gameNameCandidates: AdminGameNameStat[];
  onRefresh: () => void;
}

function SlotRow({ slot, date, gameNameCandidates, onRefresh }: SlotRowProps) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const options = rankGameNames(inputVal, gameNameCandidates, 8).map((candidate) => ({
    value: candidate.name,
    label: (
      <span>
        {candidate.name}
        {candidate.users > 1 && (
          <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 12 }}>
            {candidate.users} 人使用
          </span>
        )}
      </span>
    ),
  }));

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
    <div className="admin-slot-row">
      <span style={{ color: 'var(--text-dim)', width: 20, fontSize: 12 }}>{slot.slotNo}</span>
      {slot.filled ? (
        <>
          <span style={{ color: 'var(--text)', flex: 1 }}>{slot.name}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{slot.phone}</span>
          <Popconfirm title={`确定移除 ${slot.name}？`} onConfirm={handleRemove} okText="移除" cancelText="取消" okButtonProps={{ danger: true }}>
            <Button size="small" type="text" danger icon={<CloseOutlined />} aria-label={`移除 ${slot.name}`} style={{ fontSize: 11 }} />
          </Popconfirm>
        </>
      ) : editing ? (
        <>
          <AutoComplete
            size="small"
            options={options}
            filterOption={false}
            notFoundContent={null}
            placeholder="输入或选择游戏名"
            value={inputVal}
            onChange={setInputVal}
            style={{ flex: 1 }}
            autoFocus
          >
            <Input onPressEnter={handleSubmit} />
          </AutoComplete>
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
