// ① 종합 상황판 — 지금 무슨 일이 일어나고 있나
import { lineChart, legendHtml } from '../charts.mjs';
import { tiles, card, esc, won, wonC, num, pct, mw, price, badge, meter, emptyState, table } from '../ui.mjs';

const ICON = { critical: '✕', serious: '!', warning: '!', info: 'i' };
const LEVEL = { critical: '위험', serious: '경고', warning: '주의', info: '안내' };

export function render(root, d) {
  const b = d.broker; const m = d.market; const f = d.fleet; const $ = d.money; const ck = b.check || {};
  const alerts = d.alerts.length
    ? d.alerts.map((a) => `<div class="alert ${a.level}"><span class="ai" aria-hidden="true">${ICON[a.level] ?? 'i'}</span><div><b>${esc(a.title)}</b> ${badge(a.level === 'info' ? 'info' : a.level, LEVEL[a.level])}<div>${esc(a.text)}</div></div></div>`).join('')
    : `<div class="alert info"><span class="ai">✓</span><div><b>경보 없음</b><div>입찰 구성·허용오차·마이너스 SMP 모두 정상입니다.</div></div></div>`;
  const stateBadge = b.hourState === '정상' ? badge('good', '이번 시간 정상') : b.hourState === '허용오차 초과' ? badge('critical', '이번 시간 허용오차 초과') : badge('na', b.hourState ?? '자료 대기');
  const F = d.fresh;
  const freshHtml = F ? `<div class="fresh">
      <b>자료 기준</b> <span class="muted">${globalThis.CMS_STATIC ? '게시 시점' : '지금'} ${esc(F.now.slice(5))}</span>
      ${F.items.map((x) => `<span class="fi"><span class="muted">${esc(x.k)}</span> ${esc(x.at)}${x.recv ? ` <small class="muted">(${esc(x.recv.slice(5))} 수신)</small>` : ''}</span>`).join('')}
      <span class="fi"><span class="muted">마지막 수집</span> ${F.lastRun ? esc(F.lastRun.slice(5)) : '—'} ${F.runLagMin != null && F.runLagMin > 90 ? badge('critical', `${Math.round(F.runLagMin / 60)}시간 전 — 수집 멈춤?`) : ''}${F.fail24 ? ` ${badge('warning', `24시간 실패 ${F.fail24}건`)}` : ''}</span>
    </div>` : '';
  const MH = d.meterHealth;
  root.innerHTML = `
    ${freshHtml}
    <div class="alerts">${alerts}</div>
    ${tiles([
      { label: `실시간 SMP (${m.rtNowAt ?? '—'})`, value: price(m.rtNow), unit: '원/kWh', delta: `오늘 평균 ${price(m.rtAvg)} · 하루전 ${price(m.daAvg)}`, trend: m.rt.map((x) => x.p) },
      { label: `${b.gen ?? '집합자원'} 현재 출력`, value: mw(b.mw), unit: 'MW', delta: `급전지시 ${mw(b.sp)} MW · 허용 ±${mw(b.tol)}` },
      { label: '오늘 허용오차 초과', value: `${b.excessQ}`, unit: '칸 (15분)', delta: `임밸런스 추정 ${won(b.imbp)}원`, deltaDir: b.excessQ ? 'down' : '' },
      { label: '오늘 순발전 · 정산 추정', value: num(b.mwh, 2), unit: 'MWh', delta: `${won(b.total)}원 (확정 전 추정 포함)` },
      { label: `이번 달 중개 정산 (${$.brokerDays}일)`, value: wonC($.broker), unit: '원', delta: `지난달 ${wonC($.brokerPrev)}원 · 명세 ${$.brokerLast ? `${$.brokerLast.slice(4, 6)}.${$.brokerLast.slice(6)}` : '—'}까지` },
      { label: '제주 수요 실적', value: num(m.demandNow, 0), unit: 'MW', delta: m.demandAt ? `${m.demandAt} 기준` : '수집 대기' },
    ])}
    <div class="grid g21">
      ${card({ title: `${b.gen ?? '집합자원'} 오늘 운영 — 15분`, sub: `발전 · 급전지시 · 허용오차 범위 · 하루전 계획 ${stateBadge}`, body: '<div id="ov-ops" class="chart"></div>', note: '급전지시 = 거래소가 15분마다 내는 실시간 목표출력(약 2시간 전부터 옴). 그 전 시간은 당일계획(점선)이며 낙찰량(하루전 계획 POA)과는 다릅니다. 빨간 눈금 = 허용오차를 넘은 15분. 범위 = 급전지시 ± ICDM×6% (실시간 SMP≤0 이면 1.5%).' })}
      ${card({ title: '입찰 · 회원 점검 (오늘)', sub: '정지 회원 몫까지 입찰하면 하루 내내 허용오차를 넘습니다', body: `
        <dl class="kv">
          <dt>입찰(POA) 최대</dt><dd>${mw(ck.poaMax)} MW</dd>
          <dt>가동 가능 용량</dt><dd>${mw(ck.activeCap)} MW</dd>
          <div style="grid-column:1/3">${meter(ck.activeCap ? ck.poaMax / ck.activeCap : null, ck.bidWarn ? 'critical' : 'good')}</div>
          <dt>판정</dt><dd>${ck.bidWarn ? badge('critical', '입찰 구성 경고') : badge('good', '정상')}</dd>
          <dt>정지 의심 회원</dt><dd>${ck.stopped ? `${badge('warning', ck.stopped)}` : '없음'}</dd>
          <dt>예측오차율</dt><dd>${pct(ck.fcErr)}</dd>
          <dt>마이너스 SMP 칸</dt><dd>${ck.negQ ?? 0}칸 · ${won(ck.negWon)}원</dd>
          <dt>계량 결측</dt><dd>${ck.missing ?? 0}칸</dd>
        </dl>` })}
    </div>
    <div class="grid g21">
      ${card({ title: '오늘 제주 SMP', sub: '실시간(15분) · 하루전(시간) — 원/kWh', body: '<div id="ov-price" class="chart"></div>' })}
      ${card({ title: 'JECO 설비 (발전사업자 0600) 오늘', sub: `U111 밖 ${f.plants}곳 · ${num(f.cap, 1)} MW`, body: f.hasData ? table([
        { k: 'group', label: '발전원' }, { k: 'plants', label: '설비', n: true }, { k: 'cap', label: 'MW', n: true, fmt: (v) => num(v, 1) },
        { k: 'gen', label: '발전 MWh', n: true, fmt: (v) => num(v, 1) }, { k: 'util', label: '이용률', n: true, fmt: (v) => pct(v) },
      ], f.groups) : emptyState('<span class="wait">⏳ 발전사업자 계정 자료 수집 전</span><br>setup-gen-account.cmd 실행 → 작업 등록 후 채워집니다.') })}
    </div>
    ${MH ? card({ title: `계량 수신 점검 — ${esc(MH.agg)} 보유자원`, sub: `오늘 지나간 15분 ${MH.expected}칸 기준 · 계량은 거래소에서 보통 15~45분 늦게 옵니다`, body: table([
      { k: 'name', label: '설비' },
      { k: (r) => `${r.slots} / ${r.expected}`, label: '오늘 받은 칸', n: true },
      { k: 'last', label: '마지막 칸', n: true, fmt: (v) => v ?? '—' },
      { k: 'recv', label: '받은 시각', n: true, fmt: (v) => (v ? esc(v.slice(11)) : '—') },
      { k: 'lagMin', label: '지연', n: true, fmt: (v) => (v == null ? '—' : `${v}분`) },
      { k: 'mwh', label: '오늘 순발전 MWh', n: true, fmt: (v) => num(v, 3) },
      { k: 'week', label: '지난 7일 수신률', n: true, fmt: (v) => (v == null ? '—' : v >= 0.99 ? pct(v, 1) : badge('warning', pct(v, 1))) },
      { k: 'status', label: '상태', fmt: (v) => badge(v === '정상' ? 'good' : v === '지연' ? 'warning' : 'critical', v) },
    ], MH.rows), note: MH.recon ? `대사 (${MH.recon.d.slice(4, 6)}.${MH.recon.d.slice(6)} 정산일): 보유자원 계량 합(발전−충전) ${num(MH.recon.meter, 3)} MWh vs 집합자원 정산 MGO ${num(MH.recon.mgo, 3)} MWh — ${MH.recon.ok ? '일치 ✓ (계량을 빠짐없이 받고 있음)' : `차이 ${num(MH.recon.diff, 3)} MWh — 빠진 계량 또는 구성 변경 확인`}. 지연 75분 이내 = 정상, 3시간 이내 = 지연, 그 이상 = 끊김.` : '정산명세가 들어오면 계량 합과 정산 MGO 를 맞춰 봅니다.' }) : ''}
    <div class="grid g2">
      ${card({ title: '보유자원 (회원)', sub: '집합자원을 이루는 설비', body: table([
        { k: 'name', label: '설비' }, { k: 'fuel', label: '연료' }, { k: 'cap', label: 'MW', n: true, fmt: (v) => num(v, 3) },
        { k: (r) => (ck.stopped || '').includes(r.name) ? '정지 의심' : '운전', label: '상태', fmt: (v) => (v === '정지 의심' ? badge('critical', v) : badge('good', v)) },
      ], b.members) })}
      ${card({ title: '마감 · 일정', sub: '전력시장운영규칙', body: table([
        { k: 'k', label: '항목' }, { k: 'v', label: '시각' }, { k: 'ref', label: '근거', fmt: (v) => `<small class="muted">${esc(v)}</small>` },
      ], d.deadlines) })}
    </div>`;
  const s = b.series;
  const ex = s.map((x, i) => (x.ex ? i : null)).filter((i) => i != null);
  const opsSeries = [
    { name: '발전', values: s.map((x) => x.gen), color: 'var(--s1)' },
    { name: '급전지시 (거래소 실시간)', values: s.map((x) => x.sp), color: 'var(--s2)' },
    { name: '당일계획 (지시 전 · 예정)', values: s.map((x) => x.plan ?? null), color: 'var(--s2)', dash: true },
    { name: '하루전 계획(POA)', values: s.map((x) => x.poa), color: 'var(--s3)', dash: true },
  ];
  const ops = root.querySelector('#ov-ops');
  ops.insertAdjacentHTML('beforebegin', legendHtml(opsSeries));
  lineChart(ops, { x: s.map((x) => x.t), series: opsSeries, band: { lo: s.map((x) => x.lo), hi: s.map((x) => x.hi), name: '허용 범위' }, marks: ex, markName: '허용오차 초과', yFmt: (v) => num(v, 1), tipFmt: (v) => (v == null ? '—' : `${num(v, 3)} MW`), height: 260 });
  const pr = root.querySelector('#ov-price');
  const daByT = new Map(m.da.map((x) => [x.t, x.p]));
  const xs = Array.from({ length: 96 }, (_, k) => `${String(Math.floor(k / 4)).padStart(2, '0')}:${String((k % 4) * 15).padStart(2, '0')}`);
  const rtByT = new Map(m.rt.map((x) => [x.t, x.p]));
  const priceSeries = [
    { name: '실시간', values: xs.map((t) => rtByT.get(t) ?? null), color: 'var(--s1)' },
    { name: '하루전', values: xs.map((t) => daByT.get(`${t.slice(0, 2)}:00`) ?? null), color: 'var(--s2)', dash: true },
  ];
  pr.insertAdjacentHTML('beforebegin', legendHtml(priceSeries));
  lineChart(pr, { x: xs, series: priceSeries, yFmt: (v) => num(v, 0), tipFmt: (v) => (v == null ? '—' : `${num(v, 2)} 원/kWh`), height: 220 });
}
