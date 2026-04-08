import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Input, Typography, Space, Spin, Card, Statistic, Row, Col,
  Table, Tag, message, Modal, Descriptions, Divider
} from 'antd';
import { ArrowLeftOutlined, SearchOutlined, TrophyOutlined } from '@ant-design/icons';
import {
  getPlayerStats, getMatchDetail,
  type PlayerStatsOverview, type MatchDetail, type MatchParticipantDetail
} from '../api';

const { Title, Text } = Typography;

const gameModeLabel: Record<string, string> = {
  'squad-fpp': '四排FPP',
  'squad': '四排TPP',
  'duo-fpp': '双排FPP',
  'duo': '双排TPP',
  'solo-fpp': '单排FPP',
  'solo': '单排TPP',
};

const mapNameLabel: Record<string, string> = {
  'Erangel_Main': '艾伦格',
  'Savage_Main': '萨诺',
  'DihorOtok_Main': '维肯迪',
  'Summerland_Main': '卡拉金',
  'Baltic_Main': '艾伦格',
  'Range_Main': '训练场',
  'Kiki_Main': '德斯顿',
  'Tiger_Main': '塔戈',
  'Neon_Main': '荣光',
  'Heaven_Main': '里维拉',
};

const rankColor = (rank: number): string => {
  if (rank === 1) return '#f5a623';
  if (rank <= 5) return '#f0a500';
  if (rank <= 10) return '#4a9e4a';
  return '#555';
};

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m${Math.round(seconds % 60)}s`;
}

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)}km`;
}

interface MatchRow {
  matchId: string;
  playerName: string;
  loading: boolean;
  detail: MatchDetail | null;
  error: boolean;
}

