import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, AutoComplete, Input, Typography, Space, Spin, Statistic, Row, Col,
  Table, Tag, message, Modal, Descriptions, Divider, Select, Pagination, Progress
} from 'antd';
import { ArrowLeftOutlined, SearchOutlined, TrophyOutlined, UserOutlined, LogoutOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  getPlayerStats, getMatchDetail, getSeasons, userLogout,
  type PlayerStatsOverview, type MatchDetail, type MatchParticipantDetail, type SeasonInfo
} from '../api';
import { useUserMe } from '../hooks/useUserMe';

const HISTORY_KEY = 'stats_search_history';

function getSearchHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveSearchHistory(name: string): string[] {
  const history = getSearchHistory().filter((h) => h !== name);
  history.unshift(name);
  const updated = history.slice(0, 10);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  return updated;
}

const { Text } = Typography;

const gameModeLabel: Record<string, string> = {
  'squad-fpp': '四排FPP',
  'squad': '四排TPP',
  'duo-fpp': '双排FPP',
  'duo': '双排TPP',
  'solo-fpp': '单排FPP',
  'solo': '单排TPP',
};

const mapNameLabel: Record<string, string> = {
  'Baltic_Main': '艾伦格',
  'Erangel_Main': '艾伦格',
  'Desert_Main': '米拉玛',
  'Savage_Main': '萨诺',
  'DihorOtok_Main': '维肯迪',
  'Summerland_Main': '卡拉金',
  'Range_Main': '训练场',
  'Kiki_Main': '德斯顿',
  'Tiger_Main': '塔戈',
  'Neon_Main': '荣光',
  'Heaven_Main': '里维拉',
  'Chimera_Main': '帕拉莫',
  'Rondo_Main': '荣耀',
  'LaboratoryMain': '绝境岛',
  'Shipment_Main': '战舰',
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

function seasonLabel(id: string): string {
  const parts = id.split('.');
  const last = parts[parts.length - 1] || id;
  const numMatch = last.match(/(\d+)$/);
  if (numMatch) {
    return `第 ${parseInt(numMatch[1], 10)} 赛季`;
  }
  return last;
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
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState<PlayerStatsOverview | null>(null);
  const [currentPlayerName, setCurrentPlayerName] = useState('');
  const [matchRows, setMatchRows] = useState<MatchRow[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchDetail | null>(null);
  const [seasons, setSeasons] = useState<SeasonInfo[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const autoLoadedRef = useRef<string>('');
  const { user, refresh: refreshUser } = useUserMe();

  useEffect(() => {
    setSearchHistory(getSearchHistory());
    getSeasons().then((res) => {
      setSeasons(res.data);
      const current = res.data.find((s) => s.isCurrentSeason);
      if (current) setSelectedSeason(current.id);
    }).catch(() => {
      // PUBG API 未配置时忽略错误
    });
  }, []);

  const handleLogout = async () => {
    try {
      await userLogout();
      message.success('已退出登录');
      refreshUser();
    } catch {
      message.error('退出失败');
    }
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

  const handleSearch = useCallback(async () => {
    const name = searchName.trim();
    if (!name) return;
    setLoading(true);
    setStats(null);
    setMatchRows([]);
    setCurrentPage(1);
    autoLoadedRef.current = '';
    try {
      const res = await getPlayerStats(name, selectedSeason);
      const data = res.data;
      setStats(data);
      setCurrentPlayerName(name);
      const updated = saveSearchHistory(name);
      setSearchHistory(updated);
      const rows: MatchRow[] = data.recentMatchIds.map((id) => ({
        matchId: id,
        playerName: data.playerName,
        loading: false,
        detail: null,
        error: false,
      }));
      setMatchRows(rows);
      autoLoadedRef.current = data.recentMatchIds[0] ?? '';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '查询失败';
      message.error(msg === '玩家不存在' ? `未找到玩家 "${name}"` : msg);
    } finally {
      setLoading(false);
    }
  }, [searchName, selectedSeason]);

  const handleSeasonChange = useCallback(async (newSeason: string) => {
    setSelectedSeason(newSeason);
    if (!currentPlayerName) return;
    setStatsLoading(true);
    try {
      const res = await getPlayerStats(currentPlayerName, newSeason);
      setStats(res.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '查询失败';
      message.error(msg);
    } finally {
      setStatsLoading(false);
    }
  }, [currentPlayerName]);

  // 搜索成功后自动依次加载所有对局详情（每 800ms 一场）
  useEffect(() => {
    if (matchRows.length === 0) return;
    if (autoLoadedRef.current !== matchRows[0]?.matchId) return;
    matchRows.forEach((row, i) => {
      setTimeout(() => loadMatchDetail(row.matchId, row.playerName, i), i * 800);
    });
    // 标记已触发，避免重复
    autoLoadedRef.current = '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoadedRef.current]);

  // 统计摘要（基于已加载 detail 的场次）
  const loadedRows = matchRows.filter((r) => r.detail !== null);
  const avgDamage = loadedRows.length > 0
    ? loadedRows.reduce((sum, r) => sum + r.detail!.player.damage, 0) / loadedRows.length
    : 0;
  const avgKills = loadedRows.length > 0
    ? loadedRows.reduce((sum, r) => sum + r.detail!.player.kills, 0) / loadedRows.length
    : 0;

  const pageSize = 10;
  const pagedRows = matchRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const matchColumns = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: unknown, row: MatchRow) => {
        if (row.loading) return <Spin size="small" />;
        if (!row.detail) return <Text type="secondary">-</Text>;
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
      width: 90,
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
      width: 100,
      render: (_: unknown, row: MatchRow) => {
        if (!row.detail) return <Text type="secondary">-</Text>;
        const start = new Date(row.detail.createdAt);
        const dateStr = start.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
        const timeStr = start.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        return (
          <Space direction="vertical" size={0}>
            <Text style={{ fontSize: 12 }}>{dateStr}</Text>
            <Text style={{ fontSize: 11, color: '#888' }}>{timeStr} · {formatTime(row.detail.duration)}</Text>
          </Space>
        );
      },
    },
    {
      title: '击杀',
      key: 'kills',
      width: 55,
      render: (_: unknown, row: MatchRow) => {
        if (!row.detail) return '-';
        return <Text style={{ color: row.detail.player.kills > 0 ? '#f0a500' : '#ccc' }}>{row.detail.player.kills}</Text>;
      },
    },
    {
      title: '击倒',
      key: 'dbnos',
      width: 55,
      render: (_: unknown, row: MatchRow) => {
        if (!row.detail) return '-';
        return <Text>{row.detail.player.dbnos}</Text>;
      },
    },
    {
      title: '助攻',
      key: 'assists',
      width: 55,
      render: (_: unknown, row: MatchRow) => {
        if (!row.detail) return '-';
        return <Text>{row.detail.player.assists}</Text>;
      },
    },
    {
      title: '伤害',
      key: 'damage',
      width: 65,
      render: (_: unknown, row: MatchRow) => {
        if (!row.detail) return '-';
        return <Text>{Math.round(row.detail.player.damage)}</Text>;
      },
    },
    {
      title: '生存',
      key: 'survive',
      width: 70,
      render: (_: unknown, row: MatchRow) => {
        if (!row.detail) return '-';
        return <Text style={{ fontSize: 12 }}>{formatTime(row.detail.player.timeSurvived)}</Text>;
      },
    },
    {
      title: '详情',
      key: 'action',
      width: 55,
      render: (_: unknown, row: MatchRow) => {
        if (!row.detail) return null;
        return (
          <Button size="small" onClick={() => setSelectedMatch(row.detail)}>详情</Button>
        );
      },
    },
  ];

  return (
    <div className="page-wrap">
      <div className="page-inner">
        <div className="page-header">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>返回</Button>
          {user.loggedIn ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}><UserOutlined style={{ marginRight: 4 }} />{user.phone}</span>
              <Button size="small" icon={<LogoutOutlined />} onClick={handleLogout}>退出</Button>
            </div>
          ) : (
            <Button size="small" icon={<UserOutlined />} onClick={() => navigate('/login?next=/stats')}>登录 / 注册</Button>
          )}
        </div>

        <div className="page-title page-title--lg" style={{ textAlign: 'center', marginBottom: 24 }}>
          <TrophyOutlined style={{ marginRight: 8, color: 'var(--primary)' }} />战绩查询
        </div>

        <div className="g-card" style={{ marginBottom: 24 }}>
          {user.loggedIn && user.gameNames.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 12, marginRight: 8 }}>我的游戏 ID：</span>
              <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
                {user.gameNames.map((name) => (
                  <Tag
                    key={name}
                    color="gold"
                    style={{ cursor: 'pointer', fontSize: 13 }}
                    onClick={() => setSearchName(name)}
                  >
                    {name}
                  </Tag>
                ))}
              </span>
            </div>
          )}
          <Space.Compact style={{ width: '100%' }}>
            <AutoComplete
              style={{ flex: 1 }}
              options={searchHistory.map((h) => ({ value: h }))}
              value={searchName}
              onChange={(val) => setSearchName(val)}
              onSelect={(val) => setSearchName(val)}
            >
              <Input
                placeholder="输入 PUBG 游戏名（区分大小写）"
                onPressEnter={handleSearch}
                size="large"
              />
            </AutoComplete>
            <Button type="primary" icon={<SearchOutlined />} size="large" loading={loading} onClick={handleSearch}>
              查询
            </Button>
          </Space.Compact>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>}

        {stats && (
          <>
            <div className="g-card" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 16 }}>{stats.playerName}</span>
                {seasons.length > 0 && (
                  <Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>赛季：</Text>
                    <Select
                      style={{ minWidth: 120 }}
                      size="small"
                      value={selectedSeason}
                      onChange={handleSeasonChange}
                      loading={statsLoading}
                      options={seasons.map((s) => ({
                        label: seasonLabel(s.id) + (s.isCurrentSeason ? ' (当前)' : ''),
                        value: s.id,
                      }))}
                    />
                  </Space>
                )}
              </div>
              <Row gutter={[16, 16]}>
                <Col xs={12} sm={6}><Statistic title="本赛季场次" value={stats.matches} /></Col>
                <Col xs={12} sm={6}><Statistic title="K/D" value={stats.kda.toFixed(2)} /></Col>
                <Col xs={12} sm={6}><Statistic title="总击杀" value={stats.kills} /></Col>
                <Col xs={12} sm={6}><Statistic title="均伤" value={Math.round(stats.avgDamage)} /></Col>
                <Col xs={12} sm={6}><Statistic title="总助攻" value={stats.assists} /></Col>
                <Col xs={12} sm={6}><Statistic title="总死亡" value={stats.deaths} /></Col>
                <Col xs={12} sm={6}><Statistic title="总伤害" value={Math.round(stats.totalDamage)} /></Col>
              </Row>
            </div>

            {matchRows.length > 0 && (
              <div className="g-card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="section-label">近期对局</div>
                    <Button
                      size="small"
                      type="text"
                      icon={<ReloadOutlined />}
                      loading={loading}
                      onClick={handleSearch}
                      style={{ color: 'var(--text-muted)' }}
                    />
                  </div>
                  {loadedRows.length < matchRows.length && (
                    <Progress
                      percent={Math.round(loadedRows.length / matchRows.length * 100)}
                      size="small"
                      style={{ width: 140 }}
                      format={() => `${loadedRows.length}/${matchRows.length}`}
                    />
                  )}
                </div>
                {loadedRows.length > 0 && (
                  <Row gutter={[16, 8]} style={{ marginBottom: 16 }}>
                    <Col xs={12} sm={8}><Statistic title="场均伤害" value={Math.round(avgDamage)} /></Col>
                    <Col xs={12} sm={8}><Statistic title="场均击杀" value={avgKills.toFixed(2)} /></Col>
                  </Row>
                )}
                <Table
                  dataSource={pagedRows}
                  columns={matchColumns}
                  rowKey="matchId"
                  pagination={false}
                  size="small"
                  scroll={{ x: 600 }}
                />
                {matchRows.length > pageSize && (
                  <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <Pagination
                      current={currentPage}
                      pageSize={pageSize}
                      total={matchRows.length}
                      onChange={(page) => setCurrentPage(page)}
                      simple
                    />
                  </div>
                )}
              </div>
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
