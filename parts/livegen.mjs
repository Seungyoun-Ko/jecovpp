// ⑫ 실시간 발전 — 발전기별 15분 출력(오늘·어제·예측) · 중개 집합자원 회원별 쌓기 · 급전지시·입찰과 비교
import { lineChart, barChart, legendHtml } from '../charts.mjs';
import { tiles, card, badge, num, esc, emptyState } from '../ui.mjs';

const ST = {
  run: ['good', '발전 중'], idle: ['info', '대기'], night: ['info', '야간'], zero: ['warning', '출력 0'], down: ['serious', '정지 추정'],
  late: ['warning', '계량 지연'], nometer: ['na', '계량 없음'],
};
const COLORS = { BB97: 'var(--s4)', 6498: 'var(--s6)', DT91: 'var(--s7)', BH76: 'var(--s1)' };
const FALLBACK = ['var(--s1)', 'var(--s4)', 'var(--s6)', 'var(--s7)', 'var(--s5)', 'var(--s3)'];
const lagTxt = (m) => (m == null ? '' : m < 60 ? `${m}분 전` : `${Math.floor(m / 60)}시간 ${m % 60}분 전`);

export function render(root, d) {
  const today = `${d.day.slice(4, 6)}.${d.day.slice(6)}`; const yest = `${d.prev.slice(4, 6)}.${d.prev.slice(6)}`;
  const G = Object.fromEntries(d.groups.map((g) => [g.group, g]));
  const lastTxt = d.lastAll ? `${d.lastAll.slice(11)} 칸까지` : '오늘 계량 없음';
  const order = ['풍력', '태양광', 'ESS'];
  const plants = d.plants.slice().sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.cap - a.cap);
  const plantCard = (p) => {
    const [st, lab] = ST[p.status] ?? ['na', p.status];
    const now = p.last ? `${num(p.last.mw, p.cap >= 5 ? 2 : 3)} MW` : '—';
    const pctNow = p.last && p.cap ? ` (${num((Math.abs(p.last.mw) / p.cap) * 100, 0)}%)` : '';
    const sub = p.status === 'nometer'
      ? `오늘 계량 값 없음${p.lastAny ? ` · 마지막 값 ${esc(p.lastAny.slice(5).replace('-', '.'))}` : ''}${p.lastRun ? ` · 마지막 발전 ${esc(p.lastRun.slice(5, 16).replace('-', '.'))}` : ''}`
      : `지금 ${now}${pctNow} · ${esc(p.last?.ts.slice(11) ?? '')} 칸 · ${lagTxt(p.lag)} · 오늘 ${p.group === 'ESS' ? `방전 ${num(p.gen, 2)} · 충전 ${num(p.chg, 2)}` : num(p.gen, 2)} MWh`;
    return `<section class="card lg-card"><h2 style="display:flex;gap:8px;align-items:center;justify-content:space-between"><span>${esc(p.name)} <span class="muted" style="font-weight:400">${esc(p.id)} · ${num(p.cap, p.cap >= 1 ? 1 : 3)}MW · ${esc(p.aff)}</span></span>${badge(st, lab)}</h2>
      <p class="sub">${sub}</p><div class="chart" id="lg-${esc(p.id)}"></div></section>`;
  };
  root.innerHTML = `
    <div class="alert info"><span class="ai">⚡</span><div><b>${esc(today)} 15분 발전량 — ${esc(lastTxt)}</b> · 계량은 수집 주기만큼 늦게 들어옵니다(중개 집합자원 30분 · 발전 계정 1시간, 거래소 계량 지연 포함). 5분마다 다시 불러옵니다.
      ESS 는 방전 +, 충전 −. 예측은 '발전량 예측' 탭의 KIM 예측(계량 뒤 9시간은 최근 계량 섞은 단기 예측).</div></div>
    ${tiles([
      { label: '풍력 지금', value: num(G['풍력']?.now, 2), unit: 'MW', delta: `${G['풍력']?.n ?? 0}기 · ${num(G['풍력']?.cap, 1)}MW · 오늘 ${num(G['풍력']?.gen, 1)}MWh` },
      { label: '태양광 지금', value: num(G['태양광']?.now, 3), unit: 'MW', delta: `${G['태양광']?.n ?? 0}곳 · ${num(G['태양광']?.cap, 2)}MW · 오늘 ${num(G['태양광']?.gen, 2)}MWh` },
      { label: 'ESS 지금 (방전+)', value: num(G.ESS?.now, 2), unit: 'MW', delta: `${G.ESS?.n ?? 0}기 · ${num(G.ESS?.cap, 1)}MW` },
      { label: '발전 중·대기', value: d.counts.run, unit: '기', delta: '야간 태양광 포함' },
      { label: '출력 0 · 정지 추정', value: d.counts.zero, unit: '기', deltaDir: d.counts.zero ? 'down' : '' },
      { label: '계량 없음·지연', value: d.counts.nometer, unit: '기', delta: '값 없이 들어오거나 3시간 넘게 안 옴', deltaDir: d.counts.nometer ? 'down' : '' },
    ])}
    ${d.resources.map((R) => card({
      title: `${esc(R.name)} — 회원별 발전 (${esc(today)})`,
      sub: R.members.length > 1 ? `회원 ${R.members.map((m) => `${esc(m.name)}(${m.group}${m.status === 'nometer' ? ', 계량 없음' : ''})`).join(' · ')} · 재생 설비 ${num(R.cap, 3)}MW` : '실제 출력 vs 급전지시 · 최종 입찰 · 하루전 낙찰',
      body: `${R.members.length > 1 ? `<div class="chart" id="lr-bar-${esc(R.id)}"></div>` : ''}<div class="chart" id="lr-line-${esc(R.id)}"></div>`,
      note: R.members.length > 1 ? '막대 = 회원별 15분 출력(MW, ESS 충전은 아래로) · 선 = 집합자원 합계 vs 급전지시(SP) · 최종 입찰(공급가능용량) · 하루전 낙찰' : null,
    })).join('')}
    <h3 class="sec">발전기별 — 오늘(실선) · 어제(점선) · 예측</h3>
    <div class="grid lg-grid">${plants.map(plantCard).join('') || emptyState('발전기 목록이 없습니다')}</div>`;

  const x = d.x;
  for (const R of d.resources) {
    if (R.members.length > 1) {
      const series = R.members.map((m, i) => ({ name: `${m.name}${m.group === 'ESS' ? ' (방전+/충전−)' : ''}`, values: m.today, color: COLORS[m.id] ?? FALLBACK[i % FALLBACK.length] }));
      const el = root.querySelector(`#lr-bar-${CSS.escape(R.id)}`);
      el.insertAdjacentHTML('beforebegin', legendHtml(series, 'bar'));
      barChart(el, { x, series, stacked: true, yFmt: (v) => num(v, 1), tipFmt: (v) => `${num(v, 3)} MW`, height: 240, xEvery: 8 });
    }
    const ls = [
      { name: R.members.length > 1 ? '집합자원 합계' : '실제 출력', values: R.total, color: 'var(--s2)', width: 2.5 },
      { name: '급전지시(SP)', values: R.sp, color: 'var(--s8)', dash: true },
      { name: '최종 입찰', values: R.bid, color: 'var(--s1)' },
      { name: '하루전 낙찰', values: R.da, color: 'var(--s3)', dash: true },
    ];
    const el2 = root.querySelector(`#lr-line-${CSS.escape(R.id)}`);
    el2.insertAdjacentHTML('beforebegin', legendHtml(ls));
    lineChart(el2, { x, series: ls, yFmt: (v) => num(v, 1), tipFmt: (v) => `${num(v, 3)} MW`, height: 200, xEvery: 8 });
  }
  for (const p of plants) {
    const el = root.querySelector(`#lg-${CSS.escape(p.id)}`);
    if (!el) continue;
    const s = [
      { name: `오늘 ${today}`, values: p.today, color: p.group === 'ESS' ? 'var(--s7)' : p.group === '태양광' ? 'var(--s4)' : 'var(--s1)' },
      { name: `어제 ${yest}`, values: p.yest, color: 'var(--axis)', dash: true, width: 1.5 },
      ...(p.fc ? [{ name: '예측', values: p.fc, color: 'var(--s3)', dash: true, width: 1.5 }] : []),
    ];
    el.insertAdjacentHTML('beforebegin', legendHtml(s));
    lineChart(el, { x, series: s, yFmt: (v) => num(v, p.cap >= 5 ? 0 : p.cap >= 1 ? 1 : 2), tipFmt: (v) => `${num(v, 3)} MW`, height: 150, xEvery: 16,
      yMin: p.group === 'ESS' ? -p.cap : 0, yMax: p.cap });
  }
}
