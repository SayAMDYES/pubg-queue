import { useState } from 'react';
import type { RankEntry } from '../api';

type TeamPerformanceOverviewProps = {
  rankings: RankEntry[];
};

type MetricTone = 'gold' | 'orange' | 'blue' | 'green' | 'red' | 'muted';

type PlayerTeamStats = {
  name: string;
  kills: number;
  knocks: number;
  deaths: number;
  downs: number;
  revives: number;
  assists: number;
  damage: number;
  kd: number;
  kpg: number;
  score: number;
  rescueRate: number | null;
  knockConversionRate: number | null;
};

type TeamStats = {
  players: PlayerTeamStats[];
  totalScore: number;
  totalDamage: number;
  totalKills: number;
  totalKnocks: number;
  totalRevives: number;
  totalDowns: number;
  totalAssists: number;
  avgDamage: number;
  avgKd: number;
  teamMatches: number;
  rescueRate: number | null;
  knockConversionRate: number | null;
  bestRescuer: PlayerTeamStats | null;
  mostDowned: PlayerTeamStats | null;
};

const toneColor: Record<MetricTone, string> = {
  gold: '#f0a500',
  orange: '#f97316',
  blue: '#38bdf8',
  green: '#22c55e',
  red: '#d96b6b',
  muted: 'var(--text-muted)',
};

const contributionTabs = [
  { key: 'damage', label: '伤害', valueLabel: '伤害', tone: 'gold' as MetricTone },
  { key: 'knocks', label: '击倒', valueLabel: '击倒', tone: 'orange' as MetricTone },
  { key: 'revives', label: '扶起', valueLabel: '扶起', tone: 'green' as MetricTone },
  { key: 'downs', label: '被击倒', valueLabel: '被击倒', tone: 'red' as MetricTone },
];

const hasNumber = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

const safeNumber = (value: number | null | undefined): number => (hasNumber(value) ? value : 0);

const formatNumber = (value: number, digits = 0): string => value.toFixed(digits);

const formatPercent = (value: number | null, digits = 0): string => (
  hasNumber(value) ? `${(value * 100).toFixed(digits)}%` : '-'
);

const ratio = (value: number, total: number): number => (total > 0 ? value / total : 0);

const resolveDamage = (record: RankEntry): number => {
  const total = safeNumber(record.TotalDamage) || safeNumber(record.TelemetryDamage);
  if (total > 0) return total;
  return safeNumber(record.AvgDamage) * safeNumber(record.Matches);
};

const resolveDowns = (record: RankEntry): number => {
  const extended = record as RankEntry & { Downs?: number; downs?: number };
  if (hasNumber(extended.Downs)) return extended.Downs;
  if (hasNumber(extended.downs)) return extended.downs;
  const damagePressure = safeNumber(record.DamageTaken) > 0 ? Math.round(safeNumber(record.DamageTaken) / 280) : 0;
  return Math.max(safeNumber(record.Deaths), damagePressure);
};

const pickMax = <T,>(items: T[], getValue: (item: T) => number): T | null => {
  if (items.length === 0) return null;
  return items.reduce((best, item) => (getValue(item) > getValue(best) ? item : best), items[0]);
};

