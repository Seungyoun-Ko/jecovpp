// RPCF 관리 — 용량정산금 성과계수: 입찰기여도·이행기여도 → 다음 계수 → 용량정산금
// 근거: 비용평가세부운영규정 제28장
//   입찰기여도 = 1 − Σ|초기입찰(POA) − 최종변경입찰(PRA)| ÷ Σ설비용량 · 이행기여도 = 1 − Σ|급전지시(SP) − 계량| ÷ Σ설비용량 (28.4.2·28.4.3)
//   이용률 1.5% 미만 · 급전지시 > 최종입찰 시간은 뺀다 · 미보정 RPCF = −0.3(순위−N)/(N−1) + 0.85 (28.4.4) · 자원기여도 60% 미만 또는 하나라도 40% 미만이면 0 (28.4.7)
import { lineChart, legendHtml, barChart } from '../charts.mjs';
import { tiles, card, table, esc, num, pct, wonC, badge, emptyState } from '../ui.mjs';

const dd = (s) => (s ? `${s.slice(2, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}` : '—');

export function render(root, d) {
  const C = d.cur; const ref = d.ref;
  if (!d.resources?.length) { root.innerHTML = emptyState('정산명세가 있는 자원이 없습니다.'); return; }
  const prog = C.daysDone / C.daysAll;
  root.innerHTML = `
    <div class="alert info"><span class="ai">i</span><div><b>지금 산정대상기간 ${esc(C.label)}</b> ${badge('info', `${C.daysDone} / ${C.daysAll}일 (${pct(prog, 0)})`)}
      <div>${dd(C.from)} ~ ${dd(C.to)} 의 입찰·이행 성적으로 ${dd(C.apply.from)} 부터 6개월 계수가 정해집니다. 남은 ${C.daysAll - C.daysDone}일 동안 바꿀 수 있습니다.
      ${ref ? ` 제주 ${esc(ref.round)}: ${ref.n}개 자원 ${num(ref.min, 4)}~${num(ref.max, 4)} · 집합 평균 ${num(ref.aggAvg, 4)} · 개별 평균 ${num(ref.indAvg, 4)}.` : ''}</div></div></div>
    ${d.resources.map((x, i) => resourceBlock(x, i, d)).join('')}
    ${card({
      title: '과거 기여도 → 받은 계수',
      sub: '산정대상기간마다 우리 자원의 자원기여도와 그 결과로 받은 RPCF — 중개 집합자원은 구성이 바뀌며 이름이 바뀐 기간(U086·U096)도 이어 봅니다',
      body: d.pts.length ? table([
        { k: 'gen', label: '자원' }, { k: 'label', label: '산정기간 → 적용' },
        { k: 'res', label: '자원기여도', n: true, fmt: (v) => pct(v, 1) }, { k: 'rpcf', label: '받은 RPCF', n: true, fmt: (v) => num(v, 4) },
      ], d.pts) : emptyState('짝을 이룰 과거 기간이 아직 없습니다.'),
      note: d.fit ? `직선: RPCF ≈ ${num(d.fit.a, 3)} + ${num(d.fit.b, 3)} × 자원기여도 (${d.fit.n}점). 기여도 1%p ≈ 계수 ${num(d.fit.b / 100, 4)}. 순위 경쟁이라 다른 자원도 좋아지면 같은 기여도로 계수가 낮아질 수 있습니다 — 방향을 보는 참고값입니다.` : '점이 3개 미만이라 직선을 긋지 않았습니다.',
    })}
    ${card({ title: '읽는 법', body: `<div class="rule">
      <div><b>입찰기여도</b> — 하루전 입찰(POA)과 최종 변경입찰(PRA)이 얼마나 같은가. 하루전 예측이 맞을수록, 변경입찰을 덜 할수록 높습니다.</div>
      <div><b>이행기여도</b> — 급전지시(SP)와 실제 계량이 얼마나 같은가. 급전지시는 최종입찰(PRA)을 따라가므로 <b>PRA 를 실제보다 높게 내면 이행기여도가 떨어집니다</b> (임밸런스 벌점과 같은 원인).</div>
      <div><b>둘을 함께 올리려면</b> 하루전 입찰부터 실제에 가깝게 내야 합니다 — PRA 만 낮추면 |PRA−POA| 가 커져 입찰기여도가 떨어집니다. 하루전 예측(KIM, [발전량 예측] 탭)과 단기 예측(:25 계량 수집)을 함께 씁니다.</div>
      <div><b>금액</b> — 용량정산금 = 실효용량 × 기준용량가격 × RPCF. 'RPCF 0.01' 금액은 최근 명세의 용량정산금 ÷ RPCF 를 연으로 환산한 값입니다.</div>
      <div><b>한계</b> — 다른 자원의 성적과 보정계수는 공개되지 않아 순위·다음 계수는 추정입니다. 명세 전 날짜는 수집한 계획·입찰·계량으로 계산해 명세와 조금 다를 수 있습니다.</div></div>` })}`;
  d.resources.forEach((x, i) => drawResource(root, x, i));
}