export default function StatsPage() {
  const navigate = useNavigate();
  const [searchName, setSearchName] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<PlayerStatsOverview | null>(null);
  const [matchRows, setMatchRows] = useState<MatchRow[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchDetail | null>(null);

  const handleSearch = useCallback(async () => {
    const name = searchName.trim();
    if (!name) return;
    setLoading(true);
    setStats(null);
    setMatchRows([]);
    try {
      const res = await getPlayerStats(name);
      const data = res.data;
      setStats(data);
      // Initialize match rows without details
      setMatchRows(data.recentMatchIds.map((id) => ({
        matchId: id,
        playerName: data.playerName,
        loading: false,
        detail: null,
        error: false,
      })));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '查询失败';
      message.error(msg === '玩家不存在' ? `未找到玩家 "${name}"` : msg);
    } finally {
      setLoading(false);
    }
  }, [searchName]);

  const loadMatchDetail = useCallback(async (matchId: string, playerName: string, index: number) => {
    setMatchRows((prev) => prev.map((r, i) => i === index ? { ...r, loading: true } : r));
    try {
      const res = await getMatchDetail(matchId, playerName);
      setMatchRows((prev) => prev.map((r, i) => i === index ? { ...r, loading: false, detail: res.data } : r));
    } catch {
      setMatchRows((prev) => prev.map((r, i) => i === index ? { ...r, loading: false, error: true } : r));
    }
  }, []);

  const matchColumns = [
    {
      title: '排名',
      key: 'rank',
      width: 80,
      render: (_: unknown, row: MatchRow) => {
        if (row.loading) return <Spin size="small" />;
        if (!row.detail) return (
          <Button size="small" type="link" onClick={() => loadMatchDetail(row.matchId, row.playerName, matchRows.indexOf(row))}>
            加载
          </Button>
        );
        const r = row.detail.playerRank;
        return (
          <div
            style={{
              display: 'inline-block', width: 36, height: 36, lineHeight: '36px', textAlign: 'center',
              borderRadius: 6, background: rankColor(r), color: '#fff', fontWeight: 700, fontSize: 13,
            }}
          >
            #{r}
          </div>
        );
      },
    },
    {
      title: '模式/地图',
      key: 'mode',
      render: (_: unknown, row: MatchRow) => {
        if (!row.detail) return <Text type="secondary">-</Text>;
        const d = row.detail;
        return (
          <Space direction="vertical" size={0}>
            <Tag color="blue" style={{ fontSize: 11 }}>{gameModeLabel[d.gameMode] || d.gameMode}</Tag>
            <Text style={{ fontSize: 11, color: '#888' }}>{mapNameLabel[d.mapName] || d.mapName}</Text>
          </Space>
        );
      },
    },
    {
      title: '时间',
      key: 'time',
      render: (_: unknown, row: MatchRow) => {
        if (!row.detail) return <Text type="secondary">-</Text>;
        const d = new Date(row.detail.createdAt);
        return (
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: 12 }}>{d.toLocaleDateString('zh-CN')}</Text>
            <Text style={{ fontSize: 11, color: '#888' }}>{d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</Text>
          </Space>
        );
      },
    },
    {
      title: '击杀',
      key: 'kills',
      width: 60,
      render: (_: unknown, row: MatchRow) => {
        if (!row.detail) return '-';
        return <Text style={{ color: row.detail.player.kills > 0 ? '#f0a500' : '#ccc' }}>{row.detail.player.kills}</Text>;
      },
    },
    {
      title: '伤害',
      key: 'damage',
      width: 70,
      render: (_: unknown, row: MatchRow) => {
        if (!row.detail) return '-';
        return <Text>{Math.round(row.detail.player.damage)}</Text>;
      },
    },
    {
      title: '存活',
      key: 'survived',
      width: 60,
      render: (_: unknown, row: MatchRow) => {
        if (!row.detail) return '-';
        return row.detail.player.survived
          ? <Tag color="green" style={{ fontSize: 11 }}>存活</Tag>
          : <Tag color="default" style={{ fontSize: 11 }}>阵亡</Tag>;
      },
    },
    {
      title: '详情',
      key: 'action',
      width: 60,
      render: (_: unknown, row: MatchRow) => {
        if (!row.detail) return null;
        return (
          <Button size="small" onClick={() => setSelectedMatch(row.detail)}>详情</Button>
        );
      },
    },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px', background: '#0a0a0a', minHeight: '100vh' }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>返回</Button>
      </Space>

      <Title level={3} style={{ color: '#f0a500', textAlign: 'center' }}>
        <TrophyOutlined style={{ marginRight: 8 }} />战绩查询
      </Title>

      <Card style={{ marginBottom: 24 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="输入 PUBG 游戏名（区分大小写）"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onPressEnter={handleSearch}
            size="large"
          />
          <Button type="primary" icon={<SearchOutlined />} size="large" loading={loading} onClick={handleSearch}>
            查询
          </Button>
        </Space.Compact>
      </Card>

      {loading && <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>}

      {stats && (
        <>
          <Card title={<Text style={{ color: '#f0a500', fontWeight: 700 }}>{stats.playerName}</Text>} style={{ marginBottom: 24 }}>
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <Statistic title="本赛季场次" value={stats.matches} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic title="KDA" value={stats.kda.toFixed(2)} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic title="总击杀" value={stats.kills} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic title="均伤" value={Math.round(stats.avgDamage)} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic title="总助攻" value={stats.assists} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic title="总死亡" value={stats.deaths} />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic title="总伤害" value={Math.round(stats.totalDamage)} />
              </Col>
            </Row>
          </Card>

          {matchRows.length > 0 && (
            <Card title={`近期对局（${matchRows.length} 场）`} extra={
              <Button size="small" onClick={() => {
                matchRows.forEach((row, i) => {
                  if (!row.detail && !row.loading) {
                    setTimeout(() => loadMatchDetail(row.matchId, row.playerName, i), i * 800);
                  }
                });
              }}>全部加载</Button>
            }>
              <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                点击"加载"或"全部加载"获取每场详情（每场约需 1-2 秒）
              </Text>
              <Table
                dataSource={matchRows}
                columns={matchColumns}
                rowKey="matchId"
                pagination={false}
                size="small"
              />
            </Card>
          )}
        </>
      )}

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
  );
}

function MatchDetailView({ match }: { match: MatchDetail }) {
  const createdAt = new Date(match.createdAt);

  return (
    <div>
      <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="时间">
          {createdAt.toLocaleString('zh-CN')}
        </Descriptions.Item>
        <Descriptions.Item label="模式">
          {gameModeLabel[match.gameMode] || match.gameMode}
        </Descriptions.Item>
        <Descriptions.Item label="地图">
          {mapNameLabel[match.mapName] || match.mapName}
        </Descriptions.Item>
        <Descriptions.Item label="总队伍/玩家">
          {match.totalTeams} 队 / {match.totalPlayers} 人
        </Descriptions.Item>
      </Descriptions>

      <Divider>我的战绩</Divider>
      <ParticipantStats p={match.player} highlight />

      {match.teammates && match.teammates.length > 0 && (
        <>
          <Divider>队友</Divider>
          {match.teammates.map((tm, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <Text strong style={{ color: '#ccc' }}>{tm.name}</Text>
              <ParticipantStats p={tm} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function ParticipantStats({ p, highlight }: { p: MatchParticipantDetail; highlight?: boolean }) {
  const color = highlight ? '#f0a500' : '#888';
  return (
    <Row gutter={[8, 8]} style={{ marginBottom: 8, padding: '8px', background: highlight ? '#1a1a2e' : 'transparent', borderRadius: 6 }}>
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
          <Text style={{ fontSize: 12, color: '#888' }}>状态</Text>
          <div style={{ marginTop: 4 }}>
            {p.survived
              ? <Tag color="green">存活</Tag>
              : <Tag color="default">阵亡</Tag>}
          </div>
        </div>
      </Col>
    </Row>
  );
}
