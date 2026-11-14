// ② 전력시장 — 제주 가격·수요·예비력
import { lineChart, barChart, heatmap, hbars, legendHtml, divColor, rangeColor } from '../charts.mjs';
import { tiles, card, num, pct, price, md, emptyState } from '../ui.mjs';

const H24 = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}시`);

export function render(root, d) {
  const k = d.kpi;
  const daily = d.daily;
  root.innerHTML = `
    ${tiles([
      { label: '평균 실시간 SMP', value: price(k.rtAvg), unit: '원/kWh', delta: `하루전 평균 ${price(k.daAvg)}`, trend: daily.map((x) => x.rtAvg) },
      { label: '실시간 최고 · 최저', value: `${num(k.rtMax, 0)} / ${num(k.rtMin, 0)}`, unit: '원/kWh', delta: `변동성(표준편차) ${price(k.volatility)}` },
      { label: '마이너스 SMP', value: `${k.negQ}`, unit: '칸 (15분)', delta: `${k.negDays}일 발생 · 전체 ${k.slots ? pct(k.negQ / k.slots) : '—'}`, deltaDir: k.negQ ? 'down' : '', trend: daily.map((x) => x.negQ), color: 'var(--s8)' },
      { label: '주파수제어 예비력가격', value: price(k.fcrAvg), unit: '원/kWh', delta: d.hasReserve ? '실시간시장 평균' : '수집 중', trend: daily.map((x) => x.fcr) },
      { label: '제주 수요 최대', value: num(k.demPeak, 0), unit: 'MW', delta: d.hasDemand ? `평균 ${num(k.demAvg, 0)} MW` : '수집 중', trend: daily.map((x) => x.demMax) },
    ])}
    ${card({ title: '일별 SMP', sub: '실시간 평균 · 하루전 평균 · 실시간 최저~최고 범위 (원/kWh)', body: '<div id="mk-daily" class="chart"></div>' })}
    <div class="grid g21">
      ${card({ title: '실시간 SMP 열 지도 — 날짜 × 시간', sub: '파랑이 진할수록 비싸고, 빨강은 0 이하(마이너스) 가격', body: '<div id="mk-heat"></div><div class="scale" id="mk-scale"></div>' })}
      ${card({ title: '마이너스 SMP 가 잦은 시간', sub: '그 시간대 15분 중 SMP ≤ 0 비율', body: '<div id="mk-neg" class="chart"></div>', note: '태양광이 많은 한낮에 몰립니다 — ESS 충전·출력 제한으로 손실을 피할 수 있는 시간입니다.' })}
    </div>
    <div class="grid g2">
      ${card({ title: '시간대별 평균 가격', sub: '기간 평균 — 언제 비싸고 언제 싼가 (원/kWh)', body: '<div id="mk-prof" class="chart"></div>' })}
      ${card({ title: '예비력가격', sub: '실시간시장 주파수제어 · 1차 예비력 일 평균 (원/kWh)', body: d.hasReserve ? '<div id="mk-rsv" class="chart"></div>' : emptyState('예비력가격 수집 중 — 잠시 뒤 다시 보세요.') })}
    </div>
    <div class="grid g2">
      ${card({ title: '제주 수요 실적', sub: '일 평균 · 일 최대 (MW)', body: d.hasDemand ? '<div id="mk-dem" class="chart"></div>' : emptyState('지역별 수요실적 수집 중') })}
      ${card({ title: '가격결정 발전기 (실시간)', sub: '기간 중 실시간 SMP 를 정한 횟수 — 상위 8', body: d.clearing.length ? '<div id="mk-clr"></div>' : emptyState('자료 없음') })}
    </div>`;
  const x = daily.map((r) => md(r.d));
  const s1 = [
    { name: '실시간 평균', values: daily.map((r) => r.rtAvg), color: 'var(--s1)' },
    { name: '하루전 평균', values: daily.map((r) => r.daAvg), color: 'var(--s2)', dash: true },
  ];
  const el1 = root.querySelector('#mk-daily');
  el1.insertAdjacentHTML('beforebegin', legendHtml(s1));
  lineChart(el1, { x, series: s1, band: { lo: daily.map((r) => r.rtMin), hi: daily.map((r) => r.rtMax), name: '실시간 최저~최고' }, yFmt: (v) => num(v, 0), tipFmt: (v) => (v == null ? '—' : `${price(v)} 원/kWh`), height: 240 });
  const rt = d.heat.rt;
  const maxP = Math.max(...rt.flat().filter((v) => v != null), 1);
  const minP = Math.min(...rt.flat().filter((v) => v != null), 0);
  const posv = rt.flat().filter((v) => v != null && v > 0).sort((a, b) => a - b);
  const pLo = posv.length ? posv[Math.floor(posv.length * 0.05)] : 0;
  heatmap(root.querySelector('#mk-heat'), { rows: d.days.map(md), cols: H24.map((h, i) => (i % 3 === 0 ? h.slice(0, 2) : '')), values: rt, colorOf: (v) => (v <= 0 ? divColor(v, maxP, minP) : rangeColor(v, pLo, maxP)), fmt: (v) => (v == null ? '자료 없음' : `${price(v)} 원/kWh`), rowLabelW: 44 });
  root.querySelector('#mk-scale').innerHTML = `<span>0 이하</span><span class="bar" style="width:40px;background:linear-gradient(90deg,var(--neg-4),var(--neg-1))"></span><span>${num(pLo, 0)}</span><span class="bar" style="background:linear-gradient(90deg,var(--seq-1),var(--seq-3),var(--seq-5))"></span><span>${num(maxP, 0)} 원/kWh</span>`;
  barChart(root.querySelector('#mk-neg'), { x: H24.map((h) => h.slice(0, 2)), series: [{ name: '마이너스 비율', values: d.profile.negShare, color: 'var(--s8)' }], yFmt: (v) => `${Math.round(v * 100)}%`, tipFmt: (v) => pct(v), height: 220, xEvery: 3 });
  const s2 = [
    { name: '실시간', values: d.profile.rt, color: 'var(--s1)' },
    { name: '하루전', values: d.profile.da, color: 'var(--s2)', dash: true },
  ];
  const el2 = root.querySelector('#mk-prof');
  el2.insertAdjacentHTML('beforebegin', legendHtml(s2));
  lineChart(el2, { x: H24, series: s2, yFmt: (v) => num(v, 0), tipFmt: (v) => `${price(v)} 원/kWh`, height: 220, xEvery: 3 });
  if (d.hasReserve) {
    const s3 = [
      { name: '주파수제어', values: daily.map((r) => r.fcr), color: 'var(--s1)' },
      { name: '1차', values: daily.map((r) => r.primary), color: 'var(--s2)' },
    ];
    const el3 = root.querySelector('#mk-rsv');
    el3.insertAdjacentHTML('beforebegin', legendHtml(s3));
    lineChart(el3, { x, series: s3, yFmt: (v) => num(v, 1), tipFmt: (v) => `${price(v)} 원/kWh`, height: 220 });
  }
  if (d.hasDemand) {
    const s4 = [
      { name: '일 최대', values: daily.map((r) => r.demMax), color: 'var(--s1)' },
      { name: '일 평균', values: daily.map((r) => r.demAvg), color: 'var(--s2)', dash: true },
    ];
    const el4 = root.querySelector('#mk-dem');
    el4.insertAdjacentHTML('beforebegin', legendHtml(s4));
    lineChart(el4, { x, series: s4, yFmt: (v) => num(v, 0), tipFmt: (v) => `${num(v, 0)} MW`, height: 220 });
  }
  if (d.clearing.length) hbars(root.querySelector('#mk-clr'), d.clearing.map((c) => ({ label: c.gen_nm || '—', value: c.n })), { fmt: (v) => `${v}회` });
}
