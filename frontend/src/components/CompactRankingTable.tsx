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
  avgTimeAlive: number;
  tradeRatio: number;
  hitEfficiency: number;
  timeAlive: number;
  score: number;
};

type MetricDef = {
  label: string;
  tip: string;
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

const getAverageTimeAlive = (record: RankEntry): number => {
  if (!hasNumber(record.TimeAlive) || !hasNumber(record.Matches) || record.Matches <= 0) {
    return 0;
  }
  return record.TimeAlive / record.Matches;
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
    avgTimeAlive: 0,
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
    if (getAverageTimeAlive(record) > maxima.avgTimeAlive) maxima.avgTimeAlive = getAverageTimeAlive(record);
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

const metricTips = {
  matches: { label: '场次', tip: '本场活动该玩家实际参与的局数' },
  kills: { label: '击杀', tip: '活动期间总击杀数' },
  deaths: { label: '死亡', tip: '活动期间总死亡次数（deathType ≠ alive）' },
  assists: { label: '助攻', tip: '活动期间总助攻数' },
  dbnos: { label: '击倒', tip: '活动期间总击倒数（DBNO）' },
  revives: { label: '扶起', tip: '活动期间总扶起队友次数' },
  headshots: { label: '爆头', tip: '活动期间总爆头击杀数' },
  top10: { label: '前十次数', tip: '活动期间进入前十的场次数' },
  kda: { label: 'K/D', tip: '击杀数 ÷ 死亡数，衡量对枪正向收益' },
  kpg: { label: 'KPG', tip: '击杀数 ÷ 参与场次，场均击杀效率' },
  avgDamage: { label: '场均伤害', tip: '总造成伤害 ÷ 参与场次（ADR）' },
  avgDamageTaken: { label: '场均承伤', tip: '承受伤害 ÷ 参与场次，反映被攻击压力，来自遥测数据' },
  tradeRatio: { label: '换血比', tip: '造成伤害 ÷ 承受伤害，≥1 表示对枪不亏，来自遥测数据' },
  hitEfficiency: { label: '命中效', tip: '伤害产出 ÷ 开火次数，衡量每次开火收益，来自遥测数据' },
  avgTimeAlive: { label: '平均生存时长', tip: '总生存时长 ÷ 参与场次，反映单局平均存活时间' },
  timeAlive: { label: '总生存时长', tip: '活动期间所有参与场次的生存时间总和' },
  totalDamage: { label: '总伤害', tip: '活动期间累计造成的总伤害' },
  totalDamageTaken: { label: '总承伤', tip: '活动期间累计承受的总伤害' },
  combatScore: { label: '战斗评分', tip: '基于 ADR、KPG、K/D、DBNO 和爆头表现计算的战斗分' },
  efficiencyScore: { label: '效率评分', tip: '基于换血比、命中效、ADR 和 K/D 计算的效率分' },
  survivalScore: { label: '生存评分', tip: '基于生存时间、前十率和死亡率反向计算的生存分' },
  teamScore: { label: '团队评分', tip: '基于助攻、拉人、伤害和击倒等团队贡献计算的团队分' },
  eventMatches: { label: '活动总场次', tip: '本次活动被判定为有效样本的总局数' },
} satisfies Record<string, MetricDef>;

export default function CompactRankingTable({ rankings, size = 'small' }: CompactRankingTableProps) {
  const maxima = buildMaxima(rankings);

  const renderMetricLabel = ({ label, tip }: MetricDef, fontSize: number) => (
    <Tooltip title={tip}>
      <span style={{ fontSize, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'help' }}>
        {label}
        <InfoCircleOutlined style={{ fontSize: 10, opacity: 0.45 }} />
      </span>
    </Tooltip>
  );

  const renderCoreMetric = (metric: MetricDef, value: string, highlighted = false) => (
    <span key={metric.label} style={metricCardStyle(highlighted)}>
      {renderMetricLabel(metric, 11)}
      <span style={{ fontSize: 14, fontWeight: highlighted ? 700 : 600, color: highlighted ? '#f0a500' : 'inherit' }}>{value}</span>
    </span>
  );

  const renderDetailMetric = (metric: MetricDef, value: string, highlighted = false) => (
    <div key={metric.label} style={detailCardStyle(highlighted)}>
      <div style={{ marginBottom: 4 }}>{renderMetricLabel(metric, 12)}</div>
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
          title: titleWithTip('核心指标', '默认只展示参与场次、击杀、K/D、KPG 和场均伤害，点击行可展开查看其余指标'),
          key: 'coreMetrics',
          render: (_: unknown, record: RankEntry) => (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {renderCoreMetric(metricTips.matches, formatCount(record.Matches))}
              {renderCoreMetric(metricTips.kills, formatCount(record.Kills), record.Kills === maxima.kills && record.Kills > 0)}
              {renderCoreMetric(metricTips.kda, formatFixed(record.KDA, 2), (record.KDA || 0) === maxima.kda && (record.KDA || 0) > 0)}
              {renderCoreMetric(metricTips.kpg, formatFixed(record.KPG, 2), (record.KPG || 0) === maxima.kpg && (record.KPG || 0) > 0)}
              {renderCoreMetric(metricTips.avgDamage, formatFixed(record.AvgDamage, 0), record.AvgDamage === maxima.avgDamage && record.AvgDamage > 0)}
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
              {renderDetailMetric(metricTips.deaths, formatCount(record.Deaths), record.Deaths === maxima.deaths && record.Deaths > 0)}
              {renderDetailMetric(metricTips.assists, formatCount(record.Assists), record.Assists === maxima.assists && record.Assists > 0)}
              {renderDetailMetric(metricTips.dbnos, formatCount(record.DBNOs))}
              {renderDetailMetric(metricTips.revives, formatCount(record.Revives))}
              {renderDetailMetric(metricTips.headshots, formatCount(record.HeadshotKills))}
              {renderDetailMetric(metricTips.top10, formatCount(record.Top10Count))}
              {renderDetailMetric(metricTips.avgDamageTaken, formatFixed(record.AvgDamageTaken, 0), (record.AvgDamageTaken || 0) === maxima.avgDamageTaken && (record.AvgDamageTaken || 0) > 0)}
              {renderDetailMetric(metricTips.tradeRatio, formatFixed(record.TradeRatio, 2), (record.TradeRatio || 0) === maxima.tradeRatio && (record.TradeRatio || 0) > 0)}
              {renderDetailMetric(metricTips.hitEfficiency, formatFixed(record.HitEfficiency, 2), (record.HitEfficiency || 0) === maxima.hitEfficiency && (record.HitEfficiency || 0) > 0)}
              {renderDetailMetric(metricTips.avgTimeAlive, formatDuration(getAverageTimeAlive(record)), getAverageTimeAlive(record) === maxima.avgTimeAlive && getAverageTimeAlive(record) > 0)}
              {renderDetailMetric(metricTips.timeAlive, formatDuration(record.TimeAlive), (record.TimeAlive || 0) === maxima.timeAlive && (record.TimeAlive || 0) > 0)}
              {renderDetailMetric(metricTips.totalDamage, formatFixed(record.TotalDamage, 0))}
              {renderDetailMetric(metricTips.totalDamageTaken, formatFixed(record.DamageTaken, 0))}
              {renderDetailMetric(metricTips.combatScore, formatFixed(record.CombatScore, 1))}
              {renderDetailMetric(metricTips.efficiencyScore, formatFixed(record.EfficiencyScore, 1))}
              {renderDetailMetric(metricTips.survivalScore, formatFixed(record.SurvivalScore, 1))}
              {renderDetailMetric(metricTips.teamScore, formatFixed(record.TeamScore, 1))}
              {renderDetailMetric(metricTips.eventMatches, formatCount(record.EventMatches))}
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