// ① 종합 상황판 — 고른 날(기본 오늘) 무슨 일이 일어났나 · 입찰(SE_DA·POA·PRA)·급전지시·계량 대조 · RPCF · 제도 일정
import { lineChart, legendHtml } from '../charts.mjs';
import { tiles, card, esc, won, wonC, num, pct, mw, price, badge, meter, emptyState, table } from '../ui.mjs';

const ICON = { critical: '✕', serious: '!', warning: '!', info: 'i' };
const LEVEL = { critical: '위험', serious: '경고', warning: '주의', info: '안내' };

const PS = [
  { k: 'bidDa', label: '하루전 입찰', tip: '하루전 입찰(진행코드 1) 마지막 차수 공급가능용량 — 입찰 자료가 남아 있는 최근분만', color: 'var(--s5)', dash: true },
  { k: 'dase', label: 'SE_DA 하루전 낙찰', tip: '정산명세 DA_SE (명세 전에는 하루전 계획)', color: 'var(--s3)' },
  { k: 'poa', label: 'POA 초기입찰', tip: '정산명세 POA — 입찰기여도의 기준값. 실측상 SE_DA 와 같음', color: 'var(--s3)', dash: true },
  { k: 'pra', label: 'PRA 최종입찰', tip: '마지막 변경입찰 공급가능용량', color: 'var(--s2)', width: 4 },
  { k: 'sp', label: 'SP 급전지시', tip: '거래소 급전지시(시간 평균) — 명세 SET_POINT', color: 'var(--s7)', dash: true, width: 1.5 },
  { k: 'mwh', label: '계량 발전', tip: '시간 계량(발전 − 충전) MWh', color: 'var(--s1)' },
];
const SRC_NOTE = { 정산명세: badge('good', '정산명세'), '수집 (명세 전)': badge('info', '수집 자료 · 명세 전'), 없음: badge('na', '자료 없음') };

