// 그래프 — 외부 라이브러리 없이 SVG 로 그린다 (보안 정책상 이 서버의 스크립트만 쓴다).
// 규칙: 선 2px · 막대 ≤24px, 데이터 끝 4px 둥글게 · 격자는 머리카락 선 · 축은 하나 · 마우스를 올리면 값 표시
const NS = 'http://www.w3.org/2000/svg';
const tip = () => document.getElementById('tip');

export function showTip(html, ev) {
  const t = tip();
  t.innerHTML = html;
  t.hidden = false;
  const pad = 14;
  const w = t.offsetWidth; const h = t.offsetHeight;
  let x = ev.clientX + pad; let y = ev.clientY + pad;
  if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}
export function hideTip() { tip().hidden = true; }

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function niceTicks(min, max, n = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) { const d = Math.abs(min) || 1; min -= d / 2; max += d / 2; }
  const span = max - min;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v / step) * step);
  return out;
}
const defFmt = (v) => (v == null ? '—' : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

export function legendHtml(series, kind = 'line') {
  if (!series || series.length < 2) return '';
  return `<div class="legend">${series.map((s) => `<span><i class="${kind === 'bar' || s.kind === 'bar' ? 'box' : ''} ${s.dash ? 'dash' : ''}" style="background:${s.color};color:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}

/** 축 틀 — x 는 칸 위치(0..n-1), y 는 값 */
function frame(host, { n, yMin, yMax, height, yFmt, x, xEvery, padL = 48 }) {
  host.innerHTML = '';
  const W = Math.max(280, host.clientWidth || 600);
  const H = height;
  const pad = { t: 8, r: 10, b: 24, l: padL };
  const ticks = niceTicks(yMin, yMax);
  const y0 = ticks[0]; const y1 = ticks.at(-1);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  const iw = W - pad.l - pad.r; const ih = H - pad.t - pad.b;
  const X = (i) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v) => pad.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  const ax = el('g', { class: 'ax' }, svg);
  for (const t of ticks) {
    el('line', { x1: pad.l, x2: W - pad.r, y1: Y(t), y2: Y(t), class: 'gl', 'stroke-width': t === 0 && y0 < 0 ? 1.2 : 1, stroke: t === 0 && y0 < 0 ? 'var(--axis)' : null }, ax);
    const tx = el('text', { x: pad.l - 6, y: Y(t) + 3.5, 'text-anchor': 'end' }, ax);
    tx.textContent = (yFmt ?? defFmt)(t);
  }
  const every = xEvery ?? Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))));
  for (let i = 0; i < n; i += every) {
    const tx = el('text', { x: X(i), y: H - 6, 'text-anchor': 'middle' }, ax);
    tx.textContent = x?.[i] ?? '';
  }
  host.appendChild(svg);
  return { svg, W, H, pad, iw, ih, X, Y, y0, y1 };
}

