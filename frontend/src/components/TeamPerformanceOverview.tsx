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
};

const toneColor: Record<MetricTone, string> = {
  gold: '#f0a500',
  orange: '#f97316',
  blue: '#38bdf8',
  green: '#22c55e',
  red: '#d96b6b',
  muted: 'var(--text)',
};

const contributionTabs = [
  { key: 'damage', label: '伤害', tone: 'gold' as MetricTone },
  { key: 'knocks', label: '击倒', tone: 'orange' as MetricTone },
  { key: 'revives', label: '扶起', tone: 'green' as MetricTone },
  { key: 'downs', label: '被击倒', tone: 'red' as MetricTone },
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
  const totalKills = total((player) => player.kills);
  const totalKnocks = total((player) => player.knocks);
  const totalRevives = total((player) => player.revives);
  const totalDowns = total((player) => player.downs);

  return {
    players,
    totalScore: total((player) => player.score),
    totalDamage: total((player) => player.damage),
    totalKills,
    totalKnocks,
    totalRevives,
    totalDowns,
    totalAssists: total((player) => player.assists),
    avgDamage: average((player) => player.damage),
    avgKd: average((player) => player.kd),
    teamMatches: Math.max(...source.map((record) => safeNumber(record.EventMatches) || safeNumber(record.Matches)), 0),
    rescueRate: totalDowns > 0 ? totalRevives / totalDowns : null,
    knockConversionRate: totalKnocks > 0 ? totalKills / totalKnocks : null,
  };
}

function MiniMetric({ label, value, tone = 'muted' }: { label: string; value: string; tone?: MetricTone }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--heading-font)', fontSize: 22, lineHeight: 1.05, color: toneColor[tone], fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

function ContributionRow({ player, value, total, tabKey, tone }: { player: PlayerTeamStats; value: number; total: number; tabKey: string; tone: MetricTone }) {
  const percent = ratio(value, total);
  const valueUnit = tabKey === 'damage' ? '伤害' : tabKey === 'revives' ? '次扶起' : tabKey === 'downs' ? '次' : '击倒';
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', fontSize: 12 }}>
        <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
        <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          <span style={{ color: toneColor[tone] }}>{tabKey === 'damage' ? formatNumber(value, 0) : value}</span> {valueUnit} / {formatPercent(percent)}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 999, background: 'rgba(148,163,184,0.12)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(3, percent * 100)}%`, height: '100%', borderRadius: 999, background: toneColor[tone], opacity: tabKey === 'downs' ? 0.7 : 0.85 }} />
      </div>
    </div>
  );
}

function TeamContribution({ stats }: { stats: TeamStats }) {
  const [activeTab, setActiveTab] = useState(contributionTabs[0].key);
  const currentTab = contributionTabs.find((tab) => tab.key === activeTab) ?? contributionTabs[0];
  const total = stats.players.reduce((sum, player) => sum + safeNumber(player[currentTab.key as keyof PlayerTeamStats] as number), 0);
  const rows = [...stats.players].sort((a, b) => safeNumber(b[currentTab.key as keyof PlayerTeamStats] as number) - safeNumber(a[currentTab.key as keyof PlayerTeamStats] as number));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="section-label">贡献占比</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {contributionTabs.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{ border: `1px solid ${active ? toneColor[tab.tone] : 'var(--border)'}`, background: active ? 'rgba(240,165,0,0.08)' : 'transparent', color: active ? toneColor[tab.tone] : 'var(--text-muted)', borderRadius: 999, padding: '4px 12px', fontFamily: 'var(--body-font)', fontSize: 12, cursor: 'pointer' }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
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

// TeamPerformanceOverview 把队伍关键数据和逐人贡献合并到一张卡：
// 顶部 6 个关键指标，下方按维度切换的贡献占比条。
export default function TeamPerformanceOverview({ rankings }: TeamPerformanceOverviewProps) {
  if (rankings.length === 0) return null;
  const stats = buildTeamStats(rankings);
  return (
    <div className="g-card g-card--accent" style={{ marginBottom: 16 }}>
      <div className="g-card__header">队伍总览</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 14, marginBottom: 16 }}>
        <MiniMetric label="队伍评分" value={formatNumber(stats.totalScore, 1)} tone="gold" />
        <MiniMetric label="总伤害" value={formatNumber(stats.totalDamage, 0)} tone="gold" />
        <MiniMetric label="总击杀" value={String(stats.totalKills)} tone="muted" />
        <MiniMetric label="总击倒" value={String(stats.totalKnocks)} tone="muted" />
        <MiniMetric label="总扶起" value={String(stats.totalRevives)} tone="green" />
        <MiniMetric label="救援率" value={formatPercent(stats.rescueRate)} tone="blue" />
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <TeamContribution stats={stats} />
      </div>
    </div>
  );
}