/** 입찰 · 계획 · 지시 대조 카드 (자원마다 단추로 바꿔 본다) */
function bidPlanCard(list, dayWord) {
  if (!list?.length) return '';
  return card({
    id: 'ov-bp', title: `입찰 · 낙찰 · 지시 대조 — ${dayWord} 시간별`,
    sub: 'SE_DA(하루전 낙찰) · POA(초기입찰) → PRA(최종 변경입찰) → SP(급전지시) → 계량. 입찰기여도 = |PRA−POA|, 이행기여도 = |SP−계량| (설비용량 대비)',
    body: `<div class="bp-tabs">${list.map((x, i) => `<button type="button" data-bp="${i}" class="${i ? '' : 'on'}">${esc(x.gen)} <small class="muted">${esc(x.kind)}</small></button>`).join('')}</div><div id="bp-body"></div>`,
    note: '명세 전 날짜(최근 약 8일)는 수집 자료로 같은 값을 만듭니다: SE_DA·POA = 하루전 계획, PRA = 마지막 변경입찰, SP = 실시간 급전지시 4칸 평균, 계량 = 회원(보유자원) 계량 합. 이용률 1.5% 미만·급전지시>최종입찰 시간은 기여도에서 뺍니다(28.4.1·28.4.3). 입찰기여도·이행기여도의 순위로 다음 RPCF 가 정해집니다 — [RPCF 관리] 탭.',
  });
}
function drawBidPlan(root, list, k) {
  const x = list[k]; const el = root.querySelector('#bp-body');
  if (!x || !el) return;
  root.querySelectorAll('[data-bp]').forEach((b) => b.classList.toggle('on', Number(b.dataset.bp) === k));
  const T = x.totals; const C = x.contrib;
  const hasBidDa = x.hours.some((h) => h.bidDa != null);
  const cols = PS.filter((c) => c.k !== 'bidDa' || hasBidDa);
  el.innerHTML = `
    <p class="sub" style="margin:0 0 6px">${esc(x.label)} · 설비용량 ${num(x.cap, 3)} MW · ${SRC_NOTE[x.src] ?? esc(x.src)}</p>
    ${tiles([
      { label: 'SE_DA · POA (하루전)', value: num(T.dase, 2), unit: 'MWh', delta: `POA ${num(T.poa, 2)}${hasBidDa ? ` · 하루전 입찰 ${num(T.bidDa, 2)}` : ''}` },
      { label: 'PRA 최종입찰', value: num(T.pra, 2), unit: 'MWh', delta: `변경입찰로 ${x.bidChange >= 0 ? '+' : ''}${num(x.bidChange, 2)} MWh (PRA−POA)`, deltaDir: Math.abs(x.bidChange ?? 0) > 0.05 * (T.poa || 1) ? 'down' : '' },
      { label: 'SP 급전지시', value: num(T.sp, 2), unit: 'MWh', delta: T.pra ? `최종입찰 대비 ${pct(T.sp / T.pra, 0)}` : '' },
      { label: '계량 발전', value: num(T.mwh, 2), unit: 'MWh', delta: `급전지시와 차이 ${x.followGap >= 0 ? '+' : ''}${num(x.followGap, 2)} MWh${x.praOverGen ? ` · PRA÷계량 ${num(x.praOverGen, 2)}배` : ''}`, deltaDir: x.praOverGen > 1.3 ? 'down' : '' },
      { label: '그날 입찰 · 이행 기여도', value: C.n ? `${pct(C.bid, 1)} · ${pct(C.perf, 1)}` : '—', delta: C.n ? `자원기여도 ${pct(C.res, 1)} · 산정 ${C.n}시간` : '산정 시간 없음 (발전 적음·자료 없음)' },
    ])}
    <div id="bp-chart" class="chart"></div>
    <details class="more"><summary>시간별 표 보기</summary>
    ${table([
      { k: 'h', label: '시', n: true, fmt: (v) => String(v).padStart(2, '0') },
      ...cols.map((c) => ({ k: c.k, label: c.label, n: true, fmt: (v) => num(v, 3) })),
      { k: (h) => (h.pra != null && h.poa != null ? h.pra - h.poa : null), label: 'PRA−POA', n: true, fmt: (v) => (v == null ? '—' : `<span class="${Math.abs(v) > 0.001 ? 'neg' : ''}">${num(v, 3)}</span>`) },
      { k: (h) => (h.mwh != null && h.sp != null ? h.mwh - h.sp : null), label: '계량−SP', n: true, fmt: (v) => (v == null ? '—' : `<span class="${x.cap && Math.abs(v) > x.cap * 0.06 ? 'neg' : ''}">${num(v, 3)}</span>`) },
    ], x.hours, { total: { h: '합계', ...T } })}
    </details>`;
  const series = cols.map((c) => ({ name: c.label, values: x.hours.map((h) => h[c.k] ?? null), color: c.color, dash: c.dash, width: c.width }));
  const ch = el.querySelector('#bp-chart');
  ch.insertAdjacentHTML('beforebegin', legendHtml(series));
  lineChart(ch, { x: x.hours.map((h) => `${String(h.h).padStart(2, '0')}시`), series, yFmt: (v) => num(v, 1), tipFmt: (v) => (v == null ? '—' : `${num(v, 3)} MW`), height: 240 });
}

/** RPCF 한 줄 요약 */
function rpcfCard(R) {
  if (!R || R.error || !R.resources?.length) return '';
  return card({
    title: 'RPCF (용량정산금 계수) — 이번 산정기간 성적', sub: `${esc(R.cur)} · 명세 + 명세 전 수집 추정`,
    body: table([
      { k: 'gen', label: '자원' },
      { k: 'rpcfNow', label: '지금 계수', n: true, fmt: (v) => (v == null ? '—' : num(v, 4)) },
      { k: 'bid', label: '입찰기여도', n: true, fmt: (v) => pct(v, 1) },
      { k: 'perf', label: '이행기여도', n: true, fmt: (v) => (v != null && v < 0.9 ? badge('warning', pct(v, 1)) : pct(v, 1)) },
      { k: 'res', label: '자원기여도', n: true, fmt: (v) => pct(v, 1) },
      { k: 'proj', label: '다음 계수 (참고)', n: true, fmt: (v) => (v == null ? '—' : num(v, 3)) },
      { k: 'wonPerPt', label: '계수 0.01 =', n: true, fmt: (v) => `${wonC(v)}원/년` },
    ], R.resources),
    note: '다음 계수(참고)는 과거 우리 자원의 기여도 → 받은 계수를 직선으로 이은 값입니다. 실제 계수는 제주 전 자원 중 순위로 정해져 다른 자원 성적에 따라 달라집니다. 자세히는 [RPCF 관리] 탭.',
  });
}

