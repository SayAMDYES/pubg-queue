/**
 * 将 ISO/RFC3339 时间字符串格式化为 "yyyy-MM-dd HH:mm:ss"
 * 输入例：2024-05-01T12:34:56.789Z 或 2024-05-01T12:34:56Z
 * 输出例：2024-05-01 12:34:56
 */
export function formatDateTime(iso: string): string {
  if (!iso) return '-';
  // 替换 T 为空格，截取到秒级精度
  const s = iso.replace('T', ' ').replace('Z', '');
  // 仅保留 "yyyy-MM-dd HH:mm:ss"（前 19 个字符）
  return s.slice(0, 19);
}

/**
 * 模糊匹配打分：返回 query 相对 target 的相关度，-1 表示不匹配。
 * 匹配强度依次为 完全相等 > 前缀 > 子串 > 子序列(允许跳字)，连续命中字符额外加权。
 * 大小写不敏感，用于游戏名输入时的近似推荐。
 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.trim().toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 0;
  if (!t) return -1;
  if (t === q) return 1000 - t.length;
  if (t.startsWith(q)) return 500 - (t.length - q.length);
  const sub = t.indexOf(q);
  if (sub >= 0) return 300 - sub;

  // 子序列：query 各字符按顺序出现在 target 中
  let qi = 0;
  let lastIdx = -2;
  let consec = 0;
  let maxConsec = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      consec = ti === lastIdx + 1 ? consec + 1 : 1;
      if (consec > maxConsec) maxConsec = consec;
      lastIdx = ti;
      qi++;
    }
  }
  if (qi < q.length) return -1;
  return 100 + maxConsec * 15 + q.length * 5 - t.length;
}
