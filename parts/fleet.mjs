// ④ 발전사업 — JECO 소유 설비 (발전사업자 계정, 거래자 0600)
import { lineChart, barChart, heatmap, legendHtml, seqColor } from '../charts.mjs';
import { tiles, card, table, badge, num, pct, won, wonC, md, esc, meter } from '../ui.mjs';

const GC = { 풍력: 'var(--s1)', 태양광: 'var(--s2)', ESS: 'var(--s3)' };
const ST = { 운전: 'good', 저가동: 'warning', '정지 의심': 'critical', '자료 대기': 'na' };

export function render(root, d) {
  const k = d.kpi;
  const wait = !d.hasData;
  root.innerHTML = `
    ${wait ? `<div class="alert info"><span class="ai">⏳</span><div><b>발전사업자 계정 자료 수집 전</b><div>JECO 소유 설비(거래자 0600) ${k.plants}곳 중 지금은 중개 집합자원에 속한 설비만 계량이 있습니다. 인터넷 PC 에서 <b>setup-gen-account.cmd</b> → <b>register-tasks.cmd</b> 를 실행하면 계량·정산·청구서가 쌓이고 이 화면이 저절로 채워집니다.</div></div></div>` : ''}
    ${tiles([
      { label: '설비', value: `${k.plants}`, unit: '곳', delta: `설비용량 ${num(k.cap, 1)} MW` },
      { label: '발전량 (기간)', value: num(k.gen, 1), unit: 'MWh', delta: 'ESS 는 방전량' },
      { label: '재생 평균 이용률', value: pct(k.util), delta: '자료 있는 풍력·태양광, 설비용량 가중' },
      { label: '정산금 (기간)', value: wonC(k.rev), unit: '원', delta: '발전사업자 명세 (U111 소속은 중개 정산)' },
      { label: '정지 의심', value: `${k.stopped}`, unit: '곳', deltaDir: k.stopped ? 'down' : '', delta: k.stopped ? '계량은 오는데 발전 0' : '없음' },
      { label: '자료 대기', value: `${k.waiting}`, unit: '곳', delta: wait ? '발전사업자 계정 수집 전' : '계량 미수신' },
    ])}
    <div class="grid g3">
      ${d.groups.map((g) => card({ title: g.group, sub: `${g.plants}곳 · ${num(g.cap, 1)} MW`, body: `
        <div class="hero" style="font-size:34px">${num(g.gen, 1)}<small style="font-size:14px;color:var(--muted);font-weight:500"> MWh</small></div>
        <dl class="kv" style="margin-top:8px">
          <dt>이용률</dt><dd>${pct(g.util)}</dd>
          <div style="grid-column:1/3">${meter(g.util, '')}</div>
          ${g.group === 'ESS' ? `<dt>충전</dt><dd>${num(g.pump, 1)} MWh</dd>` : ''}
          <dt>정산금</dt><dd>${won(g.rev)} 원</dd>
          <dt>상태</dt><dd>${g.stopped ? badge('critical', `정지 의심 ${g.stopped}`) : ''} ${g.waiting ? badge('na', `자료 대기 ${g.waiting}`) : ''} ${!g.stopped && !g.waiting ? badge('good', '정상') : ''}</dd>
        </dl>` })).join('')}
    </div>
    <div class="grid g2">
      ${card({ title: '일별 발전량 — 발전원별', sub: 'MWh (ESS 는 방전)', body: '<div id="fl-daily" class="chart"></div>' })}
      ${card({ title: '시간대별 평균 출력 — 발전원별', sub: 'MW (ESS 는 −충전 / +방전)', body: '<div id="fl-hour" class="chart"></div>' })}
    </div>
    ${card({ title: '발전소별 현황', sub: '이용률 = 발전량 ÷ (설비용량 × 계량 시간) · 가동률 = 설비의 1% 넘게 돈 15분 비율', body: '<div id="fl-tbl"></div>' })}
    ${card({ title: '발전소별 일 이용률', sub: '진할수록 이용률이 높음 · 빈칸은 자료 없음', body: '<div id="fl-heat"></div>' })}`;
  const x = d.days.map(md);
  const gs = d.groups.map((g) => ({ name: g.group, values: g.daily, color: GC[g.group] }));
  const e1 = root.querySelector('#fl-daily');
  e1.insertAdjacentHTML('beforebegin', legendHtml(gs, 'bar'));
  barChart(e1, { x, series: gs, yFmt: (v) => num(v, 0), tipFmt: (v) => `${num(v, 2)} MWh`, height: 230 });
  const hs = ['풍력', '태양광', 'ESS'].map((g) => ({ name: g, values: d.hourProfile.map((h) => h[g]), color: GC[g] }));
  const e2 = root.querySelector('#fl-hour');
  e2.insertAdjacentHTML('beforebegin', legendHtml(hs));
  lineChart(e2, { x: d.hourProfile.map((h) => `${String(h.h).padStart(2, '0')}시`), series: hs, yFmt: (v) => num(v, 1), tipFmt: (v) => (v == null ? '—' : `${num(v, 3)} MW`), height: 230, xEvery: 3 });
  root.querySelector('#fl-tbl').innerHTML = table([
    { k: 'group', label: '발전원', fmt: (v) => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${GC[v]};margin-right:6px"></span>${esc(v)}` },
    { k: 'name', label: '발전소' }, { k: 'cap', label: 'MW', n: true, fmt: (v) => num(v, 2) }, { k: 'aff', label: '소속' },
    { k: 'status', label: '상태', fmt: (v) => badge(ST[v] ?? 'na', v) },
    { k: 'gen', label: '발전 MWh', n: true, fmt: (v) => num(v, 1) },
    { k: 'util', label: '이용률', n: true, fmt: (v) => pct(v) },
    { k: 'util', label: '', fmt: (v) => `<div style="width:80px">${meter(v)}</div>` },
    { k: 'avail', label: '가동률', n: true, fmt: (v) => pct(v) },
    { k: 'recv', label: '계량 수신', n: true, fmt: (v) => pct(v, 0) },
    { k: 'rev', label: '정산금', n: true, fmt: won }, { k: 'unit', label: '원/MWh', n: true, fmt: won },
  ], d.plants);
  const maxU = Math.max(0.01, ...d.plants.flatMap((p) => p.daily.filter((v) => v != null)));
  heatmap(root.querySelector('#fl-heat'), { rows: d.plants.map((p) => p.name.replace(/발전소|발전/g, '')), cols: x, values: d.plants.map((p) => p.daily), colorOf: (v) => seqColor(v, maxU), fmt: (v) => (v == null ? '자료 없음' : `이용률 ${pct(v)}`), colEvery: Math.ceil(x.length / 10), rowLabelW: 130 });
}
