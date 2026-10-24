/** Bar width in percent of the largest row; tiny non-zero rows stay visible. */
export function barPercent(focusSecs: number, maxSecs: number): number {
  if (focusSecs <= 0 || maxSecs <= 0) return 0;
  return Math.max(Math.round((focusSecs / maxSecs) * 100), 4);
}
