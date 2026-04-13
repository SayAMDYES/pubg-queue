import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Table, Tag, Button, Space, message, Modal, Spin, Descriptions, Input, Popconfirm } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, ReloadOutlined, ClearOutlined, DeleteOutlined, PlayCircleOutlined, StopOutlined, PlusOutlined, CloseOutlined } from '@ant-design/icons';
import { adminGetEventDetail, adminClearEvent, adminDeleteEvent, adminRefreshRankings, adminStartEvent, adminEndEvent, adminManualRegister, adminRemoveRegistration, type AdminEventDetailData } from '../../api';
import { formatDateTime } from '../../utils';

const rankLabelColors: Record<string, string> = {
  '战神': '#ff4d4f',
  '精锐': '#faad14',
  '骨干': '#1677ff',
  '菜鸟': '#52c41a',
  '战犯': '#666',
  '缺席': '#999',
};

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

  useEffect(() => { load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

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
      message.success('战绩刷新已启动，请稍后刷新页面查看');
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

  // 找出击杀、死亡、场均伤害最高值
  let maxKills = 0, maxDeaths = 0, maxAvgDamage = 0;
  if (rankings && rankings.length > 0) {
    for (const r of rankings) {
      if (r.Kills > maxKills) maxKills = r.Kills;
      if (r.Deaths > maxDeaths) maxDeaths = r.Deaths;
      if (r.AvgDamage > maxAvgDamage) maxAvgDamage = r.AvgDamage;
    }
  }
  const highlightIf = (val: number, max: number) =>
    val === max && val > 0 ? { fontWeight: 700, color: '#f0a500' } : {};

  const rankColumns = [
    { title: '排名', dataIndex: 'RankNo', key: 'rankNo', width: 60 },
    {
      title: '称号',
      dataIndex: 'RankLabel',
      key: 'rankLabel',
      render: (label: string) => <Tag color={rankLabelColors[label] || '#999'}>{label}</Tag>,
    },
    { title: '游戏名', dataIndex: 'GameName', key: 'gameName' },
    { title: '场次', dataIndex: 'Matches', key: 'matches' },
    {
      title: '击杀', dataIndex: 'Kills', key: 'kills',
      render: (v: number) => <span style={highlightIf(v, maxKills)}>{v === maxKills && v > 0 ? '🏆 ' : ''}{v}</span>,
    },
    {
      title: '死亡', dataIndex: 'Deaths', key: 'deaths',
      render: (v: number) => <span style={highlightIf(v, maxDeaths)}>{v === maxDeaths && v > 0 ? '💀 ' : ''}{v}</span>,
    },
    { title: '助攻', dataIndex: 'Assists', key: 'assists' },
    { title: 'KDA', dataIndex: 'KDA', key: 'kda', render: (v: number) => v?.toFixed(2) || '-' },
    {
      title: '场均伤害', dataIndex: 'AvgDamage', key: 'avgDamage',
      render: (v: number) => <span style={highlightIf(v, maxAvgDamage)}>{v === maxAvgDamage && v > 0 ? '🔥 ' : ''}{v?.toFixed(0) || '-'}</span>,
    },
    { title: '评分', dataIndex: 'Score', key: 'score', render: (v: number) => v?.toFixed(1) || '-' },
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
            <Descriptions.Item label="预计时间">{ev.startTime || '-'} ~ {ev.endTime || '-'}</Descriptions.Item>
            <Descriptions.Item label="实际时间">{ev.actualStart || '-'} ~ {ev.actualEnd || '-'}</Descriptions.Item>
            {ev.note && <Descriptions.Item label="备注" span={2}>{ev.note}</Descriptions.Item>}
          </Descriptions>
        </div>

        <Space wrap style={{ marginBottom: 20 }}>
          <Button icon={<DownloadOutlined />} onClick={() => window.open(`/api/admin/events/${date}/export`, '_blank')}>导出 CSV</Button>
          <Button onClick={() => navigate(`/admin/events/${date}/edit`)}>编辑活动</Button>
          <Button icon={<PlayCircleOutlined />} onClick={handleStart}>记录开始时间</Button>
          <Button icon={<StopOutlined />} onClick={handleEnd}>记录结束时间</Button>
          {pubgEnabled && <Button icon={<ReloadOutlined />} onClick={handleRefreshRankings}>重新计算战绩</Button>}
          <Button icon={<ClearOutlined />} danger onClick={handleClear}>清空报名</Button>
          <Button icon={<DeleteOutlined />} danger type="primary" onClick={handleDelete}>删除活动</Button>
        </Space>

        {/* Teams grid */}
        <div className="section-label" style={{ marginBottom: 12 }}>队伍安排</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
          {teams.map((team) => (
            <div key={team.teamNo} className="g-card">
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

        {/* Waitlist */}
        {waitlist.length > 0 && (
          <div className="g-card" style={{ marginBottom: 16 }}>
            <div className="section-label" style={{ marginBottom: 12 }}>候补名单</div>
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
            />
          </div>
        )}

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

        {/* Rankings */}
        {pubgEnabled && rankings && rankings.length > 0 && (
          <div className="g-card">
            <div className="section-label" style={{ marginBottom: 12 }}>战绩排名</div>
            <Table
              dataSource={rankings}
              columns={rankColumns}
              pagination={false}
              size="small"
              scroll={{ x: 780 }}
              rowKey="RankNo"
            />
          </div>
        )}
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