export function buildTeamStats(rankings: RankEntry[]): TeamStats {
  const activeRecords = rankings.filter((record) => safeNumber(record.Matches) > 0);
  const source = activeRecords.length > 0 ? activeRecords : rankings;
  const players = source.map((record) => {
    const kills = safeNumber(record.Kills);
    const knocks = safeNumber(record.DBNOs);
    const downs = resolveDowns(record);
    const revives = safeNumber(record.Revives);
    return {
      name: record.GameName || '-',
      kills,
      knocks,
      deaths: safeNumber(record.Deaths),
      downs,
      revives,
      assists: safeNumber(record.Assists),
      damage: resolveDamage(record),
      kd: safeNumber(record.KDA),
      kpg: safeNumber(record.KPG),
      score: safeNumber(record.Score),
      rescueRate: downs > 0 ? revives / downs : null,
      knockConversionRate: knocks > 0 ? kills / knocks : null,
    };
  });

  const total = (getValue: (player: PlayerTeamStats) => number) => players.reduce((sum, player) => sum + getValue(player), 0);
  const average = (getValue: (player: PlayerTeamStats) => number) => (players.length > 0 ? total(getValue) / players.length : 0);
  const totalScore = total((player) => player.score);
  const totalDamage = total((player) => player.damage);
  const totalKills = total((player) => player.kills);
  const totalKnocks = total((player) => player.knocks);
  const totalRevives = total((player) => player.revives);
  const totalDowns = total((player) => player.downs);
  const totalAssists = total((player) => player.assists);
  const teamMatches = Math.max(...source.map((record) => safeNumber(record.EventMatches) || safeNumber(record.Matches)), 0);
  const rescueRate = totalDowns > 0 ? totalRevives / totalDowns : null;
  const knockConversionRate = totalKnocks > 0 ? totalKills / totalKnocks : null;
  const bestRescuer = pickMax(players, (player) => player.revives);
  const mostDowned = pickMax(players, (player) => player.downs);

  return {
    players,
    totalScore,
    totalDamage,
    totalKills,
    totalKnocks,
    totalRevives,
    totalDowns,
    totalAssists,
    avgDamage: average((player) => player.damage),
    avgKd: average((player) => player.kd),
    teamMatches,
    rescueRate,
    knockConversionRate,
    bestRescuer: bestRescuer && bestRescuer.revives > 0 ? bestRescuer : null,
    mostDowned: mostDowned && mostDowned.downs > 0 ? mostDowned : null,
  };
}

function MiniMetric({ label, value, tone = 'muted' }: { label: string; value: string; tone?: MetricTone }) {
  return (
    <div style={{ minWidth: 0, padding: '8px 10px', border: '1px solid rgba(148,163,184,0.14)', borderRadius: 10, background: 'rgba(15, 23, 42, 0.34)' }}>
      <div style={{ fontFamily: 'var(--heading-font)', fontSize: 16, lineHeight: 1.1, color: toneColor[tone], fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

export function TeamHeaderSummary({ rankings }: TeamPerformanceOverviewProps) {
  if (rankings.length === 0) return null;
  const stats = buildTeamStats(rankings);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8, width: '100%' }}>
      <MiniMetric label="队伍评分" value={formatNumber(stats.totalScore, 1)} tone="gold" />
      <MiniMetric label="总伤害" value={formatNumber(stats.totalDamage, 0)} tone="gold" />
      <MiniMetric label="总击杀" value={String(stats.totalKills)} tone="orange" />
      <MiniMetric label="总击倒" value={String(stats.totalKnocks)} tone="orange" />
      <MiniMetric label="总扶起" value={String(stats.totalRevives)} tone="green" />
      <MiniMetric label="救援率" value={formatPercent(stats.rescueRate)} tone="blue" />
      <MiniMetric label="击倒转化" value={formatPercent(stats.knockConversionRate)} tone="gold" />
    </div>
  );
}

function OverviewGroup({ title, metrics }: { title: string; metrics: { label: string; value: string; tone?: MetricTone }[] }) {
  return (
    <div style={{ border: '1px solid rgba(148,163,184,0.16)', borderRadius: 14, padding: 14, background: 'linear-gradient(145deg, rgba(19,19,40,0.92), rgba(8,13,28,0.92))', boxShadow: 'inset 0 0 24px rgba(56,189,248,0.025)' }}>
      <div style={{ marginBottom: 12, fontFamily: 'var(--heading-font)', fontSize: 11, letterSpacing: '0.14em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))', gap: 10 }}>
        {metrics.map((metric) => (
          <div key={`${title}-${metric.label}`} style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--heading-font)', fontSize: 20, lineHeight: 1, color: toneColor[metric.tone ?? 'muted'], fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' }}>{metric.value}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'normal' }}>{metric.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContributionRow({ player, value, total, tabKey, tone }: { player: PlayerTeamStats; value: number; total: number; tabKey: string; tone: MetricTone }) {
  const percent = ratio(value, total);
  const valueUnit = tabKey === 'damage' ? '伤害' : tabKey === 'revives' ? '次扶起' : tabKey === 'downs' ? '次' : '击倒';
  const supportLabel = tabKey === 'revives' && value === Math.max(value, 3) ? '救援核心' : '';
  const riskLabel = tabKey === 'downs' && percent >= 0.38 ? '风险偏高' : '';
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', fontSize: 12 }}>
        <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
        <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          <span style={{ color: toneColor[tone] }}>{tabKey === 'damage' ? formatNumber(value, 0) : value}</span> {valueUnit} / {formatPercent(percent)} {supportLabel || riskLabel ? <span style={{ color: tabKey === 'downs' ? '#d96b6b' : '#22c55e' }}>· {supportLabel || riskLabel}</span> : null}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 999, background: 'rgba(148,163,184,0.12)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(3, percent * 100)}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${toneColor[tone]}, rgba(255,255,255,0.35))`, opacity: tabKey === 'downs' ? 0.72 : 0.9 }} />
      </div>
    </div>
  );
}

function TeamContributionAnalysis({ stats }: { stats: TeamStats }) {
  const [activeTab, setActiveTab] = useState(contributionTabs[0].key);
  const currentTab = contributionTabs.find((tab) => tab.key === activeTab) ?? contributionTabs[0];
  const total = stats.players.reduce((sum, player) => sum + safeNumber(player[currentTab.key as keyof PlayerTeamStats] as number), 0);
  const rows = [...stats.players].sort((a, b) => safeNumber(b[currentTab.key as keyof PlayerTeamStats] as number) - safeNumber(a[currentTab.key as keyof PlayerTeamStats] as number));

  return (
    <div className="g-card" style={{ marginBottom: 16, background: 'linear-gradient(180deg, rgba(13,13,28,0.96), rgba(8,10,22,0.96))' }}>
      <div className="g-card__header">团队贡献分析</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {contributionTabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{ border: `1px solid ${active ? toneColor[tab.tone] : 'var(--border)'}`, background: active ? 'rgba(240,165,0,0.09)' : 'rgba(15,23,42,0.35)', color: active ? toneColor[tab.tone] : 'var(--text-muted)', borderRadius: 999, padding: '5px 12px', fontFamily: 'var(--body-font)', fontSize: 12, cursor: 'pointer' }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {rows.map((player) => (
          <ContributionRow
            key={`${currentTab.key}-${player.name}`}
            player={player}
            value={safeNumber(player[currentTab.key as keyof PlayerTeamStats] as number)}
            total={total}
            tabKey={currentTab.key}
            tone={currentTab.tone}
          />
        ))}
      </div>
    </div>
  );
}

export default function TeamPerformanceOverview({ rankings }: TeamPerformanceOverviewProps) {
  if (rankings.length === 0) return null;
  const stats = buildTeamStats(rankings);
  return (
    <>
      <div className="g-card g-card--accent" style={{ marginBottom: 16, background: 'linear-gradient(135deg, rgba(13,13,28,0.98), rgba(9,13,30,0.98))' }}>
        <div className="g-card__header">TEAM OVERVIEW / 队伍总览</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
          <OverviewGroup
			title="战斗输出"
            metrics={[
              { label: '队伍评分', value: formatNumber(stats.totalScore, 1), tone: 'gold' },
              { label: '总伤害', value: formatNumber(stats.totalDamage, 0), tone: 'gold' },
              { label: '总击杀', value: String(stats.totalKills), tone: 'orange' },
              { label: '总击倒', value: String(stats.totalKnocks), tone: 'orange' },
              { label: '击倒转化率', value: formatPercent(stats.knockConversionRate), tone: 'gold' },
            ]}
          />
          <OverviewGroup
            title="协作救援"
            metrics={[
              { label: '总扶起', value: String(stats.totalRevives), tone: 'green' },
              { label: '队伍被击倒', value: String(stats.totalDowns), tone: 'red' },
              { label: '救援率', value: formatPercent(stats.rescueRate), tone: 'blue' },
              { label: '最佳救援者', value: stats.bestRescuer?.name ?? '-', tone: 'green' },
              { label: '最容易被击倒', value: stats.mostDowned?.name ?? '-', tone: 'red' },
            ]}
          />
          <OverviewGroup
            title="生存稳定"
            metrics={[
              { label: '平均 K/D', value: formatNumber(stats.avgKd, 2), tone: 'gold' },
              { label: '平均伤害', value: formatNumber(stats.avgDamage, 0), tone: 'gold' },
              { label: '队伍场次', value: String(stats.teamMatches), tone: 'muted' },
              { label: '总助攻', value: String(stats.totalAssists), tone: 'blue' },
            ]}
          />
        </div>
      </div>
      <TeamContributionAnalysis stats={stats} />
    </>
  );
}
