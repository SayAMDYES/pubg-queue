import { InfoCircleOutlined } from '@ant-design/icons';
import { Table, Tag, Tooltip } from 'antd';
import type { RankEntry } from '../api';
import { analysisStatusLabel, confidenceColor, confidenceLabel, resolveRankTags } from '../rankingTags';

type CompactRankingTableProps = {
  rankings: RankEntry[];
  size?: 'small' | 'middle' | 'large';
};

type RankingMaxima = {
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  kpg: number;
  avgDamage: number;
  avgDamageTaken: number;
  tradeRatio: number;
  hitEfficiency: number;
  timeAlive: number;
  score: number;
};

const titleWithTip = (title: string, tip: string) => (
  <Tooltip title={tip}>
    <span style={{ cursor: 'help' }}>
      {title} <InfoCircleOutlined style={{ fontSize: 10, opacity: 0.45 }} />
    </span>
  </Tooltip>
);

const hasNumber = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

const formatCount = (value: number | null | undefined): string => (hasNumber(value) ? String(value) : '-');

const formatFixed = (value: number | null | undefined, digits: number): string => (
  hasNumber(value) && value > 0 ? value.toFixed(digits) : '-'
);

const formatDuration = (value: number | null | undefined): string => {
  if (!hasNumber(value) || value <= 0) return '-';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}分${String(seconds).padStart(2, '0')}秒`;
};

const buildMaxima = (rankings: RankEntry[]): RankingMaxima => {
  const maxima: RankingMaxima = {
    kills: 0,
    deaths: 0,
    assists: 0,
    kda: 0,
    kpg: 0,
    avgDamage: 0,
    avgDamageTaken: 0,
    tradeRatio: 0,
    hitEfficiency: 0,
    timeAlive: 0,
    score: 0,
  };

  for (const record of rankings) {
    if (record.Kills > maxima.kills) maxima.kills = record.Kills;
    if (record.Deaths > maxima.deaths) maxima.deaths = record.Deaths;
    if (record.Assists > maxima.assists) maxima.assists = record.Assists;
    if ((record.KDA || 0) > maxima.kda) maxima.kda = record.KDA || 0;
    if ((record.KPG || 0) > maxima.kpg) maxima.kpg = record.KPG || 0;
    if (record.AvgDamage > maxima.avgDamage) maxima.avgDamage = record.AvgDamage;
    if ((record.AvgDamageTaken || 0) > maxima.avgDamageTaken) maxima.avgDamageTaken = record.AvgDamageTaken || 0;
    if ((record.TradeRatio || 0) > maxima.tradeRatio) maxima.tradeRatio = record.TradeRatio || 0;
    if ((record.HitEfficiency || 0) > maxima.hitEfficiency) maxima.hitEfficiency = record.HitEfficiency || 0;
    if ((record.TimeAlive || 0) > maxima.timeAlive) maxima.timeAlive = record.TimeAlive || 0;
    if ((record.Score || 0) > maxima.score) maxima.score = record.Score || 0;
  }

  return maxima;
};

const metricCardStyle = (highlighted: boolean) => ({
  display: 'grid',
  gap: 2,
  minWidth: 64,
  padding: '6px 10px',
  borderRadius: 10,
  border: `1px solid ${highlighted ? 'rgba(240, 165, 0, 0.35)' : 'var(--border)'}`,
  background: highlighted ? 'rgba(240, 165, 0, 0.12)' : 'var(--surface-elevated, rgba(255, 255, 255, 0.03))',
});

const detailCardStyle = (highlighted: boolean) => ({
  padding: '10px 12px',
  borderRadius: 12,
  border: `1px solid ${highlighted ? 'rgba(240, 165, 0, 0.35)' : 'var(--border)'}`,
  background: highlighted ? 'rgba(240, 165, 0, 0.10)' : 'var(--surface-elevated, rgba(255, 255, 255, 0.03))',
});

export default function CompactRankingTable({ rankings, size = 'small' }: CompactRankingTableProps) {
  const maxima = buildMaxima(rankings);

  const renderCoreMetric = (label: string, value: string, highlighted = false) => (
    <span key={label} style={metricCardStyle(highlighted)}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: highlighted ? 700 : 600, color: highlighted ? '#f0a500' : 'inherit' }}>{value}</span>
    </span>
  );

  const renderDetailMetric = (label: string, value: string, highlighted = false) => (
    <div key={label} style={detailCardStyle(highlighted)}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: highlighted ? 700 : 600, color: highlighted ? '#f0a500' : 'inherit' }}>{value}</div>
    </div>
  );

  return (
    <Table
      dataSource={rankings}
      pagination={false}
      size={size}
      rowKey="RankNo"
      columns={[
        {
          title: '排名',
          dataIndex: 'RankNo',
          key: 'rankNo',
          width: 72,
          render: (value: number) => <span style={{ fontWeight: 700, fontSize: 16 }}>#{value}</span>,
        },
        {
          title: '玩家信息',
          key: 'player',
          render: (_: unknown, record: RankEntry) => {
            const tags = resolveRankTags(record, rankings);
            return (
              <div style={{ display: 'grid', gap: 8, minWidth: 0, wordBreak: 'break-word' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>{record.GameName || '-'}</span>
                  <Tag color={record.AnalysisVersion === 'v2' ? 'geekblue' : 'default'}>{(record.AnalysisVersion || 'v1').toUpperCase()}</Tag>
                </div>
                {tags.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {tags.map((tag, index) => (
                      <Tag key={`${record.RankNo}-${tag.label}-${index}`} color={tag.color}>{tag.label}</Tag>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{record.RankLabel || '点击展开查看详情'}</div>
                )}
              </div>
            );
          },
        },
        {
          title: titleWithTip('核心指标', '默认只展示出勤、击杀、K/D、KPG 和场均伤害，点击行可展开查看其余指标'),
          key: 'coreMetrics',
          render: (_: unknown, record: RankEntry) => (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {renderCoreMetric('场次', formatCount(record.Matches))}
              {renderCoreMetric('击杀', formatCount(record.Kills), record.Kills === maxima.kills && record.Kills > 0)}
              {renderCoreMetric('K/D', formatFixed(record.KDA, 2), (record.KDA || 0) === maxima.kda && (record.KDA || 0) > 0)}
              {renderCoreMetric('KPG', formatFixed(record.KPG, 2), (record.KPG || 0) === maxima.kpg && (record.KPG || 0) > 0)}
              {renderCoreMetric('场均伤害', formatFixed(record.AvgDamage, 0), record.AvgDamage === maxima.avgDamage && record.AvgDamage > 0)}
            </div>
          ),
        },
        {
          title: titleWithTip('评分', '综合战斗、效率、生存指标的加权得分'),
          dataIndex: 'Score',
          key: 'score',
          width: 96,
          render: (value: number, record: RankEntry) => {
            const highlighted = (value || 0) === maxima.score && (value || 0) > 0;
            return (
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontWeight: highlighted ? 700 : 600, fontSize: 18, color: highlighted ? '#f0a500' : 'inherit' }}>
                  {formatFixed(value, 1)}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'normal' }}>{record.RankLabel || '综合评分'}</span>
              </div>
            );
          },
        },
      ]}
      expandable={{
        expandRowByClick: true,
        expandedRowRender: (record) => (
          <div style={{ display: 'grid', gap: 12, padding: '8px 4px' }}>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              {renderDetailMetric('死亡', formatCount(record.Deaths), record.Deaths === maxima.deaths && record.Deaths > 0)}
              {renderDetailMetric('助攻', formatCount(record.Assists), record.Assists === maxima.assists && record.Assists > 0)}
              {renderDetailMetric('击倒', formatCount(record.DBNOs))}
              {renderDetailMetric('扶起', formatCount(record.Revives))}
              {renderDetailMetric('爆头', formatCount(record.HeadshotKills))}
              {renderDetailMetric('前十次数', formatCount(record.Top10Count))}
              {renderDetailMetric('场均承伤', formatFixed(record.AvgDamageTaken, 0), (record.AvgDamageTaken || 0) === maxima.avgDamageTaken && (record.AvgDamageTaken || 0) > 0)}
              {renderDetailMetric('换血比', formatFixed(record.TradeRatio, 2), (record.TradeRatio || 0) === maxima.tradeRatio && (record.TradeRatio || 0) > 0)}
              {renderDetailMetric('命中效', formatFixed(record.HitEfficiency, 2), (record.HitEfficiency || 0) === maxima.hitEfficiency && (record.HitEfficiency || 0) > 0)}
              {renderDetailMetric('总生存时长', formatDuration(record.TimeAlive), (record.TimeAlive || 0) === maxima.timeAlive && (record.TimeAlive || 0) > 0)}
              {renderDetailMetric('总伤害', formatFixed(record.TotalDamage, 0))}
              {renderDetailMetric('总承伤', formatFixed(record.DamageTaken, 0))}
              {renderDetailMetric('战斗评分', formatFixed(record.CombatScore, 1))}
              {renderDetailMetric('效率评分', formatFixed(record.EfficiencyScore, 1))}
              {renderDetailMetric('生存评分', formatFixed(record.SurvivalScore, 1))}
              {renderDetailMetric('团队评分', formatFixed(record.TeamScore, 1))}
              {renderDetailMetric('活动总场次', formatCount(record.EventMatches))}
              {renderDetailMetric('缺席场次', formatCount(record.MissedMatches))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {record.Confidence && (
                <Tag color={confidenceColor[record.Confidence] || 'default'}>
                  置信度：{confidenceLabel[record.Confidence] || record.Confidence}
                </Tag>
              )}
              {record.AnalysisStatus && (
                <Tag>
                  分析状态：{analysisStatusLabel[record.AnalysisStatus] || record.AnalysisStatus}
                </Tag>
              )}
            </div>

            {record.Comment && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-elevated, rgba(255, 255, 255, 0.03))',
                  lineHeight: 1.6,
                }}
              >
                <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>评价</span>
                {record.Comment}
              </div>
            )}
          </div>
        ),
      }}
    />
  );
}