// ⑨ 하루전 SMP 예측 (입찰용) — 입찰 마감(D-1 11:00) 전에 내일 24시간 DA_MP
import { lineChart, legendHtml } from '../charts.mjs';
import { tiles, card, table, badge, num, pct, esc, emptyState } from '../ui.mjs';

const ymdDot = (d) => (d ? `${d.slice(4, 6)}.${d.slice(6)}` : '');
const hh = (h) => `${String(h).padStart(2, '0')}시`;

export function render(root, d) {
  const F = d.forecast; const T = d.track; const S = T.summary;
  if (F.error) {
    root.innerHTML = card({ title: `${ymdDot(d.target)} 예측을 만들 수 없습니다`, body: emptyState(esc(F.error)) });
    return;
  }
  const H = F.hours;
  const diff = F.avg - F.prevAvg;
  const bidDay = (() => { const t = new Date(`${F.target.slice(0, 4)}-${F.target.slice(4, 6)}-${F.target.slice(6)}T11:00:00+09:00`); t.setDate(t.getDate() - 1); return t; })();
  const left = Math.round((bidDay - Date.now()) / 60000);
  const leftTxt = left > 0 ? `입찰 마감까지 ${Math.floor(left / 60)}시간 ${left % 60}분` : '입찰 마감 지남 — 참고용';
  const up = H.filter((x) => x.pred - x.prev >= 5).map((x) => x.h);
  const down = H.filter((x) => x.pred - x.prev <= -5).map((x) => x.h);
  const negRisk = H.filter((x) => x.neg >= 0.1);
  const lastDone = T.days.at(-1);
  const tok = (() => { try { return sessionStorage.getItem('cms-token') || ''; } catch { return ''; } })();
  // 잠근 게시본에는 서버가 없으므로 같은 모양의 CSV 를 브라우저에서 만든다 (서버판 forecastCsv 와 같은 열)
  const csvHref = globalThis.CMS_STATIC
    ? URL.createObjectURL(new Blob([`﻿${[`거래일,${F.target}`, `방식,${F.method === 'demand' ? '육지 예측수요 반영' : '가격 이력'}`, `80% 범위,±${F.band}원/kWh`, '',
      '시간,예측(원/kWh),하한,상한,전날 실제,0원 이하 위험(최근30일),육지 예측수요(MW)',
      ...H.map((x) => [`${String(x.h).padStart(2, '0')}시`, x.pred, x.lo, x.hi, x.prev, x.neg, x.load ?? ''].join(',')),
      ['평균', F.avg, '', '', F.prevAvg, '', ''].join(',')].join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' }))
    : `/api/hub/daforecast.csv?target=${F.target}${tok ? `&token=${encodeURIComponent(tok)}` : ''}`;
  const snap = d.snapshot;
  const snapTxt = snap
    ? `${snap.frozen ? '<b>입찰 기준 예측 (고정)</b>' : '<b>지금까지 마지막 저장 예측</b>'} — ${esc(snap.madeAt.slice(5, 16).replace('T', ' '))} 저장 · 평균 ${num(snap.avg, 1)}원/kWh · ${snap.method === 'demand' ? '예측수요 반영' : '가격 이력'}${snap.frozen ? ` · ${esc(snap.cutoff.slice(5))} 마감 전 마지막 값` : ' · 11시 전까지 매시간 새로 저장되고, 마감 직전 값이 입찰 기준으로 고정됩니다'}`
    : '아직 저장된 예측이 없습니다 — 매시간 수집 작업이 저장합니다 (아래 값은 지금 계산한 예측).';
  root.innerHTML = `
    <div class="alert info"><span class="ai">◷</span><div>${snapTxt}<div style="margin-top:4px"><a href="${csvHref}" download="DA_SMP_forecast_${F.target}.csv">⬇ 시간별 예측 내려받기 (CSV · 엑셀에서 열림)</a></div></div></div>
    ${tiles([
      { label: '예측 거래일', value: ymdDot(F.target), delta: `${leftTxt} (${ymdDot(F.prevDay)} 11:00)` },
      { label: '예측 하루 평균 SMP', value: num(F.avg, 1), unit: '원/kWh', delta: `전날 실제 ${num(F.prevAvg, 1)} 대비 ${diff >= 0 ? '▲' : '▼'} ${num(Math.abs(diff), 1)}`, deltaDir: diff >= 0 ? 'up' : 'down', trend: H.map((x) => x.pred) },
      { label: '가장 비싼 시간', value: hh(F.peak), delta: `${num(H[F.peak].pred, 1)}원/kWh` },
      { label: '가장 싼 시간', value: hh(F.low), delta: `${num(H[F.low].pred, 1)}원/kWh` },
      { label: '예상 오차 (80%)', value: `±${num(F.band, 1)}`, unit: '원/kWh', delta: '시간별 · 하루 평균은 그 절반 정도' },
      { label: '예측 방식', value: F.method === 'demand' ? '예측수요 반영' : '가격 이력', delta: F.loadAvailable ? `육지 예측수요 ${esc((F.loadAt || '').slice(5, 16).replace('T', ' '))} 수신` : '내일 육지 예측수요 아직 없음' },
    ])}
    <div class="grid g21">
      ${card({ title: `${ymdDot(F.target)} 시간별 하루전 SMP 예측`, sub: '예측 · 80% 범위 · 전날 실제 (원/kWh)', body: '<div id="df-chart" class="chart"></div>', note: '제주 하루전 SMP 는 대부분 육지 SMP 와 같습니다(HVDC 가 가격 결정). 그래서 육지 하루전 예측수요의 변화로 내일 가격을 읽습니다. 공급 쪽 사고(발전기 고장 등)로 튀는 날은 맞히지 못합니다.' })}
      ${card({ title: '입찰 참고', body: `
        <dl class="kv">
          <dt>전날보다 5원 넘게 오를 시간</dt><dd>${up.length ? up.map(hh).join(', ') : '없음'}</dd>
          <dt>전날보다 5원 넘게 내릴 시간</dt><dd>${down.length ? down.map(hh).join(', ') : '없음'}</dd>
          <dt>제주 0원 이하 위험 시간</dt><dd>${negRisk.length ? negRisk.map((x) => `${hh(x.h)} ${badge('warning', pct(x.neg, 0))}`).join(' ') : '없음 (최근 30일)'}</dd>
        </dl>
        <div class="rule"><b>쓰는 법</b> 하루전 계획은 실제 예측 발전량에 맞추는 것이 원칙입니다 — 비싼 시간일수록 계획이 실제보다 크면, 모자란 만큼을 실시간 가격으로 사야 합니다. ESS 는 싼 시간에 충전·비싼 시간에 방전하도록 입찰 구간을 나눕니다. 0원 이하 위험 시간은 제주 안에서 가격이 정해지는 드문 시간이라 육지 예측으로는 안 보입니다 — 최근 30일 빈도입니다.</div>` })}
    </div>
    ${card({ title: '시간별 표', body: table([
      { k: 'h', label: '시간', fmt: (v) => hh(v) }, { k: 'prev', label: `전날(${ymdDot(F.prevDay)}) 실제`, n: true, fmt: (v) => num(v, 2) },
      { k: 'pred', label: '예측', n: true, fmt: (v) => `<b>${num(v, 2)}</b>` }, { k: (r) => `${num(r.lo, 1)} ~ ${num(r.hi, 1)}`, label: '80% 범위', n: true },
      { k: (r) => r.pred - r.prev, label: '변화', n: true, fmt: (v) => (v >= 5 ? badge('critical', `▲ ${num(v, 1)}`) : v <= -5 ? badge('good', `▼ ${num(-v, 1)}`) : num(v, 1)) },
      { k: 'neg', label: '0원 이하 위험', n: true, fmt: (v) => (v >= 0.1 ? badge('warning', pct(v, 0)) : pct(v, 0)) },
      { k: 'load', label: '육지 예측수요 MW', n: true, fmt: (v) => (v == null ? '—' : num(v, 0)) },
    ], H) })}
    <div class="grid g21">
      ${card({ title: '예측 정확도 — 최근 30일', sub: `입찰 마감 전 예측 vs 실제 하루전 SMP · 저장된 실시간 예측 ${S.live}일 + 그 전은 그 시점 자료로 다시 계산한 사후 검증`, body: `
        ${tiles([
          { label: '시간별 평균 오차', value: num(S.mae, 2), unit: '원/kWh', delta: `어제 가격 그대로 쓰면 ${num(S.perMae, 2)}` },
          { label: '하루 평균 가격 오차', value: num(S.dayErr, 2), unit: '원/kWh' },
          { label: '오르내림 적중', value: pct(S.dirHit, 0), delta: `${S.n}일` },
        ])}
        <div id="df-track" class="chart" style="margin-top:12px"></div>` })}
      ${card({ title: '육지 예측수요 공개 시각', sub: '거래일 전날 처음 받은 시각 — 입찰 마감(11:00) 전에 나오면 예측수요 반영 방식', body: d.publish.length ? table([
        { k: 'd', label: '거래일', fmt: ymdDot }, { k: 'first', label: '처음 받은 시각', fmt: (v) => esc(v.slice(5)) },
        { k: 'beforeBid', label: '입찰 전', fmt: (v, r) => (v ? badge('good', '입찰 전') : r.sameDayBefore ? badge('warning', '전날 11시 뒤') : badge('na', '과거 채움')) },
      ], d.publish.slice().reverse()) : emptyState('기록 없음'), note: '매시간 수집 기준이라 실제 공개는 표시보다 이를 수 있습니다. "과거 채움" = 나중에 한꺼번에 받은 날.' })}
    </div>
    ${lastDone ? card({ title: `최근 맞춰 본 날 — ${ymdDot(lastDone.d)} (${lastDone.live ? '입찰 전 저장 예측' : '사후 검증'} · ${lastDone.method === 'demand' ? '예측수요 반영' : '가격 이력'})`, sub: `시간별 평균 오차 ${num(lastDone.mae, 2)}원 · 어제 가격 그대로 ${num(lastDone.perMae, 2)}원`, body: '<div id="df-last" class="chart"></div>' }) : ''}`;
  const x = H.map((r) => hh(r.h));
  const s1 = [
    { name: '예측', values: H.map((r) => r.pred), color: 'var(--s1)' },
    { name: `전날 실제 (${ymdDot(F.prevDay)})`, values: H.map((r) => r.prev), color: 'var(--s2)', dash: true },
  ];
  const e1 = root.querySelector('#df-chart');
  e1.insertAdjacentHTML('beforebegin', legendHtml(s1));
  lineChart(e1, { x, series: s1, band: { lo: H.map((r) => r.lo), hi: H.map((r) => r.hi), name: '80% 범위' }, yFmt: (v) => num(v, 0), tipFmt: (v) => `${num(v, 2)} 원/kWh`, height: 260, xEvery: 3 });
  if (T.days.length) {
    const t2 = [
      { name: '실제 하루 평균', values: T.days.map((r) => r.actAvg), color: 'var(--s2)' },
      { name: '예측 하루 평균', values: T.days.map((r) => r.predAvg), color: 'var(--s1)', dash: true },
    ];
    const e2 = root.querySelector('#df-track');
    e2.insertAdjacentHTML('beforebegin', legendHtml(t2));
    lineChart(e2, { x: T.days.map((r) => ymdDot(r.d)), series: t2, yFmt: (v) => num(v, 0), tipFmt: (v) => `${num(v, 1)} 원/kWh`, height: 200 });
  }
  if (lastDone) {
    const s3 = [
      { name: '실제', values: lastDone.hours.map((r) => r.act), color: 'var(--s2)' },
      { name: '예측', values: lastDone.hours.map((r) => r.pred), color: 'var(--s1)', dash: true },
    ];
    const e3 = root.querySelector('#df-last');
    e3.insertAdjacentHTML('beforebegin', legendHtml(s3));
    lineChart(e3, { x: lastDone.hours.map((r) => hh(r.h)), series: s3, yFmt: (v) => num(v, 0), tipFmt: (v) => `${num(v, 2)} 원/kWh`, height: 200, xEvery: 3 });
  }
}
