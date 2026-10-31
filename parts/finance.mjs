// ⑤ 정산 · 수익
import { barChart, lineChart, legendHtml } from '../charts.mjs';
import { tiles, card, table, badge, num, pct, won, wonC, md, emptyState, signCls } from '../ui.mjs';

const ymL = (ym) => `${ym.slice(0, 4)}.${ym.slice(4)}`;

export function render(root, d) {
  const M = d.monthly;
  const agg = M.agg;
  const daily = d.daily;
  const sum = (k) => daily.reduce((a, x) => a + (x[k] ?? 0), 0);
  const tot = sum('total'); const mgo = sum('mgo'); const imb = sum('imbp');
  const rv = d.review;
  root.innerHTML = `
    ${tiles([
      { label: '중개 정산 합계 (기간, 명세)', value: wonC(tot), unit: '원', delta: `${daily.length}일 · 일평균 ${wonC(daily.length ? tot / daily.length : null)}원`, trend: daily.map((x) => x.total) },
      { label: '정산 단가', value: won(mgo > 0 ? tot / mgo : null), unit: '원/MWh', delta: `순발전 ${num(mgo, 1)} MWh` },
      { label: '임밸런스 비중', value: pct(tot ? -imb / (tot - imb) : null), delta: `${won(imb)}원`, deltaDir: imb < 0 ? 'down' : '' },
      { label: '용량정산금 비중', value: pct(tot ? sum('tpcp') / tot : null), delta: `${wonC(sum('tpcp'))}원 · 발전과 무관하게 붙는 몫` },
      { label: '정산 산식 대조', value: pct(rv?.matchRate), delta: rv ? `${rv.hours ?? 0}시간 중 어긋남 ${rv.bad ?? 0}` : '—' },
    ])}
    <div class="grid g21">
      ${card({ title: '월별 정산 구성 — 집합자원', sub: '에너지 · 용량 · 보전(MAP+MWP) 위, 임밸런스 아래 (원) · 유효 차수(수정 > 최종 > 초기)', body: '<div id="fi-month" class="chart"></div>' })}
      ${card({ title: '월별 정산 단가', sub: '정산 합계 ÷ 순발전 (원/MWh)', body: '<div id="fi-unit" class="chart"></div>', note: '3월 명세는 거래소 원본 손상으로 임밸런스가 0 으로 나옵니다.' })}
    </div>
    ${card({ title: '일별 정산 (명세 게시분)', sub: '기간 안 — 원', body: daily.length ? '<div id="fi-daily" class="chart"></div>' : emptyState('기간 안에 게시된 정산 명세가 없습니다 (초기정산은 약 D+8).') })}
    <div class="grid g2">
      ${card({ title: '월별 집합자원 실적', sub: '명세 단계: 초기 · 최종 · 수정 시간 수', body: table([
        { k: 'ym', label: '거래월', fmt: ymL }, { k: 'gen_id', label: '자원' }, { k: 'days', label: '일수', n: true },
        { k: 'mgo', label: '순발전 MWh', n: true, fmt: (v) => num(v, 1) }, { k: 'total', label: '정산 합계', n: true, fmt: won },
        { k: 'imbp', label: '임밸런스', n: true, fmt: won, cls: signCls }, { k: 'unit', label: '원/MWh', n: true, fmt: won },
        { k: 'imbQ', label: '임밸런스 15분', n: true }, { k: (r) => `${r.h02 || 0} · ${r.h03 || 0} · ${r.h04 || 0}`, label: '초기·최종·수정' },
      ], agg.slice().reverse()) })}
      ${card({ title: '회원(보유자원)별 월 발전량', sub: 'MWh — 빨간 0 은 계량은 오는데 발전이 없는 달', body: table([
        { k: 'name', label: '보유자원' }, { k: 'agg', label: '집합자원' },
        ...M.months.slice(-6).map((m) => ({ k: (r) => r.months[m]?.gen, label: `${m.slice(4)}월`, n: true, fmt: (v) => (v == null ? '' : v === 0 ? badge('critical', '0') : num(v, 1)) })),
      ], M.members) })}
    </div>
    <div class="grid g2">
      ${card({ title: 'JECO 직영 vs 중개 — 원/MWh', sub: '발전사업자(0600) 발전원별 월 실적과 같은 달 집합자원 단가', body: M.fleet.length ? table([
        { k: 'ym', label: '거래월', fmt: ymL }, { k: 'group', label: '발전원' }, { k: 'plants', label: '설비', n: true }, { k: 'gen', label: '발전 MWh', n: true, fmt: (v) => num(v, 1) },
        { k: 'util', label: '이용률', n: true, fmt: (v) => pct(v) }, { k: 'rev', label: '정산금', n: true, fmt: won }, { k: 'unit', label: '원/MWh', n: true, fmt: won },
        { k: (r) => agg.find((a) => a.ym === r.ym)?.unit, label: '중개 원/MWh', n: true, fmt: won },
      ], M.fleet.slice().reverse()) : emptyState('<span class="wait">⏳ 발전사업자 계정 자료 수집 전</span> — 수집이 시작되면 직영 설비와 중개 집합자원의 단가를 나란히 봅니다.') })}
      ${card({ title: '청구서 대사', sub: '정산 명세 합계 vs 거래소 청구요청서(받을 돈, 부가세 제외)', body: table([
        { k: 'ym', label: '거래월', fmt: ymL }, { k: (r) => `${r.mkpt} ${r.label}`, label: '거래자' }, { k: 'stl', label: '명세 합계', n: true, fmt: won },
        { k: 'noti', label: '청구요청서', n: true, fmt: (v) => (v == null ? '<span class="muted">없음</span>' : won(v)) },
        { k: 'diff', label: '차이', n: true, fmt: (v) => (v == null ? '' : Math.abs(v) > 1000 ? badge('critical', won(v)) : won(v)) },
        { k: 'fee', label: '거래수수료', n: true, fmt: won },
      ], M.recon.filter((x) => x.stl != null || x.noti != null).slice().reverse()), note: '중개사업자(9160) 청구서는 거래소 API 에서 0건 — 발전사업자(0600) 청구서는 수집 작업(gen_invoice)이 받습니다.' })}
    </div>
    ${rv?.months?.length ? card({ title: '수정정산 추적', sub: '최종 대비 수정 명세 (같은 날끼리 비교) · 실효용량(EA)', body: table([
      { k: 'ym', label: '거래월', fmt: ymL }, { k: 'gen', label: '자원' },
      { k: (r) => r.stages?.['03']?.ea ?? r.stages?.['02']?.ea, label: '최종 EA', n: true, fmt: (v) => num(v, 4) },
      { k: (r) => r.stages?.['04']?.ea, label: '수정 EA', n: true, fmt: (v) => num(v, 4) },
      { k: 'eaChange', label: 'EA 변화', n: true, fmt: (v) => pct(v), cls: signCls },
      { k: 'dTpcp', label: '용량정산금 차이', n: true, fmt: won, cls: signCls }, { k: 'dTotal', label: '정산총액 차이', n: true, fmt: won, cls: signCls },
      { k: 'revisedDays', label: '수정 일수', n: true },
    ], rv.months) }) : ''}`;
  const x = agg.map((a) => ymL(a.ym));
  const ms = [
    { name: '에너지', values: agg.map((a) => a.mep), color: 'var(--s1)' },
    { name: '용량', values: agg.map((a) => a.tpcp), color: 'var(--s2)' },
    { name: '보전', values: agg.map((a) => a.comp), color: 'var(--s3)' },
    { name: '임밸런스', values: agg.map((a) => a.imbp), color: 'var(--s8)' },
  ];
  const e1 = root.querySelector('#fi-month');
  e1.insertAdjacentHTML('beforebegin', legendHtml(ms, 'bar'));
  barChart(e1, { x, series: ms, yFmt: (v) => wonC(v), tipFmt: (v) => `${won(v)}원`, height: 250 });
  lineChart(root.querySelector('#fi-unit'), { x, series: [{ name: '원/MWh', values: agg.map((a) => a.unit), color: 'var(--s1)' }], yFmt: (v) => wonC(v), tipFmt: (v) => `${won(v)} 원/MWh`, height: 250 });
  if (daily.length) {
    const ds = [
      { name: '에너지', values: daily.map((a) => a.mep), color: 'var(--s1)' },
      { name: '용량', values: daily.map((a) => a.tpcp), color: 'var(--s2)' },
      { name: '보전', values: daily.map((a) => a.comp), color: 'var(--s3)' },
      { name: '임밸런스', values: daily.map((a) => a.imbp), color: 'var(--s8)' },
    ];
    const e2 = root.querySelector('#fi-daily');
    e2.insertAdjacentHTML('beforebegin', legendHtml(ds, 'bar'));
    barChart(e2, { x: daily.map((a) => md(a.d)), series: ds, yFmt: (v) => wonC(v), tipFmt: (v) => `${won(v)}원`, height: 230 });
  }
}
