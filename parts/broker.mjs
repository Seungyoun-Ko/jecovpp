// ③ 중개사업 (집합자원)
import { lineChart, barChart, hbars, legendHtml } from '../charts.mjs';
import { tiles, card, table, badge, num, pct, won, wonC, mw, md, esc, signCls, sparklineCell } from '../ui.mjs';

const MC = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];

export function render(root, d) {
  const k = d.kpi;
  const days = d.days;
  root.innerHTML = `
    ${tiles([
      { label: '순발전량', value: num(k.mwh, 1), unit: 'MWh', delta: `${d.gen ?? ''} · ICDM ${num(d.icdm, 4)} MW`, trend: days.map((x) => x.mwh) },
      { label: '정산 합계 (확정+추정)', value: wonC(k.total), unit: '원', delta: `원/MWh ${won(k.unit)} · 확정 ${k.settledHours}시간`, trend: days.map((x) => x.total) },
      { label: '임밸런스', value: wonC(k.imbp), unit: '원', delta: `허용오차 초과 ${k.excessQ}칸`, deltaDir: k.imbp < 0 ? 'down' : '', trend: days.map((x) => x.imbp), color: 'var(--s8)' },
      { label: '허용오차 이내 운영', value: pct(k.followRate), delta: '시간 기준 · 별표33 (라)', deltaDir: (k.followRate ?? 1) < 0.85 ? 'down' : 'up', trend: days.map((x) => x.followRate) },
      { label: '자원기여도 (28.4)', value: pct(k.resContrib), delta: `입찰 ${pct(k.bidContrib)} · 이행 ${pct(k.perfContrib)}` },
      { label: '입찰 구성 경고', value: `${k.warnDays}`, unit: '일', delta: `예측오차율 ${pct(k.fcErr)}`, deltaDir: k.warnDays ? 'down' : '' },
    ])}
    ${card({ title: `${esc(d.lastDay.d ?? '')} 15분 운영`, sub: '발전 · 급전지시 · 허용 범위 · 하루전 계획 — 기간의 마지막 날', body: '<div id="br-last" class="chart"></div>', note: '빨간 눈금 = 허용오차를 넘은 15분 (마우스를 올리면 원인).' })}
    <div class="grid g2">
      ${card({ title: '일별 정산 — 수익과 임밸런스', sub: '정산 합계(위) · 임밸런스(아래, 음수) — 원', body: '<div id="br-money" class="chart"></div>' })}
      ${card({ title: '일별 허용오차 이내 운영 비율', sub: '시간 기준 — 95% 이상이 목표', body: '<div id="br-follow" class="chart"></div>' })}
    </div>
    <div class="grid g3">
      ${card({ title: '임밸런스 원인', sub: '15분 진단 결과 — 금액(원)', body: '<div id="br-cause"></div>' })}
      ${card({ title: '시간대별 허용오차 초과', sub: '기간 합계 15분 칸 수', body: '<div id="br-hour" class="chart"></div>' })}
      ${card({ title: '시간대별 평균 운영', sub: '발전 · 급전지시 · 하루전 계획 (MWh/h)', body: '<div id="br-prof" class="chart"></div>' })}
    </div>
    ${card({ title: '설비(보유자원)별 성과 · 정산 배분', sub: '거래소는 집합자원 하나로만 정산합니다 — 설비별 몫은 내부 배분 기준으로 나눈 값입니다', body: '<div id="br-mem"></div>', note: '책임 편차 = 정산 편차와 같은 방향으로 기대 발전((급전지시 − ESS) × 설비 비중)에서 벗어난 양. 주원인 = 그 시간 책임이 가장 큰 설비.' })}
    <div class="grid g12">
      ${card({ title: '설비별 임밸런스 부담', sub: '원', body: '<div id="br-memimb"></div>' })}
      ${card({ title: '날마다 점검', sub: '입찰 구성 · 정지 의심 설비 · 마이너스 SMP · 예측오차', body: '<div id="br-check"></div>' })}
    </div>
    ${card({ title: '정산 규칙 참고', sub: '전력시장운영규칙 별표33', body: table([{ k: 'k', label: '항목' }, { k: 'v', label: '내용' }, { k: 'note', label: '비고' }, { k: 'ref', label: '근거' }], d.rules) })}`;
  const L = d.lastDay.slots;
  const lseries = [
    { name: '발전', values: L.map((s) => s.gen), color: 'var(--s1)' },
    { name: '급전지시', values: L.map((s) => s.sp), color: 'var(--s2)' },
    { name: '하루전 계획(POA)', values: L.map((s) => s.poa), color: 'var(--s3)', dash: true },
  ];
  const e1 = root.querySelector('#br-last');
  e1.insertAdjacentHTML('beforebegin', legendHtml(lseries));
  lineChart(e1, { x: L.map((s) => s.t), series: lseries, band: { lo: L.map((s) => s.lo), hi: L.map((s) => s.hi), name: '허용 범위' }, marks: L.map((s, i) => (s.ex ? i : null)).filter((i) => i != null), markName: '허용오차 초과', yFmt: (v) => num(v, 1), tipFmt: (v) => (v == null ? '—' : `${mw(v)} MW`), height: 260 });
  const x = days.map((r) => md(r.d));
  const ms = [
    { name: '정산 합계(임밸런스 제외)', values: days.map((r) => (r.total ?? 0) - (r.imbp ?? 0)), color: 'var(--s1)' },
    { name: '임밸런스', values: days.map((r) => r.imbp), color: 'var(--s8)' },
  ];
  const e2 = root.querySelector('#br-money');
  e2.insertAdjacentHTML('beforebegin', legendHtml(ms, 'bar'));
  barChart(e2, { x, series: ms, yFmt: (v) => wonC(v), tipFmt: (v) => `${won(v)}원`, height: 230 });
  lineChart(root.querySelector('#br-follow'), { x, series: [{ name: '허용오차 이내', values: days.map((r) => r.followRate), color: 'var(--s1)', area: true }], yMin: 0, yMax: 1, yFmt: (v) => `${Math.round(v * 100)}%`, tipFmt: (v) => pct(v), height: 230 });
  hbars(root.querySelector('#br-cause'), d.causes.filter((c) => c.amt).sort((a, b) => a.amt - b.amt).map((c) => ({ label: c.label, value: c.amt, sub: `${c.q}칸`, color: 'var(--s8)' })), { fmt: (v) => `${won(v)}` });
  if (!d.causes.some((c) => c.amt)) root.querySelector('#br-cause').innerHTML = '<p class="muted">기간 중 임밸런스 없음</p>';
  barChart(root.querySelector('#br-hour'), { x: d.byHour.map((h) => String(h.h).padStart(2, '0')), series: [{ name: '초과 칸', values: d.byHour.map((h) => h.excessQ), color: 'var(--s8)' }], yFmt: (v) => num(v, 0), tipFmt: (v) => `${v}칸`, height: 200, xEvery: 3 });
  const ps = [
    { name: '발전', values: d.byHour.map((h) => h.gen), color: 'var(--s1)' },
    { name: '급전지시', values: d.byHour.map((h) => h.sp), color: 'var(--s2)' },
    { name: 'POA', values: d.byHour.map((h) => h.poa), color: 'var(--s3)', dash: true },
  ];
  const e3 = root.querySelector('#br-prof');
  e3.insertAdjacentHTML('beforebegin', legendHtml(ps));
  lineChart(e3, { x: d.byHour.map((h) => `${String(h.h).padStart(2, '0')}시`), series: ps, yFmt: (v) => num(v, 1), tipFmt: (v) => `${num(v, 3)}`, height: 200, xEvery: 6 });
  const tot = d.members.reduce((a, m) => ({ net: a.net + (m.net ?? 0), energy: a.energy + (m.energy ?? 0), tpcp: a.tpcp + (m.tpcp ?? 0), imbp: a.imbp + (m.imbp ?? 0), total: a.total + (m.total ?? 0), wdev: a.wdev + (m.wdev ?? 0), top: a.top + (m.top ?? 0) }), { net: 0, energy: 0, tpcp: 0, imbp: 0, total: 0, wdev: 0, top: 0 });
  root.querySelector('#br-mem').innerHTML = table([
    { k: 'name', label: '설비', fmt: (v, r) => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${MC[d.members.indexOf(r)] ?? 'var(--muted)'};margin-right:6px"></span>${esc(v)}` },
    { k: 'fuel', label: '연료' }, { k: 'cap', label: 'MW', n: true, fmt: (v) => (v == null ? '' : num(v, 3)) },
    { k: 'net', label: '순발전 MWh', n: true, fmt: (v) => num(v, 2), cls: signCls },
    { k: 'util', label: '이용률', n: true, fmt: (v, r) => (r.ess ? '—' : pct(v)) },
    { k: 'zeroDays', label: '발전 0 일', n: true, fmt: (v, r) => (r.ess || v == null ? '—' : v ? badge(v >= 3 ? 'critical' : 'warning', `${v}일`) : '0') },
    { k: 'dayGen', label: '일별 발전', fmt: (v, r) => (v ? sparklineCell(v, MC[d.members.indexOf(r)]) : '') },
    { k: 'energy', label: '에너지', n: true, fmt: won }, { k: 'tpcp', label: '용량', n: true, fmt: won },
    { k: 'imbp', label: '임밸런스', n: true, fmt: won, cls: signCls }, { k: 'total', label: '배분 합계', n: true, fmt: won, cls: signCls },
    { k: 'wdev', label: '책임 편차 MWh', n: true, fmt: (v) => num(v, 2) }, { k: 'top', label: '주원인 시간', n: true },
  ], d.members, { total: { name: '합계', fuel: '', cap: null, ...tot, util: null, zeroDays: null, dayGen: null } });
  // 배분 규칙·계약 내용은 화면에 보이지 않는다 (config/allocation.json · 계약 표에서만 관리, 2026-10-19)
  hbars(root.querySelector('#br-memimb'), d.members.map((m, i) => ({ label: m.name, value: m.imbp, color: MC[i] })), { fmt: (v) => won(v) });
  root.querySelector('#br-check').innerHTML = table([
    { k: 'd', label: '날짜', fmt: (v) => md(v) },
    { k: (r) => r.check?.poaMax, label: 'POA 최대', n: true, fmt: (v) => mw(v) },
    { k: (r) => r.check?.activeCap, label: '가동 가능', n: true, fmt: (v) => mw(v) },
    { k: (r) => r.check?.bidWarn, label: '입찰', fmt: (v) => (v ? badge('critical', '경고') : badge('good', '정상')) },
    { k: (r) => r.check?.stopped, label: '정지 의심', fmt: (v) => esc(v || '—') },
    { k: (r) => r.check?.negWon, label: '마이너스 SMP 손실', n: true, fmt: won, cls: signCls },
    { k: (r) => r.check?.fcErr, label: '예측오차율', n: true, fmt: (v) => pct(v) },
    { k: 'excessQ', label: '초과 칸', n: true },
    { k: 'imbp', label: '임밸런스', n: true, fmt: won, cls: signCls },
  ], days.slice().reverse());
}