function resourceBlock(x, i, d) {
  const c = x.cur; const w = x.whatIf; const prev = x.wins.find((y) => !y.current && y.res != null);
  const floor = x.floor ? (x.floor.ok ? badge('good', '하한(60%·40%) 통과') : badge('critical', '하한 미달 — 계수 0 위험')) : badge('na', '자료 없음');
  const weak = c.n ? (c.perf < c.bid ? '이행기여도' : '입찰기여도') : null;
  return `
    <h3 class="sec">${esc(x.label)} · 설비용량 ${num(x.cap, 1)} MW</h3>
    ${tiles([
      { label: '지금 적용 계수', value: x.rpcfNow == null ? '—' : num(x.rpcfNow, 4), delta: x.rankEst ? `순위 추정 ${x.rankEst}위 / ${d.ref?.n ?? 30} (보정계수 1 가정) · 1.0 까지 ${wonC(x.toOne)}원/년` : '', deltaDir: x.rpcfNow != null && x.rpcfNow < 1 ? 'down' : '' },
      { label: '이번 기간 입찰기여도', value: pct(c.bid, 1), delta: prev ? `지난 기간 ${pct(prev.bid, 1)} · 손실 Σ|PRA−POA| ${num(c.bidLoss, 0)} MWh` : '', deltaDir: prev && c.bid != null ? (c.bid >= prev.bid ? 'up' : 'down') : '' },
      { label: '이번 기간 이행기여도', value: pct(c.perf, 1), delta: prev ? `지난 기간 ${pct(prev.perf, 1)} · 손실 Σ|SP−계량| ${num(c.perfLoss, 0)} MWh` : '', deltaDir: prev && c.perf != null ? (c.perf >= prev.perf ? 'up' : 'down') : '' },
      { label: '자원기여도 · 하한', value: pct(c.res, 1), delta: `${floor} · 산정 ${c.n}시간 · 명세 ${dd(c.lastStl)}까지`, deltaDir: prev && c.res != null ? (c.res >= prev.res ? 'up' : 'down') : '' },
      { label: '다음 계수 (참고)', value: x.proj == null ? '—' : num(x.proj, 3), delta: x.proj != null && x.rpcfNow != null ? `지금보다 ${x.proj >= x.rpcfNow ? '+' : ''}${num(x.proj - x.rpcfNow, 3)} ≈ ${wonC((x.proj - x.rpcfNow) * 100 * (x.wonPerPt ?? 0))}원/년` : '과거 짝 3개 이상일 때', deltaDir: x.proj != null && x.rpcfNow != null ? (x.proj >= x.rpcfNow ? 'up' : 'down') : '' },
      { label: '계수 0.01 의 값', value: wonC(x.wonPerPt), unit: '원/년', delta: '용량정산금 ÷ RPCF 연환산' },
    ])}
    <div class="grid g21">
      ${card({ title: '날마다 기여도 — 이번 산정기간', sub: `실선 = 정산명세 · 명세 전 날짜는 수집 자료 추정${weak ? ` · 약한 쪽: <b>${weak}</b>` : ''}`, body: `<div class="chart" id="rp-daily-${i}"></div>` })}
      ${card({ title: '시간대별 손실 (설비용량 대비)', sub: '막대가 긴 시간을 먼저 고칩니다 — 입찰 = |PRA−POA|, 이행 = |SP−계량|', body: `<div class="chart" id="rp-hour-${i}"></div>`,
        note: w ? `참고 — 하루전·최종 입찰을 실제 발전 수준(지금의 ${pct(w.c, 0)})으로 같은 비율만큼 낮췄다면: 입찰 ${pct(w.bid, 1)} · 이행 ${pct(w.perf, 1)} · 자원기여도 ${pct(w.res, 1)} (지금 ${pct(c.res, 1)}). 급전지시가 입찰을 따라 내려간다고 가정한 단순 계산.` : '' })}
    </div>
    <div class="grid g2">
      ${card({ title: '산정기간별 성적', body: table([
        { k: 'label', label: '산정기간 → 적용', fmt: (v, r) => `${esc(v)}${r.current ? ` ${badge('info', '진행 중')}` : ''}${r.gen && r.gen !== x.gen ? ` <small class="muted">(${esc(r.gen)})</small>` : ''}` },
        { k: 'n', label: '산정 시간', n: true },
        { k: 'bid', label: '입찰', n: true, fmt: (v) => pct(v, 1) },
        { k: 'perf', label: '이행', n: true, fmt: (v) => pct(v, 1) },
        { k: 'res', label: '자원', n: true, fmt: (v) => pct(v, 1) },
        { k: 'rpcf', label: '받은 계수', n: true, fmt: (v, r) => (v == null ? (r.current ? '<span class="muted">산정 전</span>' : '—') : num(v, 4)) },
      ], x.wins), note: `제외: 이용률 1.5% 미만 ${x.excluded.lowUtil}시간 · 급전지시>최종입찰 ${x.excluded.overSp}시간 (이번 기간).` })}
      ${card({ title: '받은 계수 · 용량정산금 (월별)', body: table([
        { k: 'ym', label: '월', fmt: (v) => `${v.slice(0, 4)}.${v.slice(4)}` },
        { k: 'rpcf', label: 'RPCF', n: true, fmt: (v) => num(v, 4) },
        { k: 'tpcp', label: '용량정산금', n: true, fmt: (v) => `${wonC(v)}원` },
        { k: 'days', label: '명세일', n: true },
      ], x.hist.slice().reverse().slice(0, 14)) })}
    </div>`;
}