/** 제도 · 시장 일정 */
function policyCard(P, dayWord) {
  if (!P?.items?.length) return '';
  const dd = (x) => {
    if (x.ddayEnd != null && x.dday <= 0 && x.ddayEnd >= 0) return badge('info', `진행 중 · ${x.ddayEnd}일 남음`);
    if (x.dday === 0) return badge('warning', 'D-day');
    return x.dday > 0 ? (x.dday <= 30 ? badge('warning', `D-${x.dday}`) : `<span class="pol-dd">D-${x.dday}</span>`) : `<span class="pol-dd muted">${-x.dday}일 지남</span>`;
  };
  const st = { 확정: 'good', 예정: 'info', 목표: 'warning', 미정: 'na' };
  return card({
    title: '제도 · 시장 일정', sub: `${dayWord} 기준 D-day · ${P.checked ? `${esc(P.checked)} 확인` : ''} · config/policy-calendar.json 에서 고칩니다`,
    body: table([
      { k: 'date', label: '날짜', fmt: (v, x) => `${esc(v)}${x.until ? `<br><small class="muted">~ ${esc(x.until)}</small>` : ''}` },
      { k: 'dday', label: '', fmt: (v, x) => dd(x) },
      { k: 'title', label: '일정', fmt: (v, x) => `${x.src ? `<a href="${esc(x.src)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>` : esc(v)} ${badge(st[x.status] ?? 'na', x.status)}<br><small class="muted">${esc(x.impact ?? '')}</small>` },
      { k: 'area', label: '분야' },
    ], P.items),
    note: P.rpcfRef ? `참고 — ${esc(P.rpcfRef.round)} RPCF (${esc(P.rpcfRef.apply)}): ${P.rpcfRef.n}개 자원 ${num(P.rpcfRef.min, 4)}~${num(P.rpcfRef.max, 4)} · 집합자원 평균 ${num(P.rpcfRef.aggAvg, 4)} · 개별자원 평균 ${num(P.rpcfRef.indAvg, 4)}. 기사 날짜가 엇갈리는 항목은 원문(전력거래소·기후에너지환경부)으로 확인하세요.` : '',
  });
}

export function render(root, d) {
  const b = d.broker; const m = d.market; const f = d.fleet; const $ = d.money; const ck = b.check || {};
  const live = d.live !== false;
  const dayWord = live ? '오늘' : `${d.date.slice(4, 6)}.${d.date.slice(6)}`;
  const alerts = d.alerts.length
    ? d.alerts.map((a) => `<div class="alert ${a.level}"><span class="ai" aria-hidden="true">${ICON[a.level] ?? 'i'}</span><div><b>${esc(a.title)}</b> ${badge(a.level === 'info' ? 'info' : a.level, LEVEL[a.level])}<div>${esc(a.text)}</div></div></div>`).join('')
    : `<div class="alert info"><span class="ai">✓</span><div><b>경보 없음</b><div>입찰 구성·허용오차·마이너스 SMP 모두 정상입니다.</div></div></div>`;
  const hourBadge = live ? null : badge(b.excessQ ? 'warning' : 'good', b.excessQ ? `허용오차 초과 ${b.excessQ}칸` : '허용오차 초과 없음');
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
      live
        ? { label: `실시간 SMP (${m.rtNowAt ?? '—'})`, value: price(m.rtNow), unit: '원/kWh', delta: `오늘 평균 ${price(m.rtAvg)} · 하루전 ${price(m.daAvg)}`, trend: m.rt.map((x) => x.p) }
        : { label: `${dayWord} 실시간 SMP 평균`, value: price(m.rtAvg), unit: '원/kWh', delta: `최저 ${price(m.rtMin)} · 최고 ${price(m.rtMax)} · 하루전 ${price(m.daAvg)} · 0 이하 ${m.negQ}칸`, trend: m.rt.map((x) => x.p) },
      live
        ? { label: `${b.gen ?? '집합자원'} 현재 출력`, value: mw(b.mw), unit: 'MW', delta: `급전지시 ${mw(b.sp)} MW · 허용 ±${mw(b.tol)}` }
        : { label: `${b.gen ?? '집합자원'} 추종률`, value: pct(b.followRate, 0), unit: '', delta: `마지막 칸 ${esc(b.lastSlot?.slice(11) ?? '—')} · 급전지시 ${mw(b.sp)} MW` },
      { label: `${dayWord} 허용오차 초과`, value: `${b.excessQ}`, unit: '칸 (15분)', delta: `임밸런스 추정 ${won(b.imbp)}원`, deltaDir: b.excessQ ? 'down' : '' },
      { label: `${dayWord} 순발전 · 정산 추정`, value: num(b.mwh, 2), unit: 'MWh', delta: `${won(b.total)}원 (확정 전 추정 포함)` },
      { label: `${live ? '이번 달' : `${$.month.slice(4)}월`} 중개 정산 (${$.brokerDays}일)`, value: wonC($.broker), unit: '원', delta: `지난달 ${wonC($.brokerPrev)}원 · 명세 ${$.brokerLast ? `${$.brokerLast.slice(4, 6)}.${$.brokerLast.slice(6)}` : '—'}까지` },
      { label: '제주 수요 실적', value: num(m.demandNow, 0), unit: 'MW', delta: m.demandAt ? `${m.demandAt} 기준` : '수집 대기' },
    ])}
    <div class="grid g21">
      ${card({ title: `${b.gen ?? '집합자원'} ${dayWord} 운영 — 15분`, sub: `발전 · 급전지시 · 최종입찰(PRA) · 허용오차 범위 · 하루전 계획(POA) ${hourBadge ?? stateBadge}`, body: '<div id="ov-ops" class="chart"></div>', note: '급전지시 = 거래소가 15분마다 내는 실시간 목표출력(약 2시간 전부터 옴). 그 전 시간은 당일계획(점선)이며 낙찰량(하루전 계획 POA)과는 다릅니다. 빨간 눈금 = 허용오차를 넘은 15분. 범위 = 급전지시 ± ICDM×6% (실시간 SMP≤0 이면 1.5%).' })}
      ${card({ title: `입찰 · 회원 점검 (${dayWord})`, sub: '정지 회원 몫까지 입찰하면 하루 내내 허용오차를 넘습니다', body: `
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
    ${bidPlanCard(d.bidPlan, dayWord)}
    <div class="grid g21">
      ${card({ title: `${dayWord} 제주 SMP`, sub: '실시간(15분) · 하루전(시간) — 원/kWh', body: '<div id="ov-price" class="chart"></div>' })}
      ${card({ title: `JECO 설비 (발전사업자 0600) ${dayWord}`, sub: `U111 밖 ${f.plants}곳 · ${num(f.cap, 1)} MW`, body: f.hasData ? table([
        { k: 'group', label: '발전원' }, { k: 'plants', label: '설비', n: true }, { k: 'cap', label: 'MW', n: true, fmt: (v) => num(v, 1) },
        { k: 'gen', label: '발전 MWh', n: true, fmt: (v) => num(v, 1) }, { k: 'util', label: '이용률', n: true, fmt: (v) => pct(v) },
      ], f.groups) : emptyState('<span class="wait">⏳ 발전사업자 계정 자료 수집 전</span><br>setup-gen-account.cmd 실행 → 작업 등록 후 채워집니다.') })}
    </div>
    ${MH ? card({ title: `계량 수신 점검 — ${esc(MH.agg)} 보유자원`, sub: MH.live === false ? `${dayWord} 하루 96칸 기준 — 빠진 칸이 있으면 정산 계량과 다를 수 있습니다` : `오늘 지나간 15분 ${MH.expected}칸 기준 · 계량은 거래소에서 보통 15~45분 늦게 옵니다`, body: table([
      { k: 'name', label: '설비' },
      { k: (r) => `${r.slots} / ${r.expected}`, label: `${dayWord} 받은 칸`, n: true },
      { k: 'last', label: '마지막 칸', n: true, fmt: (v) => v ?? '—' },
      { k: 'recv', label: '받은 시각', n: true, fmt: (v) => (v ? esc(v.slice(11)) : '—') },
      { k: 'lagMin', label: '지연', n: true, fmt: (v) => (v == null ? '—' : `${v}분`) },
      { k: 'mwh', label: `${dayWord} 순발전 MWh`, n: true, fmt: (v) => num(v, 3) },
      { k: 'week', label: '지난 7일 수신률', n: true, fmt: (v) => (v == null ? '—' : v >= 0.99 ? pct(v, 1) : badge('warning', pct(v, 1))) },
      { k: 'status', label: '상태', fmt: (v) => badge(v === '정상' ? 'good' : v === '지연' || v === '빠짐' ? 'warning' : 'critical', v) },
    ], MH.rows), note: MH.recon ? `대사 (${MH.recon.d.slice(4, 6)}.${MH.recon.d.slice(6)} 정산일): 보유자원 계량 합(발전−충전) ${num(MH.recon.meter, 3)} MWh vs 집합자원 정산 MGO ${num(MH.recon.mgo, 3)} MWh — ${MH.recon.ok ? '일치 ✓ (계량을 빠짐없이 받고 있음)' : `차이 ${num(MH.recon.diff, 3)} MWh — 빠진 계량 또는 구성 변경 확인`}. 지연 75분 이내 = 정상, 3시간 이내 = 지연, 그 이상 = 끊김.` : '정산명세가 들어오면 계량 합과 정산 MGO 를 맞춰 봅니다.' }) : ''}
    <div class="grid g2">
      ${card({ title: '보유자원 (회원)', sub: '집합자원을 이루는 설비', body: table([
        { k: 'name', label: '설비' }, { k: 'fuel', label: '연료' }, { k: 'cap', label: 'MW', n: true, fmt: (v) => num(v, 3) },
        { k: (r) => (ck.stopped || '').includes(r.name) ? '정지 의심' : '운전', label: '상태', fmt: (v) => (v === '정지 의심' ? badge('critical', v) : badge('good', v)) },
      ], b.members) })}
      ${card({ title: '마감 · 일정', sub: '전력시장운영규칙', body: table([
        { k: 'k', label: '항목' }, { k: 'v', label: '시각' }, { k: 'ref', label: '근거', fmt: (v) => `<small class="muted">${esc(v)}</small>` },
      ], d.deadlines) })}
    </div>
    ${rpcfCard(d.rpcfMini)}
    ${policyCard(d.policy, dayWord)}`;
  const s = b.series;
  const ex = s.map((x, i) => (x.ex ? i : null)).filter((i) => i != null);
  const opsSeries = [
    { name: '발전', values: s.map((x) => x.gen), color: 'var(--s1)' },
    { name: '급전지시 (거래소 실시간)', values: s.map((x) => x.sp), color: 'var(--s2)' },
    { name: '당일계획 (지시 전 · 예정)', values: s.map((x) => x.plan ?? null), color: 'var(--s2)', dash: true },
    { name: '최종입찰(PRA)', values: s.map((x) => x.pra ?? null), color: 'var(--s5)', width: 1.5 },
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
  if (d.bidPlan?.length) {
    drawBidPlan(root, d.bidPlan, 0);
    root.querySelectorAll('[data-bp]').forEach((btn) => btn.addEventListener('click', () => drawBidPlan(root, d.bidPlan, Number(btn.dataset.bp))));
  }
}
