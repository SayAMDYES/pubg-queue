import type { RankEntry, RankTag } from './api';

export type TagDef = { label: string; color: string };

/**
 * fallbackComputeTags 用于 v1 旧数据（后端没有写入 Tags 字段）。
 * 计算逻辑等同于设计稿 §13 的标签判定：基于队内相对均值。
 */
export function fallbackComputeTags(record: RankEntry, all: RankEntry[]): TagDef[] {
  const active = all.filter((x) => x.Matches > 0);
  if (active.length === 0) return [];

  const mean = (fn: (x: RankEntry) => number): number => {
    const vals = active.map(fn).filter((v) => v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  const avgADR = mean((x) => x.AvgDamage);
  const avgKPG = mean((x) => x.KPG || 0);
  const avgKDA = mean((x) => x.KDA || 0);
  const avgDmgTaken = mean((x) => x.AvgDamageTaken || 0);
  const avgTradeRatio = mean((x) => x.TradeRatio || 0);
  const avgTimePerMatch = mean((x) => (x.Matches > 0 ? x.TimeAlive / x.Matches : 0));
  const avgFirePerMatch = mean((x) =>
    x.TelemetryMatches > 0 ? x.FireCount / x.TelemetryMatches : 0,
  );
  const avgHitEff = mean((x) => x.HitEfficiency || 0);
  const avgDeathsPerMatch = mean((x) => (x.Matches > 0 ? x.Deaths / x.Matches : 0));

  const hasTel = record.TelemetryMatches > 0;
  const adr = record.AvgDamage;
  const kpg = record.KPG || 0;
  const kda = record.KDA || 0;
  const dmgTaken = record.AvgDamageTaken || 0;
  const trade = record.TradeRatio || 0;
  const timePerMatch = record.Matches > 0 ? record.TimeAlive / record.Matches : 0;
  const firePerMatch =
    record.TelemetryMatches > 0 ? record.FireCount / record.TelemetryMatches : 0;
  const hitEff = record.HitEfficiency || 0;
  const deathsPerMatch = record.Matches > 0 ? record.Deaths / record.Matches : 0;

  const result: TagDef[] = [];
  if (record.RankNo === 1) result.push({ label: '🏅 MVP', color: '#f0a500' });

  if (avgADR > 0 && adr > avgADR * 1.2 && avgKPG > 0 && kpg > avgKPG * 1.2)
    result.push({ label: '🔥 钢枪王', color: '#ff4d4f' });

  if (
    hasTel &&
    avgDmgTaken > 0 &&
    dmgTaken > avgDmgTaken * 1.2 &&
    avgADR > 0 &&
    adr > avgADR * 1.1 &&
    trade >= 0.85
  )
    result.push({ label: '⚡ 突破手', color: '#fa8c16' });

  if (
    hasTel &&
    avgDmgTaken > 0 &&
    dmgTaken < avgDmgTaken * 0.75 &&
    avgTradeRatio > 0 &&
    trade > avgTradeRatio * 1.2 &&
    avgADR > 0 &&
    adr >= avgADR * 0.85
  )
    result.push({ label: '🎯 架枪位', color: '#722ed1' });

  if (
    hasTel &&
    avgTimePerMatch > 0 &&
    timePerMatch > avgTimePerMatch * 1.1 &&
    avgADR > 0 &&
    adr >= avgADR * 0.9 &&
    avgDeathsPerMatch > 0 &&
    deathsPerMatch < avgDeathsPerMatch * 0.9 &&
    trade >= 1.0
  )
    result.push({ label: '🛡️ 稳健', color: '#1677ff' });

  if (
    avgTimePerMatch > 0 &&
    timePerMatch >= avgTimePerMatch * 0.85 &&
    avgADR > 0 &&
    adr < avgADR * 0.4
  ) {
    result.push({ label: '📷 战地记者', color: '#faad14' });
  } else if (
    hasTel &&
    avgTimePerMatch > 0 &&
    timePerMatch > avgTimePerMatch * 1.1 &&
    avgADR > 0 &&
    adr < avgADR * 0.65 &&
    avgDmgTaken > 0 &&
    dmgTaken < avgDmgTaken * 0.75 &&
    avgFirePerMatch > 0 &&
    firePerMatch < avgFirePerMatch * 0.75
  ) {
    result.push({ label: '🐢 伏地老六', color: '#52c41a' });
  } else if (
    !hasTel &&
    avgTimePerMatch > 0 &&
    timePerMatch > avgTimePerMatch * 1.1 &&
    avgADR > 0 &&
    adr < avgADR * 0.65
  ) {
    result.push({ label: '😤 怂', color: '#8c8c8c' });
  }

  if (
    hasTel &&
    avgDmgTaken > 0 &&
    dmgTaken > avgDmgTaken * 1.2 &&
    avgADR > 0 &&
    adr < avgADR * 0.8 &&
    trade < 0.75 &&
    avgKDA > 0 &&
    kda < avgKDA * 0.8
  )
    result.push({ label: '😵 打不过', color: '#ff7875' });

  if (
    hasTel &&
    avgFirePerMatch > 0 &&
    firePerMatch > avgFirePerMatch * 1.2 &&
    avgHitEff > 0 &&
    hitEff < avgHitEff * 0.75 &&
    avgADR > 0 &&
    adr < avgADR * 0.8
  )
    result.push({ label: '💫 夕阳红枪法', color: '#bfbfbf' });

  if (
    avgTimePerMatch > 0 &&
    timePerMatch < avgTimePerMatch * 0.65 &&
    avgADR > 0 &&
    adr < avgADR * 0.7 &&
    avgKDA > 0 &&
    kda < avgKDA * 0.7 &&
    avgDeathsPerMatch > 0 &&
    deathsPerMatch > avgDeathsPerMatch * 1.3
  )
    result.push({ label: '📦 盒子精', color: '#8c8c8c' });

  if (!result.some((t) => !t.label.includes('MVP')))
    result.push({ label: '⚖️ 均衡', color: '#13c2c2' });
  return result;
}

/**
 * resolveRankTags 优先取后端 Tags（v2 数据），如果后端未提供则 fallback 到本地计算（v1 数据）。
 */
export function resolveRankTags(record: RankEntry, all: RankEntry[]): TagDef[] {
  const tags: RankTag[] = (record.Tags ?? []) as RankTag[];
  if (tags.length > 0) {
    return tags.map((t) => ({ label: t.label, color: t.color || '#13c2c2' }));
  }
  return fallbackComputeTags(record, all);
}

/** 置信度展示文案（设计稿 §20）。 */
export const confidenceLabel: Record<string, string> = {
  very_low: '极低',
  low: '低',
  medium: '中',
  high: '高',
  very_high: '很高',
};

export const confidenceColor: Record<string, string> = {
  very_low: '#bfbfbf',
  low: '#faad14',
  medium: '#1677ff',
  high: '#52c41a',
  very_high: '#13c2c2',
};

export const analysisStatusLabel: Record<string, string> = {
  basic_ready: '基础已就绪',
  telemetry_processing: '遥测分析中',
  full_ready: '完整就绪',
  partial_ready: '部分样本缺失',
  failed: '分析失败',
};
