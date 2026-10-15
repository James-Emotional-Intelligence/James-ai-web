/** Compares short, objective numeric answers without loose substring matching. */
export function equivalentObjectiveAnswer(given: string, expected: string): boolean {
  const tidy = (value: string) => value.trim().toLocaleLowerCase('vi-VN')
    .replace(/\\frac\s*\{\s*(-?\d+)\s*\}\s*\{\s*(-?\d+)\s*\}/g, '$1/$2')
    .replace(/\s+/g, '')
    .replace(/,/g, '.');
  const left = tidy(given);
  const right = tidy(expected);
  if (!left || !right) return false;
  if (left === right) return true;
  const parse = (value: string): { number: number; unit: string } | null => {
    const match = /^(-?\d+(?:\.\d+)?)(?:\/(-?\d+(?:\.\d+)?))?(°|độ|cm|cm2|cm²)?$/.exec(value);
    if (!match) return null;
    const denominator = match[2] ? Number(match[2]) : 1;
    if (!denominator) return null;
    return { number: Number(match[1]) / denominator, unit: match[3] === 'độ' ? '°' : match[3] || '' };
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b || a.unit !== b.unit) return false;
  return Math.abs(a.number - b.number) < 1e-9;
}