function pathOf(values, X, Y) {
  let d = ''; let pen = false;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

/**
 * 선 그래프. series: [{ name, values, color, dash?, area? }], band: { lo, hi, name, color }, marks: [i...] (아래쪽 표시)
 */
export function lineChart(host, { x, series, band, marks, markName = '표시', yFmt, tipFmt, height = 240, yMin: y0, yMax: y1, xEvery }) {
  const n = x.length;
  const all = [...series.flatMap((s) => s.values), ...(band ? [...band.lo, ...band.hi] : [])].filter((v) => v != null && Number.isFinite(v));
  let lo = y0 ?? Math.min(...all, 0 < Math.min(...all) ? 0 : Math.min(...all));
  let hi = y1 ?? Math.max(...all);
  if (!all.length) { lo = 0; hi = 1; }
  const F = frame(host, { n, yMin: lo, yMax: hi, height, yFmt, x, xEvery });
  const { svg, X, Y, pad, H, W } = F;
  if (band) {
    let d = ''; let seg = [];
    const flush = () => {
      if (seg.length > 1) d += `M${seg.map((i) => `${X(i).toFixed(1)},${Y(band.hi[i]).toFixed(1)}`).join('L')}L${seg.slice().reverse().map((i) => `${X(i).toFixed(1)},${Y(band.lo[i]).toFixed(1)}`).join('L')}Z`;
      seg = [];
    };
    for (let i = 0; i < n; i += 1) { if (band.lo[i] != null && band.hi[i] != null) seg.push(i); else flush(); }
    flush();
    el('path', { d, fill: band.color ?? 'var(--wash)', stroke: 'none' }, svg);
  }
  for (const s of series) {
    if (s.area) {
      // 끊긴 구간마다 따로 칠한다 (빈 값을 가로질러 닫으면 엉뚱한 삼각형이 생긴다)
      const base = Y(Math.max(F.y0, 0));
      let seg = []; let d = '';
      const flush = () => {
        if (seg.length > 1) d += `M${seg.map((i) => `${X(i).toFixed(1)},${Y(s.values[i]).toFixed(1)}`).join('L')}L${X(seg.at(-1)).toFixed(1)},${base}L${X(seg[0]).toFixed(1)},${base}Z`;
        seg = [];
      };
      s.values.forEach((v, i) => { if (v == null || !Number.isFinite(v)) flush(); else seg.push(i); });
      flush();
      if (d) el('path', { d, fill: s.color, opacity: 0.1 }, svg);
    }
    el('path', { d: pathOf(s.values, X, Y), fill: 'none', stroke: s.color, 'stroke-width': s.width ?? 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dash ? '5 4' : null }, svg);
  }
  if (marks?.length) for (const i of marks) el('rect', { x: X(i) - 1.5, y: H - 24 - 6, width: 3, height: 6, rx: 1, fill: 'var(--critical)' }, svg);
  // 마우스
  const cross = el('line', { y1: pad.t, y2: H - 24, stroke: 'var(--axis)', 'stroke-width': 1, visibility: 'hidden' }, svg);
  const dots = series.map((s) => el('circle', { r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }, svg));
  const hit = el('rect', { x: pad.l, y: 0, width: W - pad.l - pad.r, height: H, fill: 'transparent' }, svg);
  const f = tipFmt ?? yFmt ?? defFmt;
  hit.addEventListener('mousemove', (ev) => {
    const box = svg.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1))));
    cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
    series.forEach((s, k) => {
      const v = s.values[i];
      if (v == null) { dots[k].setAttribute('visibility', 'hidden'); return; }
      dots[k].setAttribute('cx', X(i)); dots[k].setAttribute('cy', Y(v)); dots[k].setAttribute('visibility', 'visible');
    });
    const rows = series.map((s) => `<div class="row"><span><i style="background:${s.color}"></i>${esc(s.name)}</span><span>${f(s.values[i])}</span></div>`);
    if (band && band.lo[i] != null) rows.push(`<div class="row"><span>${esc(band.name ?? '범위')}</span><span>${f(band.lo[i])} ~ ${f(band.hi[i])}</span></div>`);
    if (marks?.includes(i)) rows.push(`<div class="row"><span>⚠ ${esc(markName)}</span><span></span></div>`);
    showTip(`<b>${esc(x[i])}</b>${rows.join('')}`, ev);
  });
  hit.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden')); hideTip(); });
}

function barPath(x, yTop, w, h, up) {
  // 데이터 끝(위 또는 아래)만 4px 둥글게, 기준선 쪽은 각지게
  const r = Math.min(4, w / 2, h);
  if (h <= 0.5) return '';
  if (up) return `M${x},${yTop + h}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yTop + h}Z`;
  return `M${x},${yTop}V${yTop + h - r}Q${x},${yTop + h} ${x + r},${yTop + h}H${x + w - r}Q${x + w},${yTop + h} ${x + w},${yTop + h - r}V${yTop}Z`;
}

