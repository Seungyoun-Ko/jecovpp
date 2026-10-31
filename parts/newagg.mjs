// 사업모델 — 신규 급전가능집합전력자원 + ESS: 몇 MW 면 급전지시 이행능력 시험을 통과해 등록되나, 그때 경제성은
//
// 근거: 전력시장운영규칙 제16.2.2조(등록기준: 회원 설비 20MW 이하, 주요자원 합계 1MW 초과 100MW 미만, 같은 중개사업자) ·
//       제16.2.4조(출력제어지시를 15분 평균으로 이행) · 제16.2.9조(시험: 설비이용률 15% 이상에서 기준출력의 100·75·50·25·0% 지시,
//       각 10분 평균 오차가 주요자원 설비용량의 6% 이내 · 불합격 시 재시험 2회 · 보조자원 방전지속시간 시험).
// 계산: 지난 12개월 실제 15분 계량(10~16시 시작)으로 시험을 수천 번 되풀이. 줄일 수 없는 출력은 ESS 가 충전으로 받는다.
//       15분 자료라 단계마다 15분으로 본다 — 실제(10분)보다 길어 ESS 에너지는 넉넉히 잡힌다.
import { lineChart, legendHtml } from '../charts.mjs';
import { card, table, tiles, num, pct, wonC, won, esc, badge } from '../ui.mjs';
import { simulateAll } from './joinsim-engine.mjs';
import { api } from '../hub.mjs';

const STEPS = [1, 0.75, 0.5, 0.25, 0];
const TOL = { normal: 0.06, down: 0.06 };
const HOURS = [10, 11, 12, 13, 14, 15, 16];
const MIN_UTIL = 0.15;
const PV_CF = 0.14;            // 외부 태양광 연 이용률 가정 (불균형 단가 × 발전량)

