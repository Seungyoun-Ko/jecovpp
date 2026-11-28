// ⑧ 급전 · 낙찰 대비 지시 — 하루전 낙찰(POA) → 최종입찰(PRA) → 급전지시(SP) → 실제 발전
import { lineChart, barChart, legendHtml } from '../charts.mjs';
import { tiles, card, table, badge, num, pct, won, wonC, md, esc, emptyState, signCls } from '../ui.mjs';

export function render(root, d) {
  const RS = d.resources;
  root.innerHTML = `
    <div class="card"><h2>어떻게 보나</h2><p class="sub" style="margin:0">
      <b>낙찰</b>(하루전 계획 POA) → 우리가 <b>변경입찰</b>로 고친 <b>최종입찰</b>(공급가능용량 PRA) → 거래소가 내린 <b>급전지시</b>(SP) → <b>실제 발전</b>.<br>
      낙찰보다 급전지시가 적으면 ① 우리가 변경입찰로 줄였는지(예: 정지 설비 정정) ② 거래소가 최종입찰보다 덜 돌리라고 했는지(감축 지시 — 출력 제한·경제 급전)를 나눠 봅니다.
      급전지시가 최종입찰보다 낮은 15분은 허용오차가 1.5% 로 좁아집니다(별표33 (라)).</p></div>
    <div id="dp-res"></div>
    <p class="muted" style="font-size:12px">${esc(d.note)} 정산 명세(15분)가 게시된 날은 명세 값, 그 뒤 최근 날은 수집한 계획·입찰·계량으로 계산합니다. 세 값(낙찰·최종입찰·급전지시)이 모두 있는 칸만 비교하며, 충족률이 낮은 날은 수집이 빠진 날입니다.</p>`;
  const host = root.querySelector('#dp-res');
  RS.forEach((R, i) => {
    const id = `dp${i}`;
    if (R.empty || !R.kpi || !R.kpi.coverage) {
      host.insertAdjacentHTML('beforeend', card({ title: R.label, body: emptyState(R.kind === '발전' ? '<span class="wait">⏳ 입찰·급전지시·15분 명세를 받는 중</span> — 발전사업자 계정 수집(gen_meter · gen_settle)이 채우면 나타납니다.' : '기간 안 자료 없음') }));
      return;
    }
    const k = R.kpi;
    host.insertAdjacentHTML('beforeend', `
      <p class="section-title">${esc(R.label)} <small class="muted">· 명세 ${R.stDays}일 · 계획 ${R.planDays}일 · 자료 충족 ${pct(k.coverage, 0)}</small></p>
      ${tiles([
        { label: '낙찰 (하루전 계획)', value: num(k.poaMwh, 1), unit: 'MWh', trend: R.daily.map((x) => x.poaMwh) },
        { label: '급전지시', value: num(k.spMwh, 1), unit: 'MWh', delta: `낙찰 대비 ${pct(k.dispRate)}`, trend: R.daily.map((x) => x.spMwh) },
        { label: '실제 발전', value: num(k.mwh, 1), unit: 'MWh', delta: k.spMwh ? `급전지시 대비 ${pct(k.mwh / k.spMwh)}` : '' },
        { label: '① 변경입찰로 줄인 몫 (우리)', value: num(k.bidDown, 1), unit: 'MWh', delta: `늘린 몫 ${num(k.bidUp, 1)} MWh` },
        { label: '② 감축 지시 (거래소)', value: num(k.cutPra, 2), unit: 'MWh', delta: `${k.cutQ}칸 · 최종입찰의 ${pct(k.cutRate, 2)}`, deltaDir: k.cutPra > 0 ? 'down' : '' },
        { label: '감축으로 놓친 수익 (상한)', value: wonC(k.lostWon), unit: '원', delta: '감축량 × 그때 실시간 SMP' },
        { label: `정산 임밸런스 (명세 ${k.stlDays}일)`, value: wonC(k.imbp), unit: '원', delta: `정산 합계 ${wonC(k.total)}원 중 ${k.total ? pct(-k.imbp / (k.total - k.imbp)) : '—'}`, deltaDir: k.imbp < 0 ? 'down' : '', trend: R.daily.map((x) => x.imbp) },
      ])}
      <div class="grid g21">
        ${card({ title: '일별 — 낙찰 · 최종입찰 · 급전지시', sub: 'MWh (세 값이 모두 있는 칸 기준 · 실제 발전은 아래 표)', body: `<div id="${id}-day" class="chart"></div>` })}
        ${card({ title: '낙찰 대비 감소의 원인', sub: '① 변경입찰(우리) vs ② 감축 지시(거래소) — 일별 MWh', body: `<div id="${id}-why" class="chart"></div>` })}
      </div>
      <div class="grid g21">
        ${card({ title: `${esc(R.last.d ?? '')} 15분`, sub: '낙찰 · 최종입찰 · 급전지시 · 실제 출력 (MW)', body: `<div id="${id}-last" class="chart"></div>` })}
        ${card({ title: '감축 지시가 잦은 시간', sub: '기간 합계 — 급전지시 < 최종입찰 (MWh)', body: `<div id="${id}-hour" class="chart"></div>` })}
      </div>
      <div class="grid g2">
        ${card({ title: '날마다', body: table([
          { k: 'd', label: '날짜', fmt: (v) => md(v) }, { k: 'src', label: '근거', fmt: (v) => (v === '명세' ? badge('good', '명세') : badge('info', '계획')) },
          { k: 'poaMwh', label: '낙찰', n: true, fmt: (v) => num(v, 1) }, { k: 'praMwh', label: '최종입찰', n: true, fmt: (v) => num(v, 1) },
          { k: 'spMwh', label: '급전지시', n: true, fmt: (v) => num(v, 1) }, { k: 'mwh', label: '발전', n: true, fmt: (v) => num(v, 1), cls: signCls },
          { k: 'bidDown', label: '①변경입찰↓', n: true, fmt: (v) => num(v, 1) }, { k: 'cutPra', label: '②감축 지시', n: true, fmt: (v) => (v > 0 ? badge('warning', num(v, 2)) : num(v, 2)) },
          { k: 'lostWon', label: '놓친 수익', n: true, fmt: won }, { k: 'imbp', label: '임밸런스', n: true, fmt: won, cls: signCls }, { k: 'coverage', label: '충족', n: true, fmt: (v) => pct(v, 0) },
        ], R.daily.slice().reverse()) })}
        ${card({ title: '감축 지시가 컸던 시간 · 입찰 이력', body: `${R.top.length ? table([
          { k: 't', label: '시각', fmt: (v) => esc(v.slice(5)) }, { k: 'pra', label: '최종입찰 MW', n: true, fmt: (v) => num(v, 3) }, { k: 'sp', label: '급전지시 MW', n: true, fmt: (v) => num(v, 3) },
          { k: 'cut', label: '감축 MWh', n: true, fmt: (v) => num(v, 3) }, { k: 'rt', label: 'SMP', n: true, fmt: (v) => num(v, 1) }, { k: 'won', label: '놓친 수익', n: true, fmt: won },
        ], R.top) : '<p class="muted">기간 중 감축 지시 없음</p>'}
          <h2 style="margin-top:14px">변경입찰 이력</h2><p class="sub">날마다 마지막 차수 · 제출한 차수 수 · 마지막 변경 시각</p>
          ${R.bids.length ? table([{ k: 'd', label: '거래일', fmt: (v) => md(v) }, { k: 'rv', label: '마지막 차수', n: true }, { k: 'n', label: '차수 수', n: true }, { k: 'last', label: '마지막 변경' }], R.bids.slice().reverse().slice(0, 14)) : '<p class="muted">입찰 자료 없음</p>'}` })}
      </div>
      ${diagHtml(R, id)}`);
    if (R.diag && !R.diag.error && R.diag.totals?.quarters) drawDiag(host, R, id);
    const x = R.daily.map((r) => md(r.d));
    const s1 = [
      { name: '낙찰', values: R.daily.map((r) => r.poaMwh), color: 'var(--s3)', dash: true },
      { name: '최종입찰', values: R.daily.map((r) => r.praMwh), color: 'var(--s2)' },
      { name: '급전지시', values: R.daily.map((r) => r.spMwh), color: 'var(--s1)' },
    ];
    const e1 = host.querySelector(`#${id}-day`);
    e1.insertAdjacentHTML('beforebegin', legendHtml(s1));
    lineChart(e1, { x, series: s1, yFmt: (v) => num(v, 0), tipFmt: (v) => `${num(v, 2)} MWh`, height: 230 });
    const s2 = [
      { name: '① 변경입찰로 줄임', values: R.daily.map((r) => r.bidDown), color: 'var(--s2)' },
      { name: '② 감축 지시', values: R.daily.map((r) => r.cutPra), color: 'var(--s8)' },
    ];
    const e2 = host.querySelector(`#${id}-why`);
    e2.insertAdjacentHTML('beforebegin', legendHtml(s2, 'bar'));
    barChart(e2, { x, series: s2, yFmt: (v) => num(v, 0), tipFmt: (v) => `${num(v, 2)} MWh`, height: 230 });
    const L = R.last.slots;
    const s3 = [
      { name: '낙찰', values: L.map((s) => s.poa), color: 'var(--s3)', dash: true },
      { name: '최종입찰', values: L.map((s) => s.pra), color: 'var(--s2)' },
      { name: '급전지시', values: L.map((s) => s.sp), color: 'var(--s1)' },
    ];
    const e3 = host.querySelector(`#${id}-last`);
    e3.insertAdjacentHTML('beforebegin', legendHtml([...s3, { name: '실제 출력', color: 'var(--muted)' }]));
    lineChart(e3, { x: L.map((s) => s.t), series: [...s3, { name: '실제 출력', values: L.map((s) => s.mw), color: 'var(--muted)', width: 1.5 }], yFmt: (v) => num(v, 1), tipFmt: (v) => (v == null ? '—' : `${num(v, 3)} MW`), height: 230 });
    barChart(host.querySelector(`#${id}-hour`), { x: R.byHour.map((h) => String(h.h).padStart(2, '0')), series: [{ name: '감축 지시', values: R.byHour.map((h) => h.cutPra), color: 'var(--s8)' }], yFmt: (v) => num(v, 2), tipFmt: (v) => `${num(v, 3)} MWh`, height: 230, xEvery: 3 });
  });
}

