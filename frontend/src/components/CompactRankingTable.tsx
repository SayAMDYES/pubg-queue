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

// getSurvivalText 结合被击倒次数和平均生存时间，给出生存风险定性。
const getSurvivalText = (record: RankEntry, rankings: RankEntry[]): string => {
  const avgDowns = teamAverage(rankings, getDowns);
  const avgAlive = teamAverage(rankings, getAverageTimeAlive);
  if (getDowns(record) > avgDowns * 1.3 && getDowns(record) > 0) return '风险偏高';
  if (getAverageTimeAlive(record) >= avgAlive * 1.1 && avgAlive > 0) return '稳定';
  if ((record.KPG || 0) >= teamAverage(rankings, (item) => item.KPG || 0) * 1.25 && getDowns(record) >= avgDowns) return '偏冒险';
  return '正常';
};

const metricTips = {
  dbnos: { label: '击倒', tip: '活动期间总击倒数（DBNO）' },
  kpg: { label: 'KPG', tip: '击杀数 ÷ 参与场次，场均击杀效率' },
  knockConversionRate: { label: '击倒转化', tip: '击杀数 ÷ 击倒数，衡量补枪和收割转化' },
  revives: { label: '扶起', tip: '活动期间总扶起队友次数' },
  assists: { label: '助攻', tip: '活动期间总助攻数' },
  rescueRate: { label: '救援率', tip: '扶起数 ÷ 被击倒次数，衡量倒地后的复位贡献' },
  teamScore: { label: '团队评分', tip: '基于助攻、拉人、击倒协同和击倒转化计算的团队分' },
  downs: { label: '被击倒', tip: '优先使用后端被击倒字段；缺失时用死亡和承伤压力估算' },
  deaths: { label: '死亡', tip: '活动期间总死亡次数（deathType ≠ alive）' },
  avgDamageTaken: { label: '场均承伤', tip: '承受伤害 ÷ 参与场次，反映被攻击压力，来自遥测数据' },
  tradeRatio: { label: '换血比', tip: '造成伤害 ÷ 承受伤害，≥1 表示对枪不亏，来自遥测数据' },
  hitEfficiency: { label: '命中效', tip: '伤害产出 ÷ 开火次数，衡量每次开火收益，来自遥测数据' },
  avgTimeAlive: { label: '平均生存', tip: '总生存时长 ÷ 参与场次，反映单局平均存活时间' },
  survival: { label: '生存稳定性', tip: '结合被击倒次数和平均生存时间判断风险状态' },
} satisfies Record<string, MetricDef>;

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

// 折叠态主指标行：无边框纯文本，四个最具代表性的指标用分隔符串联。
const sepStyle = { margin: '0 7px', color: 'var(--text-dim)' };

// renderStrengthSection 渲染六维能力雷达；维度分值以紧凑标签内联展示，不再用边框卡片。
const renderStrengthSection = (record: RankEntry): ReactNode => {
  const dims = STRENGTH_DIMENSIONS.map((d) => ({ ...d, value: record[d.key] || 0 }));
  if (!dims.some((d) => d.value > 0)) return null;
  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', alignItems: 'center' }}>
      <StrengthRadar
        firepower={record.DimFirepower || 0}
        lethality={record.DimLethality || 0}
        aggression={record.DimAggression || 0}
        survival={record.DimSurvival || 0}
        operating={record.DimOperating || 0}
        teamwork={record.DimTeamwork || 0}
        name={record.GameName}
        size={220}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
        {dims.map((d) => (
          <Tooltip key={d.key} title={d.tip}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'help', fontVariantNumeric: 'tabular-nums' }}>
              {d.label}
              <span style={{ marginLeft: 6, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{d.value.toFixed(0)}</span>
            </span>
          </Tooltip>
        ))}
      </div>
    </div>
  );
};

// renderStat 是展开态里的一行进阶指标：label 可悬浮看释义（去掉逐格图标），右侧对齐数值。
const renderStat = (metric: MetricDef, value: string, risk = false): ReactNode => (
  <div
    key={metric.label}
    style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderBottom: '1px solid rgba(148,163,184,0.08)' }}
  >
    <Tooltip title={metric.tip}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'help' }}>{metric.label}</span>
    </Tooltip>
    <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: risk ? 'var(--danger)' : 'var(--text)' }}>{value}</span>
  </div>
);

const renderAdvGroup = (title: string, rows: ReactNode[]): ReactNode => (
  <div>
    <div className="section-label" style={{ marginBottom: 6 }}>{title}</div>
    <div>{rows}</div>
  </div>
);

