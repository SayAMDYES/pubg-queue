import type { RankEntry, RankTag } from './api';

export type TagDef = { code: string; label: string; color: string };

/** 标签元信息：含义（是什么）与触发条件（为什么）。 */
export const tagInfo: Record<string, { description: string; criteria: string }> = {
  ace: {
    description: '输出与收割双优，是队伍里最稳定的正面火力点。',
    criteria: 'ADR ≥ 180 且 KPG ≥ 1.2 且 K/D ≥ 1.2',
  },
  breaker: {
    description: '常顶在前面打开局面，承伤高但能换回足够输出。',
    criteria: '需遥测：ADR ≥ 180 且 场均承伤 ≥ 200 且 换血比 ≥ 0.85 且 场均击倒 ≥ 1.1',
  },
  sniper_pos: {
    description: '暴露控制、换血效率都不错，适合架枪和侧翼压制。',
    criteria: '需遥测：ADR ≥ 150 且 场均承伤 ≤ 170 且 换血比 ≥ 1.1',
  },
  steady: {
    description: '存活、进圈与换血都稳，后期贡献可靠。',
    criteria: '需遥测：场均生存 ≥ 680s 且 前十率 ≥ 30% 且 场均死亡 ≤ 0.95 且 换血比 ≥ 0.95 且 ADR ≥ 140',
  },
  operator: {
    description: '后期转移与处理稳，输出中等即可。',
    criteria: '场均生存 ≥ 700s 且 前十率 ≥ 35% 且 场均死亡 ≤ 0.95 且 ADR ≥ 120',
  },
  medic: {
    description: '拉人和协同支援贡献明显，是队伍的救火位。',
    criteria: '场均拉人 ≥ 0.6 且 总拉人 ≥ 4 且 场均助攻 ≥ 0.3',
  },
  finisher: {
    description: '跟枪和协同收尾能力突出，但本人不是主钢枪位。',
    criteria: '场均助攻 ≥ 0.45 且 场均击倒 ≥ 1.0 且 0.9 ≤ KPG < 1.2 且 140 ≤ ADR < 190',
  },
  reporter: {
    description: '生存不差，但战斗参与与输出明显偏低。',
    criteria: '场均生存 ≥ 650s 且 ADR < 90',
  },
  camper: {
    description: '活得久、暴露少，但参战和开火都偏少。',
    criteria: '需遥测：场均生存 ≥ 700s 且 ADR < 130 且 场均承伤 < 170 且 场均开火 < 180',
  },
  coward: {
    description: '生存时间不短，但参战积极性和输出都偏低。',
    criteria: '无遥测时：场均生存 ≥ 700s 且 ADR < 130',
  },
  weak: {
    description: '输出、击杀和换血都偏弱，正面对抗明显吃亏。',
    criteria: '有遥测：ADR < 110 且 换血比 < 0.8 且 K/D < 0.9 且 场均承伤 ≥ 190；无遥测：ADR < 90 且 K/D < 0.8 且 KPG < 0.7；或未命中其他标签且 ADR < 110 且 K/D < 0.9 的兑底',
  },
  dusk_shooter: {
    description: '开火不少，但有效命中和伤害转化偏低。',
    criteria: '需遥测：场均开火 ≥ 220 且 命中效 < 0.75 且 ADR < 150',
  },
  box_king: {
    description: '容易过早阵亡，死前贡献明显不够。',
    criteria: '场均生存 < 480s 且 ADR < 110 且 K/D < 0.8 且 场均死亡 ≥ 1.0',
  },
  balanced: {
    description: '没有特别突出的强项，也不是明显的短板。',
    criteria: '未命中其他标签且中位档指标达标：130 ≤ ADR < 190 且 0.95 ≤ K/D < 1.35 且 0.9 ≤ KPG < 1.3 且 前十率 ≥ 25%（有遥测时 0.8 ≤ 换血比 ≤ 1.05）',
  },
  mvp: {
    description: '本场活动综合评分队内第一名。',
    criteria: '出勤 ≥ 1 场且综合分 (Score) 队内最高',
  },
};

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
  if (record.RankNo === 1) result.push({ code: 'mvp', label: '🏅 MVP', color: '#f0a500' });

  if (avgADR > 0 && adr > avgADR * 1.2 && avgKPG > 0 && kpg > avgKPG * 1.2)
    result.push({ code: 'ace', label: '🔥 钢枪王', color: '#ff4d4f' });

  if (
    hasTel &&
    avgDmgTaken > 0 &&
    dmgTaken > avgDmgTaken * 1.2 &&
    avgADR > 0 &&
    adr > avgADR * 1.1 &&
    trade >= 0.85
  )
    result.push({ code: 'breaker', label: '⚡ 突破手', color: '#fa8c16' });

  if (
    hasTel &&
    avgDmgTaken > 0 &&
    dmgTaken < avgDmgTaken * 0.75 &&
    avgTradeRatio > 0 &&
    trade > avgTradeRatio * 1.2 &&
    avgADR > 0 &&
    adr >= avgADR * 0.85
  )
    result.push({ code: 'sniper_pos', label: '🎯 架枪位', color: '#722ed1' });

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
    result.push({ code: 'steady', label: '🛡️ 稳健', color: '#1677ff' });

  if (
    avgTimePerMatch > 0 &&
    timePerMatch >= avgTimePerMatch * 0.85 &&
    avgADR > 0 &&
    adr < avgADR * 0.4
  ) {
    result.push({ code: 'reporter', label: '📷 战地记者', color: '#faad14' });
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
    result.push({ code: 'camper', label: '🐢 伏地老六', color: '#52c41a' });
  } else if (
    !hasTel &&
    avgTimePerMatch > 0 &&
    timePerMatch > avgTimePerMatch * 1.1 &&
    avgADR > 0 &&
    adr < avgADR * 0.65
  ) {
    result.push({ code: 'coward', label: '😤 怂', color: '#8c8c8c' });
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
    result.push({ code: 'weak', label: '😵 打不过', color: '#ff7875' });

  if (
    hasTel &&
    avgFirePerMatch > 0 &&
    firePerMatch > avgFirePerMatch * 1.2 &&
    avgHitEff > 0 &&
    hitEff < avgHitEff * 0.75 &&
    avgADR > 0 &&
    adr < avgADR * 0.8
  )
    result.push({ code: 'dusk_shooter', label: '💫 夕阳红枪法', color: '#bfbfbf' });

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
    result.push({ code: 'box_king', label: '📦 盒子精', color: '#8c8c8c' });

  if (!result.some((t) => t.code !== 'mvp'))
    result.push({ code: 'balanced', label: '⚖️ 均衡', color: '#13c2c2' });
  return result;
}

/**
 * resolveRankTags 优先取后端 Tags（v2 数据），如果后端未提供则 fallback 到本地计算（v1 数据）。
 */
export function resolveRankTags(record: RankEntry, all: RankEntry[]): TagDef[] {
  const tags: RankTag[] = (record.Tags ?? []) as RankTag[];
  if (tags.length > 0) {
    return tags.map((t) => ({ code: t.code, label: t.label, color: t.color || '#13c2c2' }));
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