// 단독 자원(급전가능 재생) 불균형 원인 — 정산대금 기준 1순위 (2026-10-22)
function diagHtml(R, id) {
  const D = R.diag;
  if (!D) return '';
  if (D.error) return card({ title: `${esc(R.gen)} 불균형 원인`, body: emptyState(esc(D.error)) });
  const T = D.totals; const top = D.kinds[0];
  if (!T.quarters) return '';
  const C = D.check;
  return `
    <p class="section-title">${esc(R.gen)} 불균형정산금 원인 <small class="muted">· 허용오차를 넘은 15분 칸을 '지시 상황 × 방향'으로 나눔 · 금액은 정산 명세 기준</small></p>
    ${tiles([
      { label: '불균형정산금 (기간)', value: wonC(T.amt), unit: '원', delta: T.estimated ? `확정 ${wonC(T.settled)} · 추정 ${wonC(T.estimated)}` : '모두 정산 확정분', deltaDir: T.amt < 0 ? 'down' : '' },
      { label: '허용오차 넘은 15분', value: pct(T.exceedRate, 0), delta: `${num(T.exceeded, 0)} / ${num(T.quarters, 0)}칸` },
      { label: '공급가능용량(PRA) ÷ 실제 발전', value: `${num(T.praRatio, 2)}배`, delta: `하루전 계획 ${num(T.poaRatio, 2)}배 · 급전지시 ${num(T.spRatio, 2)}배`, deltaDir: (T.praRatio ?? 1) > 1.2 ? 'down' : '' },
      { label: '가장 큰 원인', value: pct(top?.share, 0), delta: top ? esc(top.label) : '' },
      { label: '정산 산식 대조', value: C?.rate == null ? '—' : pct(C.rate, 1), delta: `확정 ${num(C?.hours ?? 0, 0)}시간 · 전력량·용량 일치${C?.imbHours ? ` · 불균형 ${pct(C.imbRate, 0)}(${C.imbHours}시간)` : ' · 불균형은 15분 명세 있는 시간만'}` },
    ])}
    <div class="grid g21">
      ${card({ title: '원인별 금액', sub: '정상 지시 = 급전지시가 최종입찰과 같음 · 감발 = 거래소가 덜 돌리라고 함', body: table([
        { k: 'label', label: '원인' }, { k: 'q', label: '15분 칸', n: true, fmt: (v) => num(v, 0) },
        { k: 'mwh', label: '허용 넘은 MWh', n: true, fmt: (v) => num(v, 1) }, { k: 'amt', label: '금액', n: true, fmt: won, cls: signCls },
        { k: 'share', label: '비중', n: true, fmt: (v) => (v == null ? '—' : pct(v, 1)) }, { k: 'fix', label: '대응' },
      ], D.kinds), note: '정상 지시·발전 부족 = 바람이 예측보다 덜 불었는데 공급가능용량을 그대로 둔 몫 → 예측 발전량에 맞춰 PRA 를 낮추거나 변경입찰하면 피할 수 있습니다(별표4 6.4.2.1 공급가능용량 = 예측발전량).' })}
      ${card({ title: '달별 불균형정산금', sub: '백만원', body: `<div id="${id}-dm" class="chart"></div>` })}
    </div>
    <div class="grid g21">
      ${card({ title: '시간대별 불균형정산금', sub: '기간 합계 · 원', body: `<div id="${id}-dh" class="chart"></div>` })}
      ${card({ title: '불균형이 컸던 날', body: table([
        { k: 'd', label: '거래일', fmt: (v) => md(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}`) },
        { k: 'pra', label: 'PRA MWh', n: true, fmt: (v) => num(v, 1) }, { k: 'mgo', label: '발전 MWh', n: true, fmt: (v) => num(v, 1) },
        { k: 'ratio', label: 'PRA÷발전', n: true, fmt: (v) => (v == null ? '—' : `${num(v, 2)}배`) }, { k: 'amt', label: '불균형', n: true, fmt: won, cls: signCls },
      ], D.worst) })}
    </div>`;
}
function drawDiag(host, R, id) {
  const D = R.diag;
  const em = host.querySelector(`#${id}-dm`);
  if (em) barChart(em, { x: D.byMonth.map((m) => `${m.ym.slice(2, 4)}.${m.ym.slice(4)}`), series: [{ name: '불균형정산금', values: D.byMonth.map((m) => Math.round(m.amt / 1e4) / 100), color: 'var(--s8)' }], stacked: false, yFmt: (v) => num(v, 0), tipFmt: (v) => `${num(v, 2)} 백만원`, height: 200 });
  const eh = host.querySelector(`#${id}-dh`);
  if (eh) barChart(eh, { x: D.byHour.map((h) => String(h.h).padStart(2, '0')), series: [{ name: '불균형정산금', values: D.byHour.map((h) => h.amt), color: 'var(--s8)' }], stacked: false, yFmt: (v) => wonC(v), tipFmt: (v) => `${won(v)}원`, height: 200, xEvery: 3 });
}
