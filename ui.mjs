// 화면 조각 — 숫자 형식 · 지표 타일 · 표 · 상태 표시
import { esc, sparkline } from './charts.mjs';

export { esc };
export const won = (v) => (v == null || !Number.isFinite(v) ? '—' : `${Math.round(v).toLocaleString()}`);
export const wonC = (v) => {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e8) return `${(v / 1e8).toFixed(2)}억`;
  if (a >= 1e4) return `${(v / 1e4).toFixed(a >= 1e6 ? 0 : 1)}만`;
  return Math.round(v).toLocaleString();
};
export const num = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
export const pct = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);
export const mw = (v) => num(v, 3);
export const price = (v) => num(v, 2);

export const STATUS = {
  good: { label: '양호', icon: '✓' }, warning: { label: '주의', icon: '!' }, serious: { label: '경고', icon: '!' },
  critical: { label: '위반·위험', icon: '✕' }, na: { label: '자료 없음', icon: '–' }, info: { label: '안내', icon: 'i' },
};
export const badge = (st, text) => `<span class="badge ${st}"><i></i>${esc(text ?? STATUS[st]?.label ?? st)}</span>`;

/** 지표 타일: { label, value, unit, delta, deltaDir, trend, color } */
export function tiles(list) {
  return `<div class="tiles">${list.map((t) => `
    <div class="tile">
      <div class="lab">${esc(t.label)}</div>
      <div class="val" title="${esc(t.title ?? '')}">${t.value ?? '—'}${t.unit ? `<small>${esc(t.unit)}</small>` : ''}</div>
      ${t.delta ? `<div class="delta ${t.deltaDir ?? ''}">${t.delta}</div>` : ''}
      ${t.trend ? sparkline(t.trend, { color: t.color ?? 'var(--s1)' }) : ''}
    </div>`).join('')}</div>`;
}

export function card({ title, sub, body = '', note, id, cls = '' }) {
  return `<section class="card ${cls}" ${id ? `id="${id}"` : ''}>
    ${title ? `<h2>${esc(title)}</h2>` : ''}${sub ? `<p class="sub">${sub}</p>` : ''}
    ${body}${note ? `<p class="note">${note}</p>` : ''}
  </section>`;
}

/** 표: cols = [{ k, label, fmt, n(숫자열), cls(v,row) }] */
export function table(cols, rows, { total, max = 2000 } = {}) {
  const cell = (c, r) => {
    const v = typeof c.k === 'function' ? c.k(r) : r[c.k];
    const s = c.fmt ? c.fmt(v, r) : esc(v ?? '—');
    const extra = c.cls ? c.cls(v, r) : '';
    return `<td class="${c.n ? 'n' : ''} ${extra}">${s}</td>`;
  };
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th class="${c.n ? 'n' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.slice(0, max).map((r) => `<tr>${cols.map((c) => cell(c, r)).join('')}</tr>`).join('')}
    ${total ? `<tr class="total">${cols.map((c) => cell(c, total)).join('')}</tr>` : ''}</tbody></table></div>`;
}
export const signCls = (v) => (v == null ? '' : v < 0 ? 'neg' : '');

export function meter(frac, st = '') {
  const w = frac == null ? 0 : Math.max(0, Math.min(1, frac)) * 100;
  return `<div class="meter ${st}"><span style="width:${w}%"></span></div>`;
}

export const emptyState = (text) => `<div class="empty">${text}</div>`;
export const md = (d) => (d ? `${d.slice(5, 7)}.${d.slice(8, 10)}` : '');
export const sparklineCell = (vals, color) => `<div style="width:110px">${sparkline(vals, { w: 110, h: 22, color })}</div>`;
