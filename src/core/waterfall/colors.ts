/**
 * Color helpers for the waterfall display.
 *
 * `parseHex` / `toHex` / `lighten` / `darken` are moved verbatim out of
 * `src/components/Waterfall.tsx` to keep behavior identical. `shadeByPosition`
 * adds a vertical-gradient helper built on top of them.
 */

/** Cache of {@link parseHex} results keyed by the trimmed input. */
const parseCache = new Map<string, [number, number, number]>();

/** Parses `#rrggbb` into an [r, g, b] triple, or null when the input is not valid. */
function parseHex(hex: string): [number, number, number] | null {
  if (typeof hex !== 'string') return null;
  const key = hex.trim();
  // Memoise valid parses: `shadeByPosition`/`lighten`/`darken` re-parse the same
  // base color once per rendered note, so caching the (pure) result avoids
  // re-running the regex/parse for every note. Invalid inputs are not cached.
  const cached = parseCache.get(key);
  if (cached) return cached;
  const match = /^#([0-9a-f]{6})$/i.exec(key);
  if (!match) return null;
  const value = parseInt(match[1], 16);
  const rgb: [number, number, number] = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  parseCache.set(key, rgb);
  return rgb;
}

/** Formats clamped 0..255 channels back into `#rrggbb`. */
function toHex(channels: [number, number, number]): string {
  const parts = channels.map((c) =>
    Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0'),
  );
  return `#${parts.join('')}`;
}

/** Blends a `#rrggbb` color toward white by `amount` (0..1). Invalid input is returned unchanged. */
export function lighten(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  return toHex([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]);
}

/** Blends a `#rrggbb` color toward black by `amount` (0..1). Invalid input is returned unchanged. */
export function darken(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const factor = 1 - amount;
  return toHex([rgb[0] * factor, rgb[1] * factor, rgb[2] * factor]);
}

/** Shades a base color by vertical position: t=0 (at the keys, lowest) -> darken 0.2; t=1 (top of the waterfall) -> lighten 0.3; linear between. t is clamped to 0..1. Invalid base is returned unchanged. */
export function shadeByPosition(base: string, t: number): string {
  if (!parseHex(base)) return base;

  const low = parseHex(darken(base, 0.2));
  const high = parseHex(lighten(base, 0.3));
  if (!low || !high) return base;

  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return toHex([
    low[0] + (high[0] - low[0]) * clamped,
    low[1] + (high[1] - low[1]) * clamped,
    low[2] + (high[2] - low[2]) * clamped,
  ]);
}