/** 막대 (세로). stacked=true 면 양수는 위로, 음수는 아래로 쌓는다 */
export function barChart(host, { x, series, stacked = true, yFmt, tipFmt, height = 240, xEvery, highlight }) {
  const n = x.length;
  const pos = Array(n).fill(0); const neg = Array(n).fill(0);
  let lo = 0; let hi = 0;
  for (let i = 0; i < n; i += 1) {
    if (stacked) {
      let p = 0; let q = 0;
      for (const s of series) { const v = s.values[i] ?? 0; if (v >= 0) p += v; else q += v; }
      hi = Math.max(hi, p); lo = Math.min(lo, q);
    } else for (const s of series) { const v = s.values[i] ?? 0; hi = Math.max(hi, v); lo = Math.min(lo, v); }
  }
  if (hi === lo) hi = lo + 1;
  const F = frame(host, { n: n + 1, yMin: lo, yMax: hi, height, yFmt, x: [], xEvery: 1e9 });
  const { svg, pad, iw, Y, H, W } = F;
  const bw = iw / n;
  const X = (i) => pad.l + bw * i;
  const ax = svg.querySelector('.ax');
  const every = xEvery ?? Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))));
  for (let i = 0; i < n; i += every) {
    const t = el('text', { x: X(i) + bw / 2, y: H - 6, 'text-anchor': 'middle' }, ax);
    t.textContent = x[i] ?? '';
  }
  const groupW = Math.min(stacked ? 24 : 24 * series.length, bw * 0.72);
  const one = stacked ? groupW : groupW / series.length;
  const zero = Y(0);
  for (let i = 0; i < n; i += 1) {
    let up = zero; let dn = zero;
    series.forEach((s, k) => {
      const v = s.values[i];
      if (v == null || v === 0) return;
      const x0 = X(i) + (bw - groupW) / 2 + (stacked ? 0 : k * one);
      const h = Math.abs(Y(v) - zero);
      const gap = stacked && series.length > 1 ? 1 : 0;      // 쌓은 칸 사이 2px 바탕색 틈 (위아래 1px 씩)
      if (v > 0) {
        const top = (stacked ? up : zero) - h;
        el('path', { d: barPath(x0 + (stacked ? 0 : 1), top + gap, one - (stacked ? 0 : 2), Math.max(0, h - gap * 2), true), fill: s.color, opacity: highlight != null && highlight !== i ? 0.45 : 1 }, svg);
        if (stacked) up = top;
      } else {
        const top = stacked ? dn : zero;
        el('path', { d: barPath(x0 + (stacked ? 0 : 1), top + gap, one - (stacked ? 0 : 2), Math.max(0, h - gap * 2), false), fill: s.color, opacity: highlight != null && highlight !== i ? 0.45 : 1 }, svg);
        if (stacked) dn = top + h;
      }
    });
  }
  const f = tipFmt ?? yFmt ?? defFmt;
  const hl = el('rect', { y: pad.t, height: H - 24 - pad.t, width: bw, fill: 'var(--ink)', opacity: 0, 'pointer-events': 'none' }, svg);
  const hit = el('rect', { x: pad.l, y: 0, width: iw, height: H, fill: 'transparent' }, svg);
  hit.addEventListener('mousemove', (ev) => {
    const box = svg.getBoundingClientRect();
    const px = ((ev.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - pad.l) / bw)));
    hl.setAttribute('x', X(i)); hl.setAttribute('opacity', 0.05);
    const rows = series.map((s) => `<div class="row"><span><i style="background:${s.color}"></i>${esc(s.name)}</span><span>${f(s.values[i])}</span></div>`);
    if (stacked && series.length > 1) rows.push(`<div class="row"><span>합계</span><span>${f(series.reduce((a, s) => a + (s.values[i] ?? 0), 0))}</span></div>`);
    showTip(`<b>${esc(x[i])}</b>${rows.join('')}`, ev);
  });
  hit.addEventListener('mouseleave', () => { hl.setAttribute('opacity', 0); hideTip(); });
}

