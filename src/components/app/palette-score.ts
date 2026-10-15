/** Subsequence match with a score that prefers word starts and contiguous runs. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct >= 0) return 100 - direct + (direct === 0 || t[direct - 1] === " " ? 50 : 0);
  let ti = 0;
  let score = 0;
  let run = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    run = found === ti ? run + 1 : 0;
    score += 1 + run;
    ti = found + 1;
  }
  return score;
}
