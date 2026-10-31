// ⑦ 사업모델 발굴 — 실제 시장·운영 자료 위에서 가정을 바꿔 보는 계산기
// 모든 금액은 "추정 상한" 성격이다. 가정과 주의는 카드마다 적는다.
import { barChart, hbars } from '../charts.mjs';
import { card, table, num, pct, won, wonC, md, esc, emptyState, badge } from '../ui.mjs';

const sum = (xs) => xs.reduce((a, b) => a + (b ?? 0), 0);
const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? sum(v) / v.length : null; };

export function render(root, d) {
  const B = d.broker;
  const fullDays = d.rt.map((row, i) => ({ i, row })).filter((x) => x.row.filter((v) => v != null).length >= 20);
  const rtAvg = avg(d.rt.flat());
  const liveCap = sum(d.live.map((m) => m.cap));
  const tpcpLive = liveCap && B.days ? B.tpcp / liveCap / B.days : null;      // 원/MW·일 (발전한 재생 설비 기준)
  const lossRate = B.total ? Math.max(0, -B.imbp / (B.total - B.imbp)) : 0;
  const annual = (v, days) => (days ? (v / days) * 365 : null);

  const S = {
    ess: {
      title: 'ESS 에너지 차익거래', tag: '운영 고도화',
      desc: '싼 시간에 충전하고 비싼 시간에 방전 — 실시간 SMP 시간 평균으로 하루 최적(완전 예측) 차익을 계산합니다.',
      inputs: [['mw', '출력 (MW)', d.ess?.cap ?? 1, 0.1], ['mwh', '저장 용량 (MWh)', 2, 0.5], ['eff', '왕복 효율 (%)', 85, 1]],
      calc: (p) => {
        const H = Math.max(1, Math.round(p.mwh / p.mw));
        const per = fullDays.map(({ row }) => {
          const s = row.filter((v) => v != null).slice().sort((a, b) => a - b);
          return p.mw * 1000 * ((p.eff / 100) * sum(s.slice(-H)) - sum(s.slice(0, H)));
        });
        return { daily: per, perDay: avg(per), annual: avg(per) == null ? null : avg(per) * 365, extra: `완전 예측 기준 ${per.length}일 · 충·방전 각 ${H}시간` };
      },
      assume: ['충전·방전 시간을 미리 안다고 본 상한(완전 예측) — 실제는 예측 오차만큼 낮습니다', '시간 평균 가격 · 하루 1회 충방전 · 충전 시간이 방전보다 앞선다는 제약은 넣지 않음', '집합자원 안에서 운전하면 허용오차·임밸런스와 함께 따져야 합니다'],
    },
    rsv: {
      title: '예비력(주파수제어) 시장 참여', tag: '신규 시장',
      desc: '실시간시장 주파수제어 예비력가격으로 ESS 용량을 예비력으로 내놓았을 때의 수익을 봅니다.',
      inputs: [['mw', '제공 용량 (MW)', d.ess?.cap ?? 1, 0.1], ['hours', '하루 제공 시간', 24, 1], ['win', '낙찰 비율 (%)', 100, 5]],
      calc: (p) => {
        if (!d.hasReserve) return { daily: [], perDay: null, annual: null, extra: '예비력가격 수집 중' };
        const per = d.fcr.map((row) => row.filter((v) => v != null)).filter((r) => r.length >= 20).map((r) => {
          const top = r.slice().sort((a, b) => b - a).slice(0, Math.min(24, p.hours));
          return p.mw * 1000 * sum(top) * (p.win / 100);
        });
        return { daily: per, perDay: avg(per), annual: avg(per) == null ? null : avg(per) * 365 };
      },
      assume: ['예비력 제공 자격(설비 성능·통신·시험) 취득이 먼저 — 비용은 넣지 않음', '같은 용량으로 에너지 차익거래와 동시에 할 수 없음(기회비용) — 위 카드와 비교해 고릅니다', '가격은 원/kWh(=원/MW·h ÷ 1,000) 로 보고 시간당 제공 용량에 곱함'],
    },
    dead: {
      title: '정지 설비 복구', tag: '즉시 개선',
      desc: d.dead.length ? `${d.dead.map((m) => `${m.name} ${m.cap}MW`).join(', ')} — 계량이 0 인 채로 집합자원에 들어 있습니다. 복구하면 에너지·용량정산금이 붙고 임밸런스가 줄어듭니다.` : '지금 정지 의심 설비가 없습니다.',
      inputs: [['util', '복구 후 이용률 (%)', Math.round(((d.windUtil || 0.25) * 100) * 10) / 10, 0.5], ['smp', '평균 SMP (원/kWh)', Math.round((rtAvg ?? 100) * 10) / 10, 1], ['tp', '용량정산금 (원/MW·일)', Math.round(tpcpLive ?? 0), 100]],
      calc: (p) => {
        if (!d.dead.length) return { daily: [], perDay: 0, annual: 0 };
        const cap = sum(d.dead.map((m) => m.cap));
        const energy = cap * (p.util / 100) * 24 * p.smp * 1000;
        const capacity = cap * p.tp;
        const imb = -sum(d.dead.map((m) => m.imbp ?? 0)) / (B.days || 1);
        return { daily: [], perDay: energy + capacity + imb, annual: (energy + capacity + imb) * 365, extra: `하루 에너지 ${won(energy)} · 용량 ${won(capacity)} · 임밸런스 회피 ${won(imb)}원` };
      },
      assume: ['이용률 기본값 = 같은 기간 집합자원 밖 JECO 풍력의 실제 이용률(발전사업자 자료), 자료가 없으면 25%', '용량정산금 = 기간 중 발전한 재생 회원이 받은 용량정산금 ÷ 설비용량 (별표33 EA_FLAG: 계량 0 설비는 합산에서 빠짐)', '임밸런스 회피 = 그 설비 몫으로 배분된 임밸런스'],
    },
    grow: {
      title: '집합자원 확대 · 외부 회원 유치', tag: '중개 확장',
      desc: '재생 설비를 집합자원에 더 넣었을 때 늘어나는 정산금과 중개 수수료를 봅니다. JECO 단독 설비 편입, 외부 소규모 발전사업자 유치 모두 같은 틀입니다.',
      inputs: [['mw', '추가 설비 (MW)', 3, 0.5], ['util', '이용률 (%)', 15, 0.5], ['fee', '중개 수수료율 (%)', 5, 0.5], ['loss', '임밸런스 손실률 (%)', Math.round(lossRate * 1000) / 10, 0.1]],
      calc: (p) => {
        const energy = p.mw * (p.util / 100) * 24 * (rtAvg ?? 0) * 1000;
        const capacity = p.mw * (tpcpLive ?? 0);
        const total = (energy + capacity) * (1 - p.loss / 100);
        return { daily: [], perDay: total, annual: total * 365, extra: `연 정산금 ${wonC(total * 365)}원 중 중개 수수료 ${wonC(total * 365 * p.fee / 100)}원`, fee: total * 365 * p.fee / 100 };
      },
      assume: ['에너지 = 설비 × 이용률 × 기간 평균 실시간 SMP', '용량정산금 = 지금 집합자원의 발전 설비 MW·일 단가 그대로', '수수료는 회원과의 계약으로 정함 — 연 금액은 회원 정산금 전체(중개 수익은 그중 수수료 몫)'],
    },
    neg: {
      title: '마이너스 SMP 활용', tag: '운영 고도화',
      desc: '실시간 SMP 가 0 이하인 시간은 발전하면 손해, 충전하면 돈을 받습니다. 출력 제한과 ESS 충전 전환의 가치를 봅니다.',
      inputs: [['mw', 'ESS 충전 출력 (MW)', d.ess?.cap ?? 1, 0.1]],
      calc: (p) => {
        const negH = d.rt.flat().filter((v) => v != null && v <= 0);
        const charge = p.mw * 1000 * sum(negH.map((v) => -v));
        const loss = -(B.negWon ?? 0);
        const days = d.rt.length;
        const yr = (annual(charge, days) ?? 0) + (annual(loss, B.days) ?? 0);
        return { daily: [], perDay: yr / 365, annual: yr, extra: `기간 중 마이너스 시간 ${negH.length}시간 · 충전 수입 ${won(charge)}원 · 발전 손실 회피(연) ${wonC(annual(loss, B.days))}원` };
      },
      assume: ['시간 평균 가격이 0 이하인 시간만 셈 (15분 단위는 더 많음)', 'ESS 가 그 시간에 비어 있어 충전할 수 있다고 봄', '발전 손실 회피 = 집합자원이 마이너스 SMP 때 발전한 손실(최근 기간)을 연으로 환산'],
    },
    fc: {
      title: '예측 정확도 개선', tag: '역량 강화',
      desc: `지금 예측오차율 ${pct(B.fcErr)} · 임밸런스 ${won(B.imbp)}원(${B.days}일). 예측을 개선하면 임밸런스와 입찰기여도(RPCF)가 함께 좋아집니다.`,
      inputs: [['imp', '오차율 개선 (%p)', 3, 0.5]],
      calc: (p) => {
        const yearly = -(annual(B.imbp ?? 0, B.days) ?? 0);
        const share = B.fcErr ? Math.min(1, (p.imp / 100) / B.fcErr) : 0;
        return { daily: [], perDay: (yearly * share) / 365, annual: yearly * share, extra: `연 임밸런스 ${wonC(yearly)}원의 ${pct(share)}` };
      },
      assume: ['임밸런스가 예측오차에 비례한다고 본 단순 추정', '입찰기여도 상승에 따른 RPCF(용량정산금) 개선 효과는 넣지 않음 — 별도 이익'],
    },
  };

  // 소형(비중앙) 설비 집합자원 편입 — 설비별 표. 용량정산금 = 설비 × 실효용량 비율 × RCP × RPCF × 8,760시간
  const J = d.join || { bench: {}, cands: [] };
  const JB = J.bench || {};
  const jIn = [['wea', '풍력 실효용량 비율 (%)', Math.round((JB.wind?.eaRatio ?? 0.17) * 1000) / 10, 0.5], ['sea', '태양광 실효용량 비율 (%)', Math.round((JB.solar?.eaRatio ?? 0.3) * 1000) / 10, 0.5],
    ['rpcf', 'RPCF', Math.round(((JB.wind?.rpcf ?? JB.solar?.rpcf) ?? 0.92) * 1000) / 1000, 0.01], ['imb', '임밸런스 비용 배수 (%)', 100, 10], ['opex', '운영비 (원/MW·월)', 0, 10000]];
  const joinCalc = (p) => {
    const rcp = JB.rcp ?? 22050;
    const rows = J.cands.map((c) => {
      const wind = c.group === '풍력';
      const dead = c.genYear === 0;
      const capRev = c.genYear == null || dead ? 0 : c.cap * ((wind ? p.wea : p.sea) / 100) * rcp * p.rpcf * 8760;
      const imbUnit = (wind ? JB.wind?.imbPerMwh : JB.solar?.imbPerMwh) ?? 0;
      const imb = (c.genYear ?? 0) * imbUnit * (p.imb / 100);
      const opex = c.cap * p.opex * 12;
      const gain = capRev + imb - opex;
      return { ...c, capRev, imb, opex, gain, after: (c.revYear ?? 0) + gain, gainPct: c.revYear ? gain / c.revYear : null, note: c.genYear == null ? '계량 없음' : dead ? '정지 — 복구가 먼저' : (c.util != null && c.util < 0.03) ? '이용률 매우 낮음 — 실효용량이 낮게 잡힐 수 있어 점검 먼저' : c.hasStl ? '' : '정산 명세 없음(거래 방식 확인)' };
    });
    return { rows, gain: sum(rows.map((x) => x.gain)), cur: sum(rows.map((x) => x.revYear ?? 0)) };
  };
  const jState = Object.fromEntries(jIn.map(([n, , v]) => [n, Number(v)]));

  const keys = Object.keys(S);
  root.innerHTML = `
    <div class="card"><h2>기회 요약 — 연 환산 추정</h2><p class="sub">아래 카드의 가정을 바꾸면 이 순위도 함께 바뀝니다 · 분석 기간 ${esc(d.days[0] ?? '')} ~ ${esc(d.days.at(-1) ?? '')} (시장), 운영은 최근 ${B.days}일</p><div id="bz-sum"></div></div>
    <div class="grid g2">${keys.map((k) => card({ id: `bz-${k}`, title: S[k].title, sub: `${badge('info', S[k].tag)} ${esc(S[k].desc)}`, body: `
      <div class="inputs">${S[k].inputs.map(([n, lab, v, step]) => `<label>${esc(lab)}<input type="number" data-k="${k}" data-n="${n}" value="${v}" step="${step}"></label>`).join('')}</div>
      <div class="result" id="bz-${k}-r"></div>
      <div class="chart" id="bz-${k}-c"></div>
      <ul class="assume">${S[k].assume.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` })).join('')}</div>
    ${card({ id: 'bz-join', title: '소형 설비 집합자원 편입 — 용량정산금 포함 수익 개선', sub: `${badge('info', '중개 확장')} 비중앙 소형 설비는 지금 에너지(SMP)만 받습니다. 집합자원에 넣으면 용량정산금(실효용량 × RCP × RPCF)이 붙고 임밸런스 책임이 생깁니다. 실측 근거: 풍력 ${esc(JB.wind?.src ?? '—')} · 태양광 ${esc(JB.solar?.src ?? '—')}`, body: `
      <div class="inputs">${jIn.map(([n, lab, v, step]) => `<label>${esc(lab)}<input type="number" data-j="${n}" value="${v}" step="${step}"></label>`).join('')}</div>
      <div class="result" id="bz-join-r"></div><div id="bz-join-t"></div>
      <ul class="assume">
        <li>지금 수익 = 최근 30일 계량을 연으로 늘린 발전량 × 설비별 정산 단가(명세 없으면 실시간 SMP 평균)</li>
        <li>용량정산금 = 설비용량 × 실효용량 비율 × RCP ${won(JB.rcp)}원 × RPCF × 8,760시간 (별표33 나.(2) — U051 9월 명세로 산식 검산)</li>
        <li>실효용량 비율 기본값: 풍력 = U051 실측 ${pct(JB.wind?.eaRatio)}, 태양광 = 중개 집합자원 실측 ${pct(JB.solar?.eaRatio)}(ESS 포함 — 태양광 단독이면 낮을 수 있음). 거래소 공시 실효용량이 있으면 그 값으로 바꾸세요</li>
        <li>임밸런스 = 연 발전량 × 실측 MWh당 임밸런스(풍력 ${won(JB.wind?.imbPerMwh)}원 · 태양광 ${won(JB.solar?.imbPerMwh)}원). 예측·운영 비용, 등록 절차는 넣지 않음</li>
        <li>계량 0 인 설비는 실효용량에서 빠지므로(EA_FLAG) 용량정산금이 없습니다 — 복구가 먼저입니다</li>
      </ul>` })}
    ${card({ title: 'JECO 단독 설비 — 집합자원 편입 후보', sub: '발전사업자 자료가 있으면 설비별 원/MWh 를 집합자원 단가와 비교합니다', body: d.standalone.some((x) => x.status !== '자료 대기') ? table([
      { k: 'name', label: '발전소' }, { k: 'group', label: '발전원' }, { k: 'cap', label: 'MW', n: true, fmt: (v) => num(v, 2) },
      { k: 'util', label: '이용률', n: true, fmt: (v) => pct(v) }, { k: 'unit', label: '원/MWh', n: true, fmt: won },
      { k: (r) => (r.unit != null && B.unit != null ? (r.unit < B.unit ? '편입 검토' : '유지') : '—'), label: `집합자원 ${won(B.unit)}원/MWh 대비`, fmt: (v) => (v === '편입 검토' ? badge('warning', v) : esc(v)) },
    ], d.standalone) : emptyState('<span class="wait">⏳ 발전사업자 계정 자료 수집 전</span> — 수집이 시작되면 단독 설비별 단가를 집합자원과 비교해 편입 후보를 고릅니다.') })}`;
  const state = Object.fromEntries(keys.map((k) => [k, Object.fromEntries(S[k].inputs.map(([n, , v]) => [n, Number(v)]))]));
  const results = {};
  const draw = (k) => {
    const R = S[k].calc(state[k]);
    results[k] = R;
    root.querySelector(`#bz-${k}-r`).innerHTML = `
      <div><small>하루 평균</small><b>${won(R.perDay)}</b> 원</div>
      <div><small>연 환산</small><b>${wonC(R.annual)}</b> 원</div>
      ${R.extra ? `<div style="flex-basis:100%"><small>${esc(R.extra)}</small></div>` : ''}`;
    const c = root.querySelector(`#bz-${k}-c`);
    if (R.daily?.length) {
      const idx = k === 'ess' ? fullDays.map((x) => x.i) : d.fcr.map((r, i) => (r.filter((v) => v != null).length >= 20 ? i : null)).filter((i) => i != null);
      barChart(c, { x: idx.map((i) => md(d.days[i])), series: [{ name: '하루 수익', values: R.daily, color: 'var(--s1)' }], yFmt: (v) => wonC(v), tipFmt: (v) => `${won(v)}원`, height: 150 });
    } else c.innerHTML = '';
  };
  const drawJoin = () => {
    const R = joinCalc(jState);
    results.join = { annual: R.gain };
    root.querySelector('#bz-join-r').innerHTML = `
      <div><small>지금 연 수익 (후보 합계)</small><b>${wonC(R.cur)}</b> 원</div>
      <div><small>편입 후 늘어나는 몫 (연)</small><b>${wonC(R.gain)}</b> 원</div>
      <div><small>증가율</small><b>${pct(R.cur ? R.gain / R.cur : null)}</b></div>`;
    root.querySelector('#bz-join-t').innerHTML = table([
      { k: 'name', label: '설비' }, { k: 'group', label: '발전원' }, { k: 'cap', label: 'MW', n: true, fmt: (v) => num(v, 2) },
      { k: 'util', label: '이용률', n: true, fmt: (v) => pct(v) }, { k: 'genYear', label: '연 발전 MWh', n: true, fmt: (v) => num(v, 0) },
      { k: 'revYear', label: '지금 연 수익', n: true, fmt: won }, { k: 'capRev', label: '+ 용량정산금', n: true, fmt: won },
      { k: 'imb', label: '− 임밸런스', n: true, fmt: won, cls: (v) => (v < 0 ? 'neg' : '') }, { k: 'gain', label: '늘어나는 몫', n: true, fmt: won },
      { k: 'gainPct', label: '증가율', n: true, fmt: (v) => pct(v) }, { k: 'note', label: '비고', fmt: (v) => (v ? badge(v.startsWith('정지') || v === '계량 없음' ? 'critical' : 'warning', v) : badge('good', '정산 실적 기준')) },
    ], R.rows.slice().sort((a, b) => b.gain - a.gain), { total: { name: '합계', group: '', cap: sum(R.rows.map((x) => x.cap)), util: null, genYear: sum(R.rows.map((x) => x.genYear ?? 0)), revYear: R.cur, capRev: sum(R.rows.map((x) => x.capRev)), imb: sum(R.rows.map((x) => x.imb)), gain: R.gain, gainPct: R.cur ? R.gain / R.cur : null, note: '' } });
  };
  const drawSum = () => {
    const rows = [...keys.map((k) => ({ k, title: S[k].title, tag: S[k].tag, annual: results[k]?.annual ?? null })), { k: 'join', title: '소형 설비 집합자원 편입', tag: '중개 확장', annual: results.join?.annual ?? null }].sort((a, b) => (b.annual ?? -1e18) - (a.annual ?? -1e18));
    hbars(root.querySelector('#bz-sum'), rows.map((r) => ({ label: `${r.title}`, value: Math.max(0, r.annual ?? 0), sub: r.tag })), { fmt: (v) => `${wonC(v)}원/년` });
  };
  keys.forEach(draw);
  // 신규 집합자원 + ESS 시뮬레이션 (12개월 계량 — 편입 우선순위 화면과 같은 자료를 따로 불러온다)
  const naHost = document.createElement('div'); naHost.id = 'bz-newagg';
  root.insertBefore(naHost, root.firstChild);
  import('./newagg.mjs').then((m) => m.mount(naHost)).catch((e) => { naHost.innerHTML = `<p class="muted">신규 집합자원 시뮬레이션을 불러오지 못했습니다: ${esc(e.message)}</p>`; });
  // 입찰 개선 효과 (U051 — 정산 명세로 최종입찰만 바꿔 다시 계산)
  const bvHost = document.createElement('div'); bvHost.id = 'bz-bidvalue';
  naHost.after(bvHost);
  import('./bidvalue.mjs').then((m) => m.mount(bvHost)).catch((e) => { bvHost.innerHTML = `<p class="muted">입찰 개선 효과를 불러오지 못했습니다: ${esc(e.message)}</p>`; });
  drawJoin();
  drawSum();
  root.querySelectorAll('input[data-j]').forEach((inp) => inp.addEventListener('input', () => {
    const v = Number(inp.value);
    if (!Number.isFinite(v)) return;
    jState[inp.dataset.j] = v;
    drawJoin();
    drawSum();
  }));
  root.querySelectorAll('input[data-k]').forEach((inp) => inp.addEventListener('input', () => {
    const v = Number(inp.value);
    if (!Number.isFinite(v)) return;
    state[inp.dataset.k][inp.dataset.n] = v;
    draw(inp.dataset.k);
    drawSum();
  }));
}
