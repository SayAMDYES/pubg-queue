import { InfoCircleOutlined } from '@ant-design/icons';
import { Table, Tag, Tooltip } from 'antd';
import type { ReactNode } from 'react';
import type { RankEntry } from '../api';

import StrengthRadar from './StrengthRadar';
import { analysisStatusLabel, confidenceColor, confidenceLabel } from '../rankingTags';

type CompactRankingTableProps = {
  rankings: RankEntry[];
  size?: 'small' | 'middle' | 'large';
};

type RankingMaxima = {
  kills: number;
  deaths: number;
  assists: number;
  dbnos: number;
  revives: number;
  downs: number;
  totalDamage: number;
  kda: number;
  kpg: number;
  avgDamage: number;
  avgDamageTaken: number;
  avgTimeAlive: number;
  tradeRatio: number;
  hitEfficiency: number;
  timeAlive: number;
  score: number;
  rescueRate: number;
  knockConversionRate: number;
  combatScore: number;
  efficiencyScore: number;
  survivalScore: number;
  teamScore: number;
  eventMatches: number;
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

const formatPercent = (value: number | null | undefined): string => (
  hasNumber(value) ? `${(value * 100).toFixed(0)}%` : '-'
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

const getTotalDamage = (record: RankEntry): number => {
  if (hasNumber(record.TotalDamage) && record.TotalDamage > 0) return record.TotalDamage;
  if (hasNumber(record.TelemetryDamage) && record.TelemetryDamage > 0) return record.TelemetryDamage;
  return (record.AvgDamage || 0) * (record.Matches || 0);
};

const getDowns = (record: RankEntry): number => {
  const extended = record as RankEntry & { Downs?: number; downs?: number };
  if (hasNumber(extended.Downs)) return extended.Downs;
  if (hasNumber(extended.downs)) return extended.downs;
  const damagePressure = hasNumber(record.DamageTaken) && record.DamageTaken > 0 ? Math.round(record.DamageTaken / 280) : 0;
  return Math.max(record.Deaths || 0, damagePressure);
};

const getKnockConversionRate = (record: RankEntry): number | null => (
  record.DBNOs > 0 ? record.Kills / record.DBNOs : null
);

const getRescueRate = (record: RankEntry): number | null => {
  const downs = getDowns(record);
  return downs > 0 ? (record.Revives || 0) / downs : null;
};

const teamAverage = (rankings: RankEntry[], getValue: (record: RankEntry) => number): number => {
  const active = rankings.filter((record) => record.Matches > 0);
  const source = active.length > 0 ? active : rankings;
  if (source.length === 0) return 0;
  return source.reduce((sum, record) => sum + getValue(record), 0) / source.length;
};

const buildMaxima = (rankings: RankEntry[]): RankingMaxima => {
  const maxima: RankingMaxima = {
    kills: 0,
    deaths: 0,
    assists: 0,
    dbnos: 0,
    revives: 0,
    downs: 0,
    totalDamage: 0,
    kda: 0,
    kpg: 0,
    avgDamage: 0,
    avgDamageTaken: 0,
    avgTimeAlive: 0,
    tradeRatio: 0,
    hitEfficiency: 0,
    timeAlive: 0,
    score: 0,
    rescueRate: 0,
    knockConversionRate: 0,
    combatScore: 0,
    efficiencyScore: 0,
    survivalScore: 0,
    teamScore: 0,
    eventMatches: 0,
  };

  for (const record of rankings) {
    if (record.Kills > maxima.kills) maxima.kills = record.Kills;
    if (record.Deaths > maxima.deaths) maxima.deaths = record.Deaths;
    if (record.Assists > maxima.assists) maxima.assists = record.Assists;
    if ((record.DBNOs || 0) > maxima.dbnos) maxima.dbnos = record.DBNOs || 0;
    if ((record.Revives || 0) > maxima.revives) maxima.revives = record.Revives || 0;
    if (getDowns(record) > maxima.downs) maxima.downs = getDowns(record);
    if (getTotalDamage(record) > maxima.totalDamage) maxima.totalDamage = getTotalDamage(record);
    if ((record.KDA || 0) > maxima.kda) maxima.kda = record.KDA || 0;
    if ((record.KPG || 0) > maxima.kpg) maxima.kpg = record.KPG || 0;
    if (record.AvgDamage > maxima.avgDamage) maxima.avgDamage = record.AvgDamage;
    if ((record.AvgDamageTaken || 0) > maxima.avgDamageTaken) maxima.avgDamageTaken = record.AvgDamageTaken || 0;
    if (getAverageTimeAlive(record) > maxima.avgTimeAlive) maxima.avgTimeAlive = getAverageTimeAlive(record);
    if ((record.TradeRatio || 0) > maxima.tradeRatio) maxima.tradeRatio = record.TradeRatio || 0;
    if ((record.HitEfficiency || 0) > maxima.hitEfficiency) maxima.hitEfficiency = record.HitEfficiency || 0;
    if ((record.TimeAlive || 0) > maxima.timeAlive) maxima.timeAlive = record.TimeAlive || 0;
    if ((record.Score || 0) > maxima.score) maxima.score = record.Score || 0;
    const rescueRate = getRescueRate(record);
    const knockConversionRate = getKnockConversionRate(record);
    if (rescueRate !== null && rescueRate > maxima.rescueRate) maxima.rescueRate = rescueRate;
    if (knockConversionRate !== null && knockConversionRate > maxima.knockConversionRate) maxima.knockConversionRate = knockConversionRate;

    if ((record.CombatScore || 0) > maxima.combatScore) maxima.combatScore = record.CombatScore || 0;
    if ((record.EfficiencyScore || 0) > maxima.efficiencyScore) maxima.efficiencyScore = record.EfficiencyScore || 0;
    if ((record.SurvivalScore || 0) > maxima.survivalScore) maxima.survivalScore = record.SurvivalScore || 0;
    if ((record.TeamScore || 0) > maxima.teamScore) maxima.teamScore = record.TeamScore || 0;
    if ((record.EventMatches || 0) > maxima.eventMatches) maxima.eventMatches = record.EventMatches || 0;
  }

  return maxima;
};

const getSurvivalText = (record: RankEntry, rankings: RankEntry[]): string => {
  const avgDowns = teamAverage(rankings, getDowns);
  const avgAlive = teamAverage(rankings, getAverageTimeAlive);
  if (getDowns(record) > avgDowns * 1.3 && getDowns(record) > 0) return '风险偏高';
  if (getAverageTimeAlive(record) >= avgAlive * 1.1 && avgAlive > 0) return '稳定';
  if ((record.KPG || 0) >= teamAverage(rankings, (item) => item.KPG || 0) * 1.25 && getDowns(record) >= avgDowns) return '偏冒险';
  return '正常';
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
  downs: { label: '被击倒', tip: '优先使用后端被击倒字段；缺失时用死亡和承伤压力估算' },
  revives: { label: '扶起', tip: '活动期间总扶起队友次数' },
  rescueRate: { label: '救援率', tip: '扶起数 ÷ 被击倒次数，衡量倒地后的复位贡献' },
  knockConversionRate: { label: '击倒转化', tip: '击杀数 ÷ 击倒数，衡量补枪和收割转化' },
  survival: { label: '生存稳定性', tip: '结合被击倒次数和平均生存时间判断风险状态' },
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
  combatScore: { label: '战斗评分', tip: '基于 K/D、ADR、KPG、击倒和爆头表现计算的战斗分' },
  efficiencyScore: { label: '承压评分', tip: '基于有效承伤、换血比、命中效和前排参与计算的对抗承压分' },
  survivalScore: { label: '生存评分', tip: '基于生存时间、前十率和死亡率反向计算，并按输出参与度修正' },
  teamScore: { label: '团队评分', tip: '基于助攻、拉人、击倒协同和击倒转化计算的团队分' },
  eventMatches: { label: '活动总场次', tip: '本次活动被判定为有效样本的总局数' },
} satisfies Record<string, MetricDef>;

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

const renderDetailSection = (title: string, items: ReactNode[]) => (
  <div style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 14, border: '1px solid rgba(148,163,184,0.16)', background: 'rgba(15,23,42,0.28)' }}>
    <div style={{ fontFamily: 'var(--heading-font)', fontSize: 11, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{title}</div>
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
      {items}
    </div>
  </div>
);

const STRENGTH_DIMENSIONS: {
  key: 'DimFirepower' | 'DimLethality' | 'DimAggression' | 'DimSurvival' | 'DimOperating' | 'DimTeamwork';
  label: string;
  tip: string;
}[] = [
  { key: 'DimFirepower', label: '火力', tip: '输出体量：场均伤害与场均击杀' },
  { key: 'DimLethality', label: '精准', tip: '输出质量：K/D、命中效、爆头率、击倒转化' },
  { key: 'DimAggression', label: '对抗', tip: '前压与换血：承伤、换血比、开火量、击倒（部分依赖遥测）' },
  { key: 'DimSurvival', label: '生存', tip: '存活时长与早死控制' },
  { key: 'DimOperating', label: '运营', tip: '进圈率与最终排名表现' },
  { key: 'DimTeamwork', label: '团队', tip: '助攻与救援贡献' },
];

// renderStrengthSection 渲染六维能力雷达和各维度分值；老数据（无维度分）时不展示。
const renderStrengthSection = (record: RankEntry): ReactNode => {
  const dims = STRENGTH_DIMENSIONS.map((d) => ({ ...d, value: record[d.key] || 0 }));
  if (!dims.some((d) => d.value > 0)) return null;
  return (
    <div style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 14, border: '1px solid rgba(148,163,184,0.16)', background: 'rgba(15,23,42,0.28)' }}>
      <div style={{ fontFamily: 'var(--heading-font)', fontSize: 11, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>个人能力雷达 · 六维</div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 280px) minmax(0, 1fr)', alignItems: 'center' }}>
        <StrengthRadar
          firepower={record.DimFirepower || 0}
          lethality={record.DimLethality || 0}
          aggression={record.DimAggression || 0}
          survival={record.DimSurvival || 0}
          operating={record.DimOperating || 0}
          teamwork={record.DimTeamwork || 0}
          name={record.GameName}
        />
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))' }}>
          {dims.map((d) => (
            <Tooltip key={d.key} title={d.tip}>
              <div style={detailCardStyle(false)}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.label}</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{d.value.toFixed(1)}</div>
              </div>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function CompactRankingTable({ rankings, size = 'small' }: CompactRankingTableProps) {
  const maxima = buildMaxima(rankings);

  return (
    <Table
      dataSource={rankings}
      pagination={false}
      size={size}
      rowKey="RankNo"
      scroll={{ x: 600 }}
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
          render: (_: unknown, record: RankEntry) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>{record.GameName || '-'}</span>
              <Tag color={record.AnalysisVersion === 'v4' ? 'geekblue' : 'default'}>{(record.AnalysisVersion || 'v1').toUpperCase()}</Tag>
            </div>
          ),
        },
        {
          title: titleWithTip('核心指标', '默认展示击杀、K/D、场均伤害、击倒、总伤害、扶起和被击倒；点击行可展开查看输出、协作和风险详情'),
          key: 'coreMetrics',
          render: (_: unknown, record: RankEntry) => (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {renderCoreMetric(metricTips.kills, formatCount(record.Kills), record.Kills === maxima.kills && record.Kills > 0)}
              {renderCoreMetric(metricTips.kda, formatFixed(record.KDA, 2), (record.KDA || 0) === maxima.kda && (record.KDA || 0) > 0)}
              {renderCoreMetric(metricTips.avgDamage, formatFixed(record.AvgDamage, 0), (record.AvgDamage || 0) === maxima.avgDamage && (record.AvgDamage || 0) > 0)}
              {renderCoreMetric(metricTips.dbnos, formatCount(record.DBNOs), (record.DBNOs || 0) === maxima.dbnos && (record.DBNOs || 0) > 0)}
              {renderCoreMetric(metricTips.totalDamage, formatFixed(getTotalDamage(record), 0), getTotalDamage(record) === maxima.totalDamage && getTotalDamage(record) > 0)}
              {renderCoreMetric(metricTips.revives, formatCount(record.Revives), (record.Revives || 0) === maxima.revives && (record.Revives || 0) > 0)}
              {renderCoreMetric(metricTips.downs, formatCount(getDowns(record)), getDowns(record) === maxima.downs && getDowns(record) > 0)}
            </div>
          ),
        },
        {
          title: titleWithTip('评分', '综合火力、精准、对抗、生存、运营、团队六维的加权得分（生存/运营按输出参与度设门槛）'),
          dataIndex: 'Score',
          key: 'score',
          width: 96,
          render: (value: number) => {
            const highlighted = (value || 0) === maxima.score && (value || 0) > 0;
            return (
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontWeight: highlighted ? 700 : 600, fontSize: 18, color: highlighted ? '#f0a500' : 'inherit' }}>
                  {formatFixed(value, 1)}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'normal' }}>综合评分</span>
              </div>
            );
          },
        },
      ]}
      expandable={{
        expandRowByClick: true,
        expandedRowRender: (record) => (
          <div style={{ display: 'grid', gap: 12, padding: '8px 4px' }}>
            {renderStrengthSection(record)}
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              {renderDetailSection('输出', [
                renderDetailMetric(metricTips.kills, formatCount(record.Kills), record.Kills === maxima.kills && record.Kills > 0),
                renderDetailMetric(metricTips.dbnos, formatCount(record.DBNOs), (record.DBNOs || 0) === maxima.dbnos && (record.DBNOs || 0) > 0),
                renderDetailMetric(metricTips.totalDamage, formatFixed(getTotalDamage(record), 0), getTotalDamage(record) === maxima.totalDamage && getTotalDamage(record) > 0),
                renderDetailMetric(metricTips.avgDamage, formatFixed(record.AvgDamage, 0), (record.AvgDamage || 0) === maxima.avgDamage && (record.AvgDamage || 0) > 0),
                renderDetailMetric(metricTips.kda, formatFixed(record.KDA, 2), (record.KDA || 0) === maxima.kda && (record.KDA || 0) > 0),
                renderDetailMetric(metricTips.kpg, formatFixed(record.KPG, 2), (record.KPG || 0) === maxima.kpg && (record.KPG || 0) > 0),
                renderDetailMetric(metricTips.knockConversionRate, formatPercent(getKnockConversionRate(record)), getKnockConversionRate(record) === maxima.knockConversionRate && getKnockConversionRate(record) !== null),
              ])}
              {renderDetailSection('协作', [
                renderDetailMetric(metricTips.revives, formatCount(record.Revives), (record.Revives || 0) === maxima.revives && (record.Revives || 0) > 0),
                renderDetailMetric(metricTips.assists, formatCount(record.Assists), record.Assists === maxima.assists && record.Assists > 0),
                renderDetailMetric(metricTips.rescueRate, formatPercent(getRescueRate(record)), getRescueRate(record) === maxima.rescueRate && getRescueRate(record) !== null),
                renderDetailMetric(metricTips.teamScore, formatFixed(record.TeamScore, 1), (record.TeamScore || 0) === maxima.teamScore && (record.TeamScore || 0) > 0),
              ])}
              {renderDetailSection('风险', [
                renderDetailMetric(metricTips.downs, formatCount(getDowns(record)), getDowns(record) === maxima.downs && getDowns(record) > 0),
                renderDetailMetric(metricTips.deaths, formatCount(record.Deaths), record.Deaths === maxima.deaths && record.Deaths > 0),
                renderDetailMetric(metricTips.avgDamageTaken, formatFixed(record.AvgDamageTaken, 0), (record.AvgDamageTaken || 0) === maxima.avgDamageTaken && (record.AvgDamageTaken || 0) > 0),
                renderDetailMetric(metricTips.survival, getSurvivalText(record, rankings)),
                renderDetailMetric(metricTips.avgTimeAlive, formatDuration(getAverageTimeAlive(record)), getAverageTimeAlive(record) === maxima.avgTimeAlive && getAverageTimeAlive(record) > 0),
              ])}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {renderDetailMetric(metricTips.matches, formatCount(record.Matches))}
              {renderDetailMetric(metricTips.headshots, formatCount(record.HeadshotKills))}
              {renderDetailMetric(metricTips.top10, formatCount(record.Top10Count))}
              {renderDetailMetric(metricTips.tradeRatio, formatFixed(record.TradeRatio, 2), (record.TradeRatio || 0) === maxima.tradeRatio && (record.TradeRatio || 0) > 0)}
              {renderDetailMetric(metricTips.hitEfficiency, formatFixed(record.HitEfficiency, 2), (record.HitEfficiency || 0) === maxima.hitEfficiency && (record.HitEfficiency || 0) > 0)}
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

          </div>
        ),
      }}
    />
  );
}