export default function CompactRankingTable({ rankings, size = 'small' }: CompactRankingTableProps) {
  const maxScore = rankings.reduce((max, record) => Math.max(max, record.Score || 0), 0);

  return (
    <Table
      dataSource={rankings}
      pagination={false}
      size={size}
      rowKey="RankNo"
      scroll={{ x: 480 }}
      columns={[
        {
          title: '排名',
          dataIndex: 'RankNo',
          key: 'rankNo',
          width: 64,
          render: (value: number) => (
            <span
              className="rank-badge"
              style={{
                background: value === 1 ? 'var(--primary)' : 'var(--surface-3)',
                color: value === 1 ? '#0f172a' : 'var(--text-muted)',
                border: value === 1 ? 'none' : '1px solid var(--border)',
                boxShadow: value === 1 ? '0 0 14px var(--primary-glow)' : 'none',
              }}
            >
              #{value}
            </span>
          ),
        },
        {
          title: '选手',
          key: 'player',
          render: (_: unknown, record: RankEntry) => (
            <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', overflowWrap: 'anywhere' }}>{record.GameName || '-'}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {formatCount(record.Kills)} 杀<span style={sepStyle}>·</span>
                K/D {formatFixed(record.KDA, 2)}<span style={sepStyle}>·</span>
                {formatFixed(record.AvgDamage, 0)} ADR<span style={sepStyle}>·</span>
                {formatFixed(getTotalDamage(record), 0)} 伤
              </span>
            </div>
          ),
        },
        {
          title: titleWithTip('评分', '综合火力、精准、对抗、生存、运营、团队六维的加权得分（生存/运营按输出参与度设门槛）'),
          dataIndex: 'Score',
          key: 'score',
          width: 92,
          align: 'right',
          render: (value: number) => {
            const leader = (value || 0) === maxScore && (value || 0) > 0;
            return (
              <span
                style={{
                  fontFamily: 'var(--heading-font)',
                  fontSize: leader ? 24 : 20,
                  color: leader ? 'var(--primary)' : 'var(--text)',
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: leader ? '0 0 18px var(--primary-glow)' : 'none',
                }}
              >
                {formatFixed(value, 1)}
              </span>
            );
          },
        },
      ]}
      expandable={{
        expandRowByClick: true,
        expandedRowRender: (record) => (
          <div style={{ display: 'grid', gap: 16, padding: '4px 4px 8px' }}>
            {renderStrengthSection(record)}
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              {renderAdvGroup('输出', [
                renderStat(metricTips.dbnos, formatCount(record.DBNOs)),
                renderStat(metricTips.kpg, formatFixed(record.KPG, 2)),
                renderStat(metricTips.knockConversionRate, formatPercent(getKnockConversionRate(record))),
              ])}
              {renderAdvGroup('协作', [
                renderStat(metricTips.revives, formatCount(record.Revives)),
                renderStat(metricTips.assists, formatCount(record.Assists)),
                renderStat(metricTips.rescueRate, formatPercent(getRescueRate(record))),
                renderStat(metricTips.teamScore, formatFixed(record.TeamScore, 1)),
              ])}
              {renderAdvGroup('生存 · 风险', [
                renderStat(metricTips.downs, formatCount(getDowns(record)), true),
                renderStat(metricTips.deaths, formatCount(record.Deaths), true),
                renderStat(metricTips.avgDamageTaken, formatFixed(record.AvgDamageTaken, 0)),
                renderStat(metricTips.tradeRatio, formatFixed(record.TradeRatio, 2)),
                renderStat(metricTips.hitEfficiency, formatFixed(record.HitEfficiency, 2)),
                renderStat(metricTips.avgTimeAlive, formatDuration(getAverageTimeAlive(record))),
                renderStat(metricTips.survival, getSurvivalText(record, rankings)),
              ])}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 10, fontVariantNumeric: 'tabular-nums' }}>
              <span>场次 {formatCount(record.Matches)}</span>
              <span>爆头 {formatCount(record.HeadshotKills)}</span>
              <span>前十 {formatCount(record.Top10Count)}</span>
              <span>数据 {(record.AnalysisVersion || 'v1').toUpperCase()}</span>
              {record.Confidence && (
                <Tag color={confidenceColor[record.Confidence] || 'default'} style={{ margin: 0 }}>
                  置信度 {confidenceLabel[record.Confidence] || record.Confidence}
                </Tag>
              )}
              {record.AnalysisStatus && (
                <span>{analysisStatusLabel[record.AnalysisStatus] || record.AnalysisStatus}</span>
              )}
            </div>
          </div>
        ),
      }}
    />
  );
}
