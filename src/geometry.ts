export interface Box { x: number; y: number; w: number; h: number }
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

// CSSOM resolves lengths to px. Background-position exposes the same <position>
// grammar as object-position and normalizes edge offsets independently per axis.
const positionParser = () => document.createElement('div').style;
let parser: CSSStyleDeclaration;
function offset(value: string, free: number) {
  if (value === 'center') return free / 2;
  const far = /^(right|bottom)/.test(value);
  if (far && !value.includes(' ')) return free;
  let result = 0;
  for (const [, sign, number, unit] of value.matchAll(/([+-]?)\s*(\d*\.?\d+)(%|px)/g)) {
    result += (sign === '-' ? -1 : 1) * Number(number) * (unit === '%' ? free / 100 : 1);
  }
  return far ? free - result : result;
}

export function geometry(img: HTMLImageElement) {
  const rect = img.getBoundingClientRect();
  const css = getComputedStyle(img);
  const pixels = (key: 'paddingLeft' | 'paddingRight' | 'paddingTop' | 'paddingBottom') => parseFloat(css[key]) || 0;
  const x = rect.left + img.clientLeft + pixels('paddingLeft');
  const y = rect.top + img.clientTop + pixels('paddingTop');
  const w = img.clientWidth - pixels('paddingLeft') - pixels('paddingRight');
  const h = img.clientHeight - pixels('paddingTop') - pixels('paddingBottom');
  if (!w || !h || !img.naturalWidth || !img.naturalHeight) return;
  const nw = img.naturalWidth, nh = img.naturalHeight;
  let ratio = Math.min(w / nw, h / nh);
  if (css.objectFit === 'cover') ratio = Math.max(w / nw, h / nh);
  if (css.objectFit === 'none') ratio = 1;
  if (css.objectFit === 'scale-down') ratio = Math.min(1, ratio);
  const iw = css.objectFit === 'fill' ? w : nw * ratio;
  const ih = css.objectFit === 'fill' ? h : nh * ratio;
  parser ??= positionParser();
  parser.backgroundPosition = css.objectPosition;
  const ix = x + offset(parser.backgroundPositionX, w - iw);
  const iy = y + offset(parser.backgroundPositionY, h - ih);
  const left = Math.max(ix, x), top = Math.max(iy, y);
  return { image: { x: ix, y: iy, w: iw, h: ih },
    visible: { x: left, y: top, w: Math.min(x + w, ix + iw) - left, h: Math.min(y + h, iy + ih) - top } };
}

export function contains(b: Box, x: number, y: number) {
  return x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h;
}
