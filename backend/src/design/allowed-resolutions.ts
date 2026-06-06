/**
 * Factory-accepted print resolutions (width × height, pixels). A design file is
 * valid only when its dimensions exactly match one of these pairs.
 */
export const ALLOWED_RESOLUTIONS: ReadonlyArray<readonly [number, number]> = [
  [4800, 5400],
  [2100, 2400],
  [4200, 4800],
  [2400, 3200],
  [2800, 3200],
  [4500, 5400],
  [2400, 3197],
  [4050, 4650],
  [3000, 4000],
  [4500, 5000],
  [3600, 4795],
  [4050, 4050],
  [3600, 4800],
  [4500, 5100],
  [2935, 3374],
  [2953, 3374],
  [4535, 5480],
  [4500, 4200],
  [4500, 3600],
  [4500, 5700],
  [4500, 5143],
  [3400, 4500],
  [3951, 4919],
  [4500, 5600],
  [3692, 4800],
];

/** Exact-match validation (orientation-sensitive). */
export function isAllowed(width: number, height: number): boolean {
  return ALLOWED_RESOLUTIONS.some(([w, h]) => w === width && h === height);
}

/**
 * Pick the allowed resolution closest in aspect ratio to the source, so resize+crop
 * removes as little of the design as possible. Tie-break: prefer the size that upscales
 * the least (smallest max scale factor).
 */
export function nearestAllowed(
  width: number,
  height: number,
): readonly [number, number] {
  const srcRatio = width / height;
  let best = ALLOWED_RESOLUTIONS[0];
  let bestScore = Infinity;
  for (const [w, h] of ALLOWED_RESOLUTIONS) {
    const ratioDiff = Math.abs(w / h - srcRatio);
    const upscale = Math.max(w / width, h / height);
    // Aspect ratio dominates; upscale is a small tie-breaker.
    const score = ratioDiff * 100 + Math.max(0, upscale - 1);
    if (score < bestScore) {
      bestScore = score;
      best = [w, h];
    }
  }
  return best;
}
