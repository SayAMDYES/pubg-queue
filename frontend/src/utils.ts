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