function drawResource(root, x, i) {
  const D = x.daily;
  const el = root.querySelector(`#rp-daily-${i}`);
  if (el && D.length) {
    const isStl = (r) => r.src === '명세';
    const series = [
      { name: '입찰기여도', values: D.map((r) => (isStl(r) ? r.bid * 100 : null)), color: 'var(--s2)' },
      { name: '이행기여도', values: D.map((r) => (isStl(r) ? r.perf * 100 : null)), color: 'var(--s1)' },
      { name: '입찰 (명세 전 추정)', values: D.map((r, k) => (!isStl(r) || (D[k + 1] && !isStl(D[k + 1])) ? r.bid * 100 : null)), color: 'var(--s2)', dash: true },
      { name: '이행 (명세 전 추정)', values: D.map((r, k) => (!isStl(r) || (D[k + 1] && !isStl(D[k + 1])) ? r.perf * 100 : null)), color: 'var(--s1)', dash: true },
    ];
    el.insertAdjacentHTML('beforebegin', legendHtml(series));
    lineChart(el, { x: D.map((r) => r.d.slice(5)), series, yFmt: (v) => `${num(v, 0)}%`, tipFmt: (v) => (v == null ? '—' : `${num(v, 1)}%`), height: 230, xEvery: Math.max(1, Math.round(D.length / 10)) });
  } else if (el) el.innerHTML = emptyState('이번 기간 산정 시간이 아직 없습니다.');
  const H = x.byHour;
  const eh = root.querySelector(`#rp-hour-${i}`);
  if (eh) {
    const series = [
      { name: '입찰 손실 |PRA−POA|', values: H.map((h) => (h.bid == null ? null : h.bid * 100)), color: 'var(--s2)' },
      { name: '이행 손실 |SP−계량|', values: H.map((h) => (h.perf == null ? null : h.perf * 100)), color: 'var(--s1)' },
    ];
    eh.insertAdjacentHTML('beforebegin', legendHtml(series, 'bar'));
    barChart(eh, { x: H.map((h) => `${String(h.h).padStart(2, '0')}시`), series, stacked: true, yFmt: (v) => `${num(v, 0)}%`, tipFmt: (v) => `${num(v, 2)}% (설비용량 대비)`, height: 230, xEvery: 3 });
  }
}
