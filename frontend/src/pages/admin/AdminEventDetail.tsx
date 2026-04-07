import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Table, Tag, Button, Space, message, Typography, Modal, Spin, Descriptions } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, ReloadOutlined, ClearOutlined, DeleteOutlined } from '@ant-design/icons';
import { adminGetEventDetail, adminClearEvent, adminDeleteEvent, adminRefreshRankings, type AdminEventDetailData } from '../../api';

const { Title, Text } = Typography;

const rankLabelColors: Record<string, string> = {
  '战神': '#ff4d4f',
  '精锐': '#faad14',
  '骨干': '#1677ff',
  '菜鸟': '#52c41a',
  '战犯': '#666',
  '缺席': '#999',
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

  if (loading || !data) {
    return <div style={{ textAlign: 'center', padding: 80, background: '#0a0a0a', minHeight: '100vh' }}><Spin size="large" /></div>;
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
      render: (s: string) => <Tag color={s === 'assigned' ? 'green' : s === 'waitlist' ? 'orange' : 'red'}>{s}</Tag>,
    },
    { title: '队伍', dataIndex: 'teamNo', key: 'teamNo' },
    { title: '位置', dataIndex: 'slotNo', key: 'slotNo' },
    { title: '报名时间', dataIndex: 'createdAt', key: 'createdAt' },
  ];

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
    { title: '击杀', dataIndex: 'Kills', key: 'kills' },
    { title: '死亡', dataIndex: 'Deaths', key: 'deaths' },
    { title: '助攻', dataIndex: 'Assists', key: 'assists' },
    { title: 'KDA', dataIndex: 'KDA', key: 'kda', render: (v: number) => v?.toFixed(2) || '-' },
    { title: '场均伤害', dataIndex: 'AvgDamage', key: 'avgDamage', render: (v: number) => v?.toFixed(0) || '-' },
    { title: '评分', dataIndex: 'Score', key: 'score', render: (v: number) => v?.toFixed(1) || '-' },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px', background: '#0a0a0a', minHeight: '100vh' }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin')}>返回</Button>
      </Space>

      <Title level={3} style={{ color: '#f0a500' }}>{ev.eventDate} 报名详情</Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="状态"><Tag color={ev.open ? 'green' : 'red'}>{ev.open ? '开放' : '关闭'}</Tag></Descriptions.Item>
          <Descriptions.Item label="队伍数">{ev.teamCount}</Descriptions.Item>
          <Descriptions.Item label="预计时间">{ev.startTime || '-'} ~ {ev.endTime || '-'}</Descriptions.Item>
          <Descriptions.Item label="实际时间">{ev.actualStart || '-'} ~ {ev.actualEnd || '-'}</Descriptions.Item>
          {ev.note && <Descriptions.Item label="备注" span={2}>{ev.note}</Descriptions.Item>}
        </Descriptions>
      </Card>

      <Space wrap style={{ marginBottom: 16 }}>
        <Button icon={<DownloadOutlined />} onClick={() => window.open(`/api/admin/events/${date}/export`, '_blank')}>导出 CSV</Button>
        <Button onClick={() => navigate(`/admin/events/${date}/edit`)}>编辑活动</Button>
        {pubgEnabled && <Button icon={<ReloadOutlined />} onClick={handleRefreshRankings}>刷新战绩</Button>}
        <Button icon={<ClearOutlined />} danger onClick={handleClear}>清空报名</Button>
        <Button icon={<DeleteOutlined />} danger type="primary" onClick={handleDelete}>删除活动</Button>
      </Space>

      {/* 队伍网格 */}
      {teams.map((team) => (
        <Card key={team.teamNo} title={`第 ${team.teamNo} 队`} size="small" style={{ marginBottom: 12 }}>
          <Table
            dataSource={team.slots}
            columns={[
              { title: '位置', dataIndex: 'slotNo', key: 'slotNo', width: 60 },
              { title: '游戏名', dataIndex: 'name', key: 'name', render: (n: string, r: { filled: boolean }) => r.filled ? n : <Text type="secondary">空位</Text> },
              { title: '手机号', dataIndex: 'phone', key: 'phone', render: (p: string, r: { filled: boolean }) => r.filled ? p : '-' },
            ]}
            pagination={false}
            size="small"
            rowKey={(_r, idx) => `${team.teamNo}-${idx}`}
          />
        </Card>
      ))}

      {waitlist.length > 0 && (
        <Card title="候补名单" size="small" style={{ marginBottom: 16 }}>
          <Table
            dataSource={waitlist}
            columns={[
              { title: '序号', key: 'idx', width: 60, render: (_: unknown, __: unknown, idx: number) => idx + 1 },
              { title: '游戏名', dataIndex: 'name', key: 'name' },
              { title: '手机号', dataIndex: 'phone', key: 'phone' },
            ]}
            pagination={false}
            size="small"
            rowKey={(_, idx) => String(idx)}
          />
        </Card>
      )}

      <Card title="报名记录" size="small" style={{ marginBottom: 16 }}>
        <Table
          dataSource={registrations}
          columns={regColumns}
          pagination={false}
          size="small"
          rowKey="id"
        />
      </Card>

      {pubgEnabled && rankings && rankings.length > 0 && (
        <Card title="🏆 战绩排名" size="small">
          <Table
            dataSource={rankings}
            columns={rankColumns}
            pagination={false}
            size="small"
            rowKey="RankNo"
          />
        </Card>
      )}
    </div>
  );
}