export async function mount(host) {
  host.innerHTML = card({ title: '신규 집합자원 + ESS 시뮬레이션', body: '<p class="muted">12개월 15분 계량 자료를 불러오는 중…</p>' });
  let D;
  try { D = await api('joinsim'); } catch (e) { host.innerHTML = card({ title: '신규 집합자원 + ESS 시뮬레이션', body: `<p class="muted">자료를 불러오지 못했습니다: ${esc(e.message)}</p>` }); return; }
  if (D.computing || !D.proxy) {
    host.innerHTML = card({ title: '신규 집합자원 + ESS 시뮬레이션', body: '<p class="muted">12개월 계량 자료를 준비하고 있습니다(하루 한 번, 1~2분). 잠시 뒤 저절로 다시 불러옵니다.</p>' });
    setTimeout(() => { if (host.isConnected) mount(host); }, 20000);
    return;
  }
  const V = D.value; const CP = D.capPrice ?? { rcp: 22050, rpcf: 0.9 }; const ARB = D.arbitrage?.perMwhDay ?? {};
  const cands = D.plants.filter((p) => !p.base && !p.registered && (p.group === '풍력' || p.group === '태양광'));
  const S = {
    sel: new Set(cands.filter((p) => !p.stopped).map((p) => p.id)),
    extW: 0, extPV: 0, ctrlW: 0, ctrlPV: 0, dur: 2, soc0: 50, target: 90,
    ea: 0.78, rcp: CP.rcp, rpcf: CP.rpcf, arbShare: 50, kwh: 450000, kw: 200000, dev: 15, om: 2, life: 15, rate: 6, deg: 2, fee: 20,
    pick: null, exist: 0, lost: 0,
  };
  const EX = (D.existingEss ?? []).filter((x) => x.cap > 0);
  const exCap = EX.reduce((a, x) => a + x.cap, 0); const exDis = EX.reduce((a, x) => a + (x.disYear ?? 0), 0);
  const valueOfExt = () => S.extW * (V.wind ?? 0) + S.extPV * ((V.solarTpcp ?? 0) + (V.solarImbPerMwh ?? 0) * 8760 * PV_CF);

  function units() {
    const u = cands.filter((p) => S.sel.has(p.id)).map((p) => ({ id: p.id, cap: p.cap, base: false, ctrl: (p.group === '풍력' ? S.ctrlW : S.ctrlPV) / 100, s: p.s }));
    const ext = (id, mw, shape, ctrl) => (mw > 0 ? [{ id, cap: mw, base: false, ctrl, s: shape.map((v) => (v == null ? null : Math.round(v * mw))) }] : []);
    return [...u, ...ext('EXT_W', S.extW, D.proxy.wind, S.ctrlW / 100), ...ext('EXT_PV', S.extPV, D.proxy.pv, S.ctrlPV / 100)];
  }
  // ESS 출력 mw 로 시험 — 설비이용률 15% 이상 창만
  function test(U, mw) {
    const Dn = { days: D.days, slot0Hour: D.slot0Hour, nSlot: D.nSlot, plants: U };
    const res = simulateAll(Dn, { selected: new Set(U.map((x) => x.id)), control: 0, ess: { p: mw, e: mw * S.dur, eff: 0.93, soc0: S.soc0 / 100 }, steps: STEPS, tol: TOL, startHours: HOURS });
    const w = res.windows.filter((x) => x.a0 >= MIN_UTIL * res.icdm);
    const ok = w.filter((x) => x.pass).length;
    const causes = {}; for (const x of w) if (!x.pass && x.cause) causes[x.cause] = (causes[x.cause] ?? 0) + 1;
    return { icdm: res.icdm, n: w.length, pass: w.length ? ok / w.length : null, needs: w.map((x) => x.need).sort((a, b) => a - b), causes, all: res.windows.length };
  }
  function econ(mw, icdm, nSites) {
    const mwh = mw * S.dur;
    // 기존 ESS 를 먼저 쓰고 모자란 만큼만 새로 짓는다. 기존 ESS 가 지금 버는 몫은 '잃는 수익'(원/MWh 방전)으로 뺀다
    const ex = Math.min(S.exist, mw); const nw = mw - ex;
    const exUseDis = exCap > 0 ? exDis * (ex / exCap) : 0;
    const lost = exUseDis * S.lost;
    const unitCap = (m) => m * S.dur * 1000 * S.kwh + m * 1000 * S.kw;
    const saved = unitCap(ex);
    const i = S.rate / 100; const crf = i > 0 ? i / (1 - (1 + i) ** -S.life) : 1 / S.life;
    const breakEven = exUseDis > 0 ? (saved * crf + saved * (S.om / 100)) / exUseDis : null;
    const member = cands.filter((p) => S.sel.has(p.id)).reduce((a, p) => a + (p.value ?? 0), 0) + valueOfExt();
    const essCap = mw * S.ea * S.rcp * S.rpcf * 8760;
    const k = Math.max(1, Math.min(4, Math.round(S.dur)));
    const essArb = mwh * (ARB[k] ?? 0) * 365 * (S.arbShare / 100);
    const capex = unitCap(nw) + nSites * S.dev * 1e6;
    const om = unitCap(nw) * (S.om / 100);
    const jecoRev = essCap + essArb + member * (S.fee / 100);
    const cash = [-capex];
    for (let y = 1; y <= S.life; y += 1) { const f = (1 - S.deg / 100) ** (y - 1); cash.push((essCap + essArb) * f + member * (S.fee / 100) - om - lost); }
    const npvAt = (rt) => cash.reduce((a, c, y) => a + c / (1 + rt) ** y, 0);
    let irr = null;
    if (npvAt(0) > 0) { let lo = -0.5; let hi = 1; for (let i = 0; i < 60; i += 1) { const m = (lo + hi) / 2; if (npvAt(m) > 0) lo = m; else hi = m; } irr = (lo + hi) / 2; }
    let acc = -capex; let payback = null;
    for (let y = 1; y < cash.length; y += 1) { const before = acc; acc += cash[y]; if (acc >= 0 && payback == null) payback = y - 1 + (-before / cash[y]); }
    return { mw, mwh, member, essCap, essArb, capex, om, lost, ex, nw, saved, breakEven, exUseDis, jecoRev, jecoNet: jecoRev - om - lost, totalNet: member + essCap + essArb - om - lost, npv: npvAt(S.rate / 100), irr, payback };
  }

  function draw() {
    const U = units();
    const icdm = U.reduce((a, u) => a + u.cap, 0);
    const nSites = cands.filter((p) => S.sel.has(p.id)).length + (S.extW > 0 ? Math.ceil(S.extW / 3) : 0) + (S.extPV > 0 ? Math.ceil(S.extPV / 1) : 0);
    const checks = [
      ['주요자원 합계 1MW 초과 100MW 미만 (16.2.2 ③)', icdm > 1 && icdm < 100, `${num(icdm, 2)}MW`],
      ['회원 설비마다 20MW 이하 (16.2.2 ②)', U.every((u) => u.cap <= 20), U.some((u) => u.cap > 20) ? '20MW 넘는 설비 있음' : '모두 20MW 이하'],
      ['출력제어지시 15분 평균 이행 (16.2.4 ③) — 시험으로 확인', null, '아래 ESS 계산'],
      ['제주 · 같은 중개사업자 · 중앙계약시장 미참여 (16.2.2 ①④⑥)', null, '계약으로 확인'],
    ];
    const big = cands.filter((p) => S.sel.has(p.id) && p.cap > 3);
    if (!U.length || icdm <= 0) {
      host.querySelector('#na-out').innerHTML = '<p class="muted">회원 설비를 고르거나 외부 설비 용량을 넣으세요.</p>';
      return;
    }
    // ESS 없이 / 출력만 보면 필요한 MW(목표 통과율 분위) → 격자에서 최소 MW
    const t0 = test(U, 0);
    const tgt = S.target / 100;
    const needP = t0.needs.length ? t0.needs[Math.min(t0.needs.length - 1, Math.floor(t0.needs.length * tgt))] : 0;
    const top = Math.max(0.5, needP * 1.6, icdm * 0.3);
    const step = top <= 3 ? 0.1 : top <= 10 ? 0.25 : top <= 30 ? 0.5 : 1;
    const grid = []; for (let m = 0; m <= top + 1e-9; m += step) grid.push(Math.round(m * 100) / 100);
    const runs = grid.map((m) => ({ m, t: m === 0 ? t0 : test(U, m) }));
    const hit = runs.find((x) => (x.t.pass ?? 0) >= tgt);
    const req = hit ? hit.m : null;
    const pickM = S.pick ?? req ?? grid.at(-1);
    const chosen = runs.reduce((b, x) => (Math.abs(x.m - pickM) < Math.abs(b.m - pickM) ? x : b), runs[0]);
    const E = econ(chosen.m, icdm, nSites);
    const p3 = (p) => (p == null ? null : 1 - (1 - p) ** 3);
    const rows = runs.filter((x, i) => i % Math.max(1, Math.round(runs.length / 12)) === 0 || x.m === req).map((x) => ({ ...econ(x.m, icdm, nSites), pass: x.t.pass, pass3: p3(x.t.pass), req: x.m === req }));
    const causeTxt = Object.entries(chosen.t.causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}회`).join(' · ');
    host.querySelector('#na-out').innerHTML = `
      ${tiles([
        { label: '주요자원 (풍력·태양광)', value: num(icdm, 2), unit: 'MW', delta: `허용오차 ±${num(icdm * 0.06, 2)}MW (6%) · 시험 창 ${t0.n}개 (이용률 15% 이상)` },
        { label: `필요 ESS (통과율 ${S.target}%)`, value: req == null ? `${num(grid.at(-1), 1)}+` : num(req, 2), unit: 'MW', delta: req == null ? '격자 안에서 목표 못 맞춤 — 제어 가능 비율·시간을 바꿔 보세요' : `${num(req * S.dur, 1)}MWh (${S.dur}시간) · ESS 없이 통과율 ${pct(t0.pass, 0)}`, deltaDir: req == null ? 'down' : '' },
        { label: `선택 ${num(chosen.m, 2)}MW 통과율`, value: pct(chosen.t.pass, 0), delta: `재시험 2회 포함 ${pct(p3(chosen.t.pass), 0)}${causeTxt ? ` · 불합격 원인 ${esc(causeTxt)}` : ''}` },
        { label: 'JECO 연 순수익 (첫해)', value: wonC(E.jecoNet), unit: '원', delta: `ESS 용량 ${wonC(E.essCap)} + 차익 ${wonC(E.essArb)} + 수수료 ${wonC(E.member * S.fee / 100)} − 운영 ${wonC(E.om)}${E.lost ? ` − 기존 ESS 잃는 몫 ${wonC(E.lost)}` : ''}`, deltaDir: E.jecoNet >= 0 ? 'up' : 'down' },
        ...(E.ex > 0 ? [{ label: `기존 ESS ${num(E.ex, 1)}MW 사용 — 새로 짓는 몫 ${num(E.nw, 2)}MW`, value: wonC(E.saved), unit: '원 절감', delta: `손익분기: 기존 ESS 가 지금 방전 1MWh 당 ${won(E.breakEven)}원 넘게 벌면 새로 짓는 편이 낫다 (쓰는 몫 방전 연 ${num(E.exUseDis, 0)}MWh)`, deltaDir: 'up' }] : []),
        { label: `투자비 · NPV(${S.rate}%, ${S.life}년)`, value: wonC(E.npv), unit: '원', delta: `투자 ${wonC(E.capex)} · 회수 ${E.payback == null ? '기간 안 못 함' : `${num(E.payback, 1)}년`} · IRR ${E.irr == null ? '—' : E.irr >= 0.99 ? '100% 넘음' : pct(E.irr, 1)}${E.ex > 0 && !S.lost ? ' · ⚠ 기존 ESS 잃는 수익 0원 가정 — 손익분기와 비교하세요' : ''}`, deltaDir: E.npv >= 0 ? 'up' : 'down' },
        { label: '집합자원 전체 연 순증 (첫해)', value: wonC(E.totalNet), unit: '원', delta: `회원 등록 효과 ${wonC(E.member)} 포함 (회원 몫 ${100 - S.fee}%)` },
      ])}
      <div class="grid g2">
        <div><p class="sub">ESS 출력별 시험 통과율 (1회 · 재시험 포함 3회)</p><div class="chart" id="na-pass"></div></div>
        <div><p class="sub">ESS 출력별 JECO NPV (억원, 등록되는 크기만)</p><div class="chart" id="na-npv"></div></div>
      </div>
      <div class="rule" style="margin-top:8px"><b>등록 기준 점검</b> ${checks.map(([k, ok, v]) => `<div>${ok === true ? badge('good', '충족') : ok === false ? badge('critical', '안 됨') : badge('info', '확인')} ${esc(k)} — ${esc(v)}</div>`).join('')}
        ${big.length ? `<div>${badge('warning', '참고')} 3MW 넘는 ${big.map((p) => esc(p.name)).join(', ')} 은(는) 어차피 급전가능재생에너지자원 등록 의무 대상입니다 (16.1.10) — 단독 등록과 비교하세요.</div>` : ''}
      </div>
      <div style="margin-top:8px">${table([
        { k: 'mw', label: 'ESS MW', n: true, fmt: (v, r) => `${r.req ? '<b>' : ''}${num(v, 2)}${r.req ? ' ◀ 최소</b>' : ''}` },
        { k: 'mwh', label: 'MWh', n: true, fmt: (v) => num(v, 1) },
        { k: 'pass', label: '통과율 1회', n: true, fmt: (v) => (v == null ? '—' : badge(v >= tgt ? 'good' : v >= 0.7 ? 'warning' : 'critical', pct(v, 0))) },
        { k: 'pass3', label: '3회 안', n: true, fmt: (v) => pct(v, 0) },
        { k: 'capex', label: '투자비', n: true, fmt: wonC },
        { k: 'essCap', label: 'ESS 용량정산금/년', n: true, fmt: wonC },
        { k: 'essArb', label: 'ESS 차익/년', n: true, fmt: wonC },
        { k: 'jecoNet', label: 'JECO 순수익/년', n: true, fmt: wonC },
        { k: 'npv', label: 'NPV', n: true, fmt: (v, r) => ((r.pass ?? 0) < tgt ? '<span class="muted">등록 안 됨</span>' : `<span class="${v < 0 ? 'neg' : ''}">${wonC(v)}</span>`) },
        { k: 'payback', label: '회수(년)', n: true, fmt: (v) => (v == null ? '—' : num(v, 1)) },
      ], rows)}</div>`;
    const xs = runs.map((x) => num(x.m, step < 0.25 ? 1 : 2));
    const s1 = [{ name: '1회 통과율', values: runs.map((x) => (x.t.pass == null ? null : x.t.pass * 100)), color: 'var(--s1)' }, { name: '재시험 포함', values: runs.map((x) => (x.t.pass == null ? null : p3(x.t.pass) * 100)), color: 'var(--s3)', dash: true }];
    const e1 = host.querySelector('#na-pass'); e1.insertAdjacentHTML('beforebegin', legendHtml(s1));
    lineChart(e1, { x: xs, series: s1, yMin: 0, yMax: 100, yFmt: (v) => `${num(v, 0)}%`, tipFmt: (v) => `${num(v, 1)}%`, height: 200, xEvery: Math.max(1, Math.round(runs.length / 8)), marks: req == null ? [] : [runs.findIndex((x) => x.m === req)], markName: '최소 ESS' });
    // 시험 통과율이 목표에 못 미치는 ESS 는 등록이 안 되므로 NPV 를 그리지 않는다
    const s2 = [{ name: 'NPV', values: runs.map((x) => ((x.t.pass ?? 0) >= tgt ? econ(x.m, icdm, nSites).npv / 1e8 : null)), color: 'var(--s2)' }];
    lineChart(host.querySelector('#na-npv'), { x: xs, series: s2, yFmt: (v) => num(v, 1), tipFmt: (v) => `${num(v, 2)} 억원`, height: 200, xEvery: Math.max(1, Math.round(runs.length / 8)) });
  }

  const inp = (k, label, step, unit = '') => `<label>${esc(label)} <input type="number" data-na="${k}" step="${step}" value="${S[k]}">${unit ? ` ${esc(unit)}` : ''}</label>`;
  host.innerHTML = card({
    cls: 'na',
    title: '신규 집합자원 + ESS — 몇 MW 면 등록되고, 얼마나 남나',
    sub: `지금 집합자원(${esc(D.agg)})과 별도로 새 급전가능집합전력자원을 꾸릴 때. 노후 풍력처럼 원격으로 출력을 못 줄이는 설비는 '0% 지시'에 ESS 가 충전으로 대신 받아야 시험(16.2.9)을 통과합니다. 지난 12개월(${esc(D.from)}~${esc(D.to)}) 실제 계량으로 계산.`,
    body: `
      <div class="grid g12">
        <div>
          <p class="sub"><b>① 회원 고르기</b> (정지 설비는 동복북촌 출력 모양으로 '수리 후' 가정)</p>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>설비</th><th class="n">MW</th><th>상태</th><th class="n">연 등록 효과</th></tr></thead><tbody>
            ${cands.map((p) => `<tr><td><input type="checkbox" data-sel="${esc(p.id)}" ${S.sel.has(p.id) ? 'checked' : ''}></td><td>${esc(p.name)} <span class="muted">${esc(p.group)}</span></td><td class="n">${num(p.cap, 2)}</td>
              <td>${p.stopped ? badge('warning', '정지 — 수리 전제') : badge('good', '가동')}</td><td class="n">${wonC(p.value)}</td></tr>`).join('')}
          </tbody></table></div>
          <div class="js-form" style="margin-top:8px">
            ${inp('extW', '외부 풍력 모집', 0.5, 'MW')}${inp('extPV', '외부 태양광 모집', 0.5, 'MW')}
            ${inp('ctrlW', '풍력 원격 제어 가능', 10, '%')}${inp('ctrlPV', '태양광 원격 제어 가능', 10, '%')}
          </div>
          <p class="sub" style="margin-top:10px"><b>② ESS · 시험</b></p>
          <div class="js-form">${inp('dur', '저장 시간', 0.5, 'h')}${inp('soc0', '시험 시작 충전량', 10, '%')}${inp('target', '목표 통과율', 5, '%')}
            ${EX.length ? `<label>기존 ESS 먼저 쓰기 <select data-na="exist"><option value="0">안 씀 (모두 새로)</option>${EX.map((x) => `<option value="${x.cap}">${esc(x.name)} ${num(x.cap, 1)}MW</option>`).join('')}${EX.length > 1 ? `<option value="${exCap}">둘 다 ${num(exCap, 1)}MW</option>` : ''}</select></label>${inp('lost', '기존 ESS 잃는 수익', 1000, '원/MWh 방전')}` : ''}</div>
          ${EX.length ? `<p class="muted" style="font-size:12px;margin:4px 0 0">기존 ESS 지금 쓰임(최근 90일 계량 → 연): ${EX.map((x) => `${esc(x.name)} 방전 ${num(x.disYear, 0)}MWh · 충전 ${num(x.chgYear, 0)}MWh`).join(' · ')} — 매일 충·방전 중이라, 보조자원으로 돌리면 지금 수익(REC 가중치·차익 등)을 잃을 수 있습니다. 정산 명세가 따로 없어 그 금액은 직접 넣거나 손익분기로 보세요. 저장 시간은 위 값으로 가정.</p>` : ''}
          <p class="sub" style="margin-top:10px"><b>③ 경제성 가정</b></p>
          <div class="js-form">
            ${inp('kwh', '배터리·설치', 10000, '원/kWh')}${inp('kw', 'PCS·계통연계', 10000, '원/kW')}${inp('dev', '회원 연계·제어장치', 1, '백만원/곳')}
            ${inp('ea', 'ESS 실효용량 비율', 0.01, 'MW/MW')}${inp('rcp', '기준용량가격', 100, '원/MWh')}${inp('rpcf', 'RPCF', 0.01)}
            ${inp('arbShare', '차익에 쓸 몫', 10, '%')}${inp('fee', '중개 수수료(회원 증가분)', 5, '%')}
            ${inp('om', '운영비', 0.5, '%/년')}${inp('deg', 'ESS 수익 감소', 0.5, '%/년')}${inp('life', '기간', 1, '년')}${inp('rate', '할인율', 0.5, '%')}
            <label>볼 ESS 출력 <input type="number" data-na="pick" step="0.1" placeholder="최소값" value=""> MW</label>
          </div>
        </div>
        <div id="na-out"></div>
      </div>`,
    note: `가정 — 회원 등록 효과: 풍력 ${wonC(V.wind)}원/MW·년(동복북촌 U051 12개월 등록 순효과 실측) · 태양광 용량정산금 ${wonC(V.solarTpcp)}원/MW·년 + 불균형 ${num(V.solarImbPerMwh, 0)}원/MWh.
      ESS 용량정산금 = ESS MW × 실효용량 비율(0.78: 교래ESS 편입 전후 U111·U086 실효용량 차) × 기준용량가격 × RPCF × 8,760 — <b>보조자원 실효용량 인정 방식은 거래소 확인 필요</b>.
      ESS 차익 = 하루전 SMP 가장 싼·비싼 시간 충·방전(왕복 0.9) 12개월 평균 × 쓸 몫(나머지는 급전지시 추종용으로 남김).
      시험은 15분 자료로 단계마다 15분(실제 10분) — 에너지는 넉넉히, 10분 안의 출력 변동은 못 봅니다. JECO 에는 이미 가시리풍력ESS 3MW · 동복풍력ESS 6MW 가 있습니다 — 보조자원으로 쓸 수 있으면 투자비가 크게 줍니다(계약·REC 조건 확인).`,
  });
  host.querySelectorAll('input[data-sel]').forEach((el) => el.addEventListener('change', () => { if (el.checked) S.sel.add(el.dataset.sel); else S.sel.delete(el.dataset.sel); S.pick = null; draw(); }));
  host.querySelector('select[data-na="exist"]')?.addEventListener('change', (e) => { S.exist = Number(e.target.value) || 0; draw(); });
  host.querySelectorAll('input[data-na]').forEach((el) => el.addEventListener('change', () => {
    const v = el.value === '' ? null : Number(el.value);
    if (el.dataset.na === 'pick') { S.pick = v; draw(); return; }
    if (v == null || !Number.isFinite(v)) return;
    S[el.dataset.na] = v; if (['extW', 'extPV', 'ctrlW', 'ctrlPV', 'dur', 'soc0', 'target'].includes(el.dataset.na)) S.pick = null;
    draw();
  }));
  draw();
}