/** 가로 막대 (HTML) — 항목별 크기 비교 */
export function hbars(host, items, { fmt = defFmt, color = 'var(--s1)', max } = {}) {
  const m = max ?? Math.max(...items.map((x) => Math.abs(x.value ?? 0)), 1e-9);
  host.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">${items.map((x) => `
    <div style="display:grid;grid-template-columns:minmax(90px,30%) 1fr auto;gap:10px;align-items:center;font-size:13px">
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(x.label)}">${esc(x.label)}</span>
      <span style="background:var(--surface-2);border-radius:4px;height:12px;position:relative"><span style="position:absolute;left:0;top:0;bottom:0;width:${Math.max(0.5, (Math.abs(x.value ?? 0) / m) * 100)}%;background:${x.color ?? color};border-radius:0 4px 4px 0"></span></span>
      <span style="font-variant-numeric:tabular-nums;font-weight:600;min-width:70px;text-align:right">${fmt(x.value)}${x.sub ? ` <small class="muted">${esc(x.sub)}</small>` : ''}</span>
    </div>`).join('')}</div>`;
}

/** 열 지도 (행 × 열). colorOf(v) → css 색 */
export function heatmap(host, { rows, cols, values, colorOf, fmt = defFmt, colEvery = 1, rowLabelW = 70 }) {
  const nC = cols.length;
  host.innerHTML = `<div class="heat" style="grid-template-columns:${rowLabelW}px repeat(${nC}, minmax(6px,1fr))">
    ${rows.map((r, i) => `<div class="rl">${esc(r)}</div>${values[i].map((v, j) => `<div class="c" data-i="${i}" data-j="${j}" style="background:${v == null ? 'transparent' : colorOf(v)};${v == null ? 'outline:1px dashed var(--grid);outline-offset:-1px' : ''}"></div>`).join('')}`).join('')}
    <div></div>${cols.map((c, j) => `<div class="cl">${j % colEvery === 0 ? esc(c) : ''}</div>`).join('')}
  </div>`;
  host.querySelectorAll('.c').forEach((c) => {
    c.addEventListener('mousemove', (ev) => {
      const i = Number(c.dataset.i); const j = Number(c.dataset.j);
      showTip(`<b>${esc(rows[i])} · ${esc(cols[j])}</b>${fmt(values[i][j])}`, ev);
    });
    c.addEventListener('mouseleave', hideTip);
  });
}

/** 파랑 한 색(진할수록 큼) */
export function seqColor(v, max) {
  const t = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
  const steps = ['--seq-0', '--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5'];
  return `var(${steps[Math.min(steps.length - 1, Math.round(t * (steps.length - 1)))]})`;
}
/** 0 을 가운데로: 음수는 빨강, 양수는 파랑 */
export function divColor(v, maxPos, maxNeg) {
  if (v < 0) {
    const t = Math.min(1, Math.abs(v) / (Math.abs(maxNeg) || 1));
    return `var(--neg-${Math.max(1, Math.ceil(t * 4))})`;
  }
  return seqColor(v, maxPos);
}

/** 작은 추세선 (지표 타일 안) */
export function sparkline(values, { w = 160, h = 30, color = 'var(--s1)' } = {}) {
  const v = values.filter((x) => x != null && Number.isFinite(x));
  if (v.length < 2) return '';
  const lo = Math.min(...v); const hi = Math.max(...v);
  const X = (i) => (i / (values.length - 1)) * (w - 4) + 2;
  const Y = (x) => h - 3 - ((x - lo) / (hi - lo || 1)) * (h - 6);
  let d = ''; let pen = false;
  values.forEach((x, i) => { if (x == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x).toFixed(1)}`; pen = true; });
  const li = values.map((x, i) => (x == null ? null : i)).filter((i) => i != null).at(-1);
  return `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--muted)" stroke-width="1.5" vector-effect="non-scaling-stroke"/><circle cx="${X(li)}" cy="${Y(values[li])}" r="3" fill="${color}"/></svg>`;
}
/** 구간 [lo, hi] 를 파랑 1~5 단계로 (0 근처 회색은 쓰지 않음 — 양수끼리 차이를 보일 때) */
export function rangeColor(v, lo, hi) {
  const t = hi > lo ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : 1;
  return `var(--seq-${1 + Math.round(t * 4)})`;
}
