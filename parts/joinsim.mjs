// ⑩ 편입 우선순위 · 급전시험 — 설비를 골라 넣으면 집합자원이 어떻게 커지고, 급전지시 시험을 교래ESS 로 통과할 수 있는지 바로 계산
import { lineChart, barChart, heatmap, legendHtml } from '../charts.mjs';
import { tiles, card, table, badge, num, pct, esc, wonC } from '../ui.mjs';
import { DEFAULTS, simulateAll, replay } from './joinsim-engine.mjs';

const passBadge = (v) => (v == null ? '—' : badge(v >= 0.9 ? 'good' : v >= 0.7 ? 'warning' : 'critical', pct(v, 0)));
const ymd = (d) => (d ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : '');
const hhmm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const passColor = (v) => `hsl(${Math.round(Math.max(0, Math.min(1, v)) * 120)} 55% 48%)`;
const ESS_GRID = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6];

export function render(root, d) {
  if (d.computing) {
    root.innerHTML = card({ title: '자료를 준비하고 있습니다', body: '<p>지난 12개월 15분 계량을 모으는 중입니다 (하루 한 번, 1~2분). 잠시 뒤 저절로 다시 불러옵니다.</p>' });
    setTimeout(() => { if (location.hash === '#joinsim') window.dispatchEvent(new HashChangeEvent('hashchange')); }, 20000);
    return;
  }
  const base = d.plants.filter((p) => p.base);
  const cands = d.plants.filter((p) => !p.base);
  const baseIcdm = base.reduce((s, p) => s + p.cap, 0);
  const S = {
    selected: new Set(),
    control: DEFAULTS.control,
    ess: { ...DEFAULTS.ess, p: d.ess.p, e: d.ess.e },
    steps: [...DEFAULTS.steps],
    tol: { ...DEFAULTS.tol },
    pick: null,               // 재생할 시험 { di, h }
  };
  const opt = () => ({ selected: S.selected, control: S.control, ess: S.ess, steps: S.steps, tol: S.tol, startHours: DEFAULTS.startHours });
  const sim = (ids, extra = {}) => simulateAll(d, { ...opt(), selected: new Set(ids), ...extra });

  // 우선순위: 연 순이득 × (지금 ESS · 제어 불가로 그 설비 하나만 넣었을 때 통과율) × 설비 상태 가중
  function rankCands() {
    for (const c of cands) {
      c.single = sim([c.id], { control: 0 }).pass;
      c.score = (c.value ?? 0) * (c.single ?? 0) * (c.cond ?? 1);
    }
    cands.sort((a, b) => b.score - a.score || b.value - a.value);
    cands.forEach((c, i) => { c.rank = i + 1; });
  }
  // 권장 조합: 순위대로 넣되, 넣은 뒤 묶음 전체 통과율이 목표 이상일 때만 채택
  function recommend() {
    const chosen = [];
    for (const c of cands) if ((sim([...chosen, c.id]).pass ?? 0) >= DEFAULTS.target) chosen.push(c.id);
    return chosen;
  }

  root.innerHTML = `
    ${d.recomputing ? '<p class="muted" style="margin:0">⟳ 오늘 자료로 다시 준비하는 중 — 아래는 직전 자료입니다.</p>' : ''}
    <div class="alert info"><span class="ai">i</span><div>
      <b>무엇을 보나</b> 미참여 설비를 ${esc(d.agg)} 집합자원에 넣으면 용량정산금이 붙지만, 노후 풍력은 원격으로 출력을 줄이기 어렵습니다.
      그러면 급전지시(특히 '줄여라')를 <b>${esc(d.ess.name)}</b>가 충전으로 대신 받아야 합니다. 아래에서 설비를 고르면 지난 12개월(${ymd(d.from)}~${ymd(d.to)})
      실제 15분 계량으로 시험을 수천 번 되풀이해 바로 다시 계산합니다.
    </div></div>
    <div class="grid g12">
      ${card({ title: '① 지금 구성', sub: `${esc(d.agg)} 집합자원 — 시험을 이미 통과해 등록된 상태`, body: '<div id="js-base"></div>' })}
      ${card({ title: '시험 가정 (바꿀 수 있음)', sub: '거래소 실제 시험 기준을 받으면 그 값으로 바꾸세요', body: `
        <div class="js-form">
          <label>${esc(d.ess.name)} 출력 <input id="js-p" type="number" step="0.05" min="0" value="${S.ess.p}"> MW</label>
          <label>ESS 용량 <input id="js-e" type="number" step="0.1" min="0" value="${S.ess.e}"> MWh</label>
          <label>시험 시작 충전량 <input id="js-soc" type="number" step="5" min="0" max="100" value="${Math.round(S.ess.soc0 * 100)}"> %</label>
          <label>새 풍력 원격 출력제어 <select id="js-ctrl"><option value="0">불가 (노후 설비)</option><option value="0.5">절반 가능</option><option value="1">전부 가능</option></select></label>
          <label>시험 단계 (15분마다, 시작 직전 출력 대비 %) <input id="js-steps" type="text" value="${S.steps.map((v) => Math.round(v * 100)).join(' ')}"></label>
          <label>허용오차 <input id="js-tn" type="number" step="0.5" value="${S.tol.normal * 100}"> % · 감발 지시 <input id="js-td" type="number" step="0.1" value="${S.tol.down * 100}"> % (× ICDM)</label>
        </div>
        <p class="muted small" style="margin:6px 0 0">출력·용량 기본값은 ${esc(d.ess.name)} 실측(15분 최대 충·방전 ${num(d.ess.p, 2)}MW · 한 번에 이어 충전한 최대 ${num(d.ess.e, 1)}MWh). 허용오차 기본값은 별표33 정산 허용오차.</p>` })}
    </div>
    ${card({ title: '② 넣을 설비 고르기', sub: '체크하면 아래 ③~⑦ 이 바로 다시 계산됩니다 · 순위 = 연 순이득 × 단독 통과율(제어 불가) × 설비 상태 가중', body: `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <button type="button" class="btn" id="js-rec">권장 조합 (통과율 ${pct(DEFAULTS.target, 0)} 이상 유지)</button>
        <button type="button" class="btn" id="js-none">모두 해제</button>
        <button type="button" class="btn" id="js-ex">예: 행원풍력 #5 + #4</button>
      </div><div id="js-cands"></div>` })}
    <div id="js-result"></div>
    <div class="grid g2">
      ${card({ title: '③ 하나씩 넣을 때 — 집합자원 크기와 통과율', sub: '고른 설비를 순위대로 차례로 더해 가며', body: '<div id="js-cum" class="chart"></div><div id="js-cumt"></div>' })}
      ${card({ title: '⑤ ESS 출력을 바꾸면', sub: '고른 조합 · 새 풍력 출력제어 비율별', body: '<div id="js-sens" class="chart"></div>', note: '같은 설비라도 ESS 출력이 시험 순간 풍력 출력보다 작으면 0% 지시를 따를 수 없습니다.' })}
    </div>
    ${card({ title: '④ 시험 재생 — 한 번의 급전지시 시험을 15분 단위로', sub: '어떤 날·시각을 골라 실제 출력으로 시험을 펼쳐 봅니다', body: `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
        <button type="button" class="btn" data-pick="worst">가장 어려웠던 시험</button>
        <button type="button" class="btn" data-pick="fail">불합격 예</button>
        <button type="button" class="btn" data-pick="median">보통 날</button>
        <button type="button" class="btn" data-pick="pass">합격 예</button>
        <label class="muted">날짜 <input type="date" id="js-day" min="${d.from.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}" max="${d.to.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}"></label>
        <label class="muted">시작 <select id="js-hour">${DEFAULTS.startHours.map((h) => `<option value="${h}">${h}시</option>`).join('')}</select></label>
      </div><div id="js-replay"></div>` })}
    ${card({ title: '⑥ 언제 시험을 받으면 유리한가 — 달 × 시작 시각 통과율', sub: '고른 조합 · 지금 가정', body: '<div id="js-heat"></div>', note: '바람이 약한 계절·시간대일수록 통과율이 높습니다. 시험 일정을 고를 수 있다면 풍속 예보가 낮은 날을 고르고, 시험 전 ESS 충전량을 비워 두세요.' })}
    ${card({ title: '⑦ 방법론 · 한계', body: `
      <ol class="assume" style="padding-left:18px;color:var(--ink-2);line-height:1.7">
        <li><b>시험 모양</b> — 시험 직전 15분 출력 A0 를 기준으로 15분마다 목표 = A0 × 단계 계수. 기본은 100·100·50·50·0·0·100·100% (2시간). 근무 시간 10~16시 시작 × 12개월 모든 날.</li>
        <li><b>설비 대응</b> — 각 칸에서 원격으로 줄일 수 있는 몫만 목표까지 줄이고, 남는 출력은 ESS 가 충전으로 흡수, 모자라면 방전. ESS 는 출력 한도와 충전량(효율 ${pct(d.ess.eff, 0)}) 안에서만 움직입니다.</li>
        <li><b>판정</b> — 편차(출력 + ESS − 목표)가 허용오차(ICDM × 6%, 목표가 가용 출력보다 낮은 '감발' 칸은 1.5%) 안이면 그 칸 합격, 한 칸이라도 넘으면 시험 불합격. ICDM = 기존 회원 + 새로 넣은 설비용량.</li>
        <li><b>기존 회원</b>(${base.map((b) => esc(b.name)).join(', ')})은 지금 집합자원이 시험을 통과해 등록돼 있으므로 출력을 줄일 수 있다고 봅니다.</li>
        <li><b>경제성</b> — 풍력 = 동복북촌풍력(U051) 최근 12개월 실측 등록 순효과 1MW 당 연 ${wonC(d.value.wind)}원 × 설비용량 × 발전일 비율. 태양광 = 실효용량 비율 × 현행 산식 ${wonC(d.value.solarTpcp)}원/MW·년 + 불균형 ${num(d.value.solarImbPerMwh, 0)}원/MWh.</li>
        <li><b>설비 상태 가중</b> — 정지(수리 전제) × 0.5, 이용률 5% 미만(고장 의심) × 0.5, 계량이 설비용량을 넘음 × 0.8. 정지·계량 없는 풍력은 동복북촌풍력 1MW 당 출력 모양으로 '정상 가동'을 가정합니다.</li>
        <li><b>한계</b> — 시험 절차는 별표33 정산 허용오차를 준용한 가정입니다. 실시간 계량을 '가용 출력'으로 보므로 예측 오차·통신 지연·ESS 응답 시간은 빠져 있어 실제는 조금 더 어렵습니다.</li>
      </ol>` })}`;

  // ① 지금 구성
  root.querySelector('#js-base').innerHTML = `${table([
    { k: 'name', label: '설비' }, { k: 'group', label: '원' }, { k: 'cap', label: 'MW', n: true, fmt: (v) => num(v, 3) },
    { k: (r) => (r.stopped ? '정지' : '운전'), label: '상태', fmt: (v) => badge(v === '정지' ? 'critical' : 'good', v) },
    { k: () => '가능 (인버터)', label: '원격 출력제어' },
  ], base, { total: { name: '합계 (ICDM)', group: '', cap: baseIcdm } })}
    <p class="muted small" style="margin:6px 0 0">보조자원 ${esc(d.ess.name)} — 출력 ${num(d.ess.p, 2)}MW · 용량 약 ${num(d.ess.e, 1)}MWh (ICDM 에는 들어가지 않음). 지금 허용오차: 보통 ±${num(baseIcdm * DEFAULTS.tol.normal, 2)}MW · 감발 지시 ±${num(baseIcdm * DEFAULTS.tol.down, 3)}MW.</p>`;

  const readForm = () => {
    S.ess = { ...S.ess, p: Math.max(0, Number(root.querySelector('#js-p').value) || 0), e: Math.max(0, Number(root.querySelector('#js-e').value) || 0), soc0: Math.min(1, Math.max(0, (Number(root.querySelector('#js-soc').value) || 0) / 100)) };
    S.control = Number(root.querySelector('#js-ctrl').value);
    const st = root.querySelector('#js-steps').value.split(/[\s,]+/).map(Number).filter((v) => Number.isFinite(v) && v >= 0);
    if (st.length && st.length <= 24) S.steps = st.map((v) => v / 100);
    S.tol = { normal: (Number(root.querySelector('#js-tn').value) || 6) / 100, down: (Number(root.querySelector('#js-td').value) || 1.5) / 100 };
  };

  function drawCands() {
    root.querySelector('#js-cands').innerHTML = table([
      { k: 'id', label: '넣기', fmt: (v) => `<input type="checkbox" data-id="${esc(v)}" ${S.selected.has(v) ? 'checked' : ''} aria-label="넣기">` },
      { k: 'rank', label: '순위', n: true },
      { k: 'name', label: '설비', fmt: (v, r) => `${esc(v)}${r.registered ? ` ${badge('na', '이미 등록')}` : ''}${r.proxy ? ' <small class="muted">(정상 가동 가정)</small>' : ''}` },
      { k: 'group', label: '원' }, { k: 'cap', label: 'MW', n: true, fmt: (v, r) => (r.icdmCap === 0 ? `${num(v, 2)}*` : num(v, 2)) },
      { k: 'value', label: '연 순이득', n: true, fmt: (v) => `${wonC(v)}원` },
      { k: 'single', label: '혼자 넣으면 통과율', n: true, fmt: passBadge },
      { k: (r) => (r.flags || []).join(' · '), label: '설비 상태', fmt: (v) => (v ? `<small>${esc(v)}</small>` : '<small class="muted">정상</small>') },
    ], cands);
    root.querySelectorAll('#js-cands input[type=checkbox]').forEach((el) => el.addEventListener('change', () => {
      if (el.checked) S.selected.add(el.dataset.id); else S.selected.delete(el.dataset.id);
      S.pick = null; update();
    }));
  }

  function update() {
    const R = simulateAll(d, opt());
    const sel = cands.filter((c) => S.selected.has(c.id));
    const addCap = sel.reduce((s, c) => s + (c.icdmCap ?? c.cap), 0);
    const value = sel.reduce((s, c) => s + (c.value ?? 0), 0);
    const causeTxt = Object.entries(R.causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v / R.n, 0)}`).join(' · ') || '불합격 없음';
    root.querySelector('#js-result').innerHTML = tiles([
      { label: '고른 설비', value: `${sel.length}곳`, delta: sel.length ? `+${num(addCap, 2)}MW${sel.some((c) => c.icdmCap === 0) ? ' (복구 설비는 이미 ICDM 에 있음)' : ''}` : '지금 구성 그대로' },
      { label: '집합자원 ICDM', value: num(R.icdm, 2), unit: 'MW', delta: `지금 ${num(baseIcdm, 2)}MW` },
      { label: '허용오차 (보통 · 감발)', value: `±${num(R.icdm * S.tol.normal, 2)}`, unit: 'MW', delta: `감발 지시 ±${num(R.icdm * S.tol.down, 3)}MW` },
      { label: '연 순이득 (추가분)', value: wonC(value), unit: '원', delta: '등록 시 용량·불균형 정산 실측 단가' },
      { label: '급전지시 시험 통과율', value: pct(R.pass, 1), delta: `시험 ${num(R.n, 0)}번 중 · 목표 ${pct(DEFAULTS.target, 0)}`, deltaDir: (R.pass ?? 0) >= DEFAULTS.target ? 'up' : 'down' },
      { label: '95% 통과에 필요한 ESS 출력', value: num(R.need95, 2), unit: 'MW', delta: `지금 ${num(S.ess.p, 2)}MW · 불합격 원인: ${causeTxt}` },
    ]);
    drawCum(); drawSens(); drawHeat(R); drawReplay(R);
  }

  function drawCum() {
    const order = cands.filter((c) => S.selected.has(c.id));
    const steps = [{ name: '지금', icdm: baseIcdm, pass: sim([]).pass, value: 0 }];
    const ids = []; let v = 0;
    for (const c of order) { ids.push(c.id); v += c.value ?? 0; const s = sim(ids); steps.push({ name: `+ ${c.name}`, icdm: s.icdm, pass: s.pass, value: v, need95: s.need95 }); }
    const el = root.querySelector('#js-cum');
    const ser = [{ name: '통과율 (%)', values: steps.map((s) => Math.round((s.pass ?? 0) * 1000) / 10), color: 'var(--s1)' }];
    el.innerHTML = ''; el.previousElementSibling?.classList?.contains('legend') && el.previousElementSibling.remove();
    barChart(el, { x: steps.map((s, i) => (i ? `${i}` : '지금')), series: ser, stacked: false, yFmt: (x) => `${num(x, 0)}%`, tipFmt: (x) => `${num(x, 1)}%`, height: 180 });
    root.querySelector('#js-cumt').innerHTML = table([
      { k: (r, i) => r.name, label: '단계' }, { k: 'icdm', label: 'ICDM MW', n: true, fmt: (x) => num(x, 2) },
      { k: (r) => r.icdm * S.tol.down, label: '감발 허용 MW', n: true, fmt: (x) => `±${num(x, 3)}` },
      { k: 'pass', label: '통과율', n: true, fmt: passBadge }, { k: 'value', label: '연 순이득 누적', n: true, fmt: (x) => `${wonC(x)}원` },
    ], steps);
  }

  function drawSens() {
    const ids = [...S.selected];
    const series = [0, 0.5, 1].map((c, i) => ({
      name: c === 0 ? '출력제어 불가' : c === 0.5 ? '절반 가능' : '전부 가능',
      values: ESS_GRID.map((p) => Math.round((sim(ids, { control: c, ess: { ...S.ess, p } }).pass ?? 0) * 1000) / 10),
      color: ['var(--s8)', 'var(--s4)', 'var(--s3)'][i],
    }));
    const el = root.querySelector('#js-sens');
    el.parentElement.querySelector('.legend')?.remove();
    el.insertAdjacentHTML('beforebegin', legendHtml(series));
    lineChart(el, { x: ESS_GRID.map((p) => `${p}MW`), series, yFmt: (x) => `${num(x, 0)}%`, tipFmt: (x) => `${num(x, 1)}%`, height: 200, yMin: 0, yMax: 100 });
  }

  function drawHeat(R) {
    const months = [...new Set(d.days.map((x) => x.slice(0, 6)))];
    const hours = DEFAULTS.startHours;
    const acc = months.map(() => hours.map(() => ({ n: 0, ok: 0 })));
    for (const w of R.windows) { const m = months.indexOf(d.days[w.di].slice(0, 6)); const j = hours.indexOf(w.h); if (m >= 0 && j >= 0) { acc[m][j].n += 1; if (w.pass) acc[m][j].ok += 1; } }
    heatmap(root.querySelector('#js-heat'), {
      rows: months.map((m) => `${m.slice(2, 4)}.${m.slice(4)}`), cols: hours.map((h) => `${h}시`),
      values: acc.map((row) => row.map((x) => (x.n ? x.ok / x.n : null))), colorOf: passColor, fmt: (v) => (v == null ? '자료 없음' : ` 통과율 ${pct(v, 0)}`), rowLabelW: 50,
    });
  }

  function choose(R, kind) {
    const ws = R.windows;
    if (!ws.length) return null;
    if (kind === 'worst') return ws.reduce((a, b) => (b.need > a.need ? b : a));
    if (kind === 'fail') return ws.filter((w) => !w.pass)[Math.floor(ws.filter((w) => !w.pass).length / 2)] ?? null;
    if (kind === 'pass') return ws.filter((w) => w.pass).reduce((a, b) => (b.a0 > a.a0 ? b : a), ws.find((w) => w.pass) ?? ws[0]);
    const s = [...ws].sort((a, b) => a.need - b.need); return s[Math.floor(s.length / 2)];
  }

  function drawReplay(R) {
    if (!S.pick) { const w = choose(R, (R.pass ?? 1) < 1 ? 'fail' : 'median'); S.pick = w ? { di: w.di, h: w.h } : null; }
    const host = root.querySelector('#js-replay');
    if (!S.pick) { host.innerHTML = '<p class="muted">시험할 자료가 없습니다.</p>'; return; }
    const day = d.days[S.pick.di];
    root.querySelector('#js-day').value = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`;
    root.querySelector('#js-hour').value = String(S.pick.h);
    const T = replay(d, opt(), S.pick.di, S.pick.h);
    if (!T) { host.innerHTML = '<p class="muted">이 날·시각은 계량이 비어 있어 시험할 수 없습니다.</p>'; return; }
    const times = [hhmm(S.pick.h - 0.25), ...S.steps.map((_, k) => hhmm(S.pick.h + k * 0.25))];
    const fails = T.rows.filter((x) => !x.ok).length;
    host.innerHTML = `
      <div class="alert ${T.pass ? 'info' : 'critical'}" style="margin-bottom:8px"><span class="ai">${T.pass ? '✓' : '✕'}</span><div>
        <b>${ymd(day)} ${S.pick.h}시 시험 — ${T.pass ? '합격' : `불합격 (${fails}칸 초과 · ${esc(T.cause ?? '')})`}</b>
        <div>시작 직전 출력 A0 = ${num(T.a0, 2)}MW · ICDM ${num(T.icdm, 2)}MW → 허용오차 보통 ±${num(T.icdm * S.tol.normal, 2)}MW / 감발 ±${num(T.icdm * S.tol.down, 3)}MW · ESS 최대 ${num(S.ess.p, 2)}MW</div></div></div>
      <div class="grid g21"><div><div id="js-rp" class="chart"></div></div><div><div id="js-rpe" class="chart"></div></div></div>
      ${table([
        { k: (r) => times[r.k + 1], label: '시각' }, { k: (r) => `${Math.round(S.steps[r.k] * 100)}%`, label: '단계' },
        { k: 'sp', label: '지시 MW', n: true, fmt: (v) => num(v, 2) }, { k: 'a', label: '설비 출력', n: true, fmt: (v) => num(v, 2) },
        { k: 'c', label: '줄일 수 있는 몫', n: true, fmt: (v) => num(v, 2) }, { k: 'x', label: '줄인 뒤', n: true, fmt: (v) => num(v, 2) },
        { k: 'ess', label: 'ESS (−충전 +방전)', n: true, fmt: (v) => num(v, 2) }, { k: 'soc', label: 'ESS 충전량 MWh', n: true, fmt: (v) => num(v, 2) },
        { k: 'dev', label: '편차', n: true, fmt: (v) => num(v, 3) }, { k: 'band', label: '허용 ±', n: true, fmt: (v) => num(v, 3) },
        { k: 'ok', label: '판정', fmt: (v, r) => (v ? badge('good', '합격') : badge('critical', r.limit ?? '초과')) },
      ], T.rows)}
      <p class="muted small">설비별 출력(시작 직전): ${d.plants.filter((p) => p.base || S.selected.has(p.id)).map((p) => `${esc(p.name)} ${num(T.parts[0][p.id] ?? 0, 2)}`).join(' · ')} MW</p>`;
    const x = times.slice(1);
    const sp = T.rows.map((r) => r.sp); const after = T.rows.map((r) => r.x + r.ess);
    const ser = [
      { name: '급전지시 (목표)', values: sp, color: 'var(--s2)' },
      { name: '설비 출력 (줄인 뒤 · ESS 전)', values: T.rows.map((r) => r.x), color: 'var(--s4)', dash: true },
      { name: '집합자원 출력 (ESS 반영)', values: after, color: 'var(--s1)' },
    ];
    const e1 = host.querySelector('#js-rp');
    e1.insertAdjacentHTML('beforebegin', legendHtml(ser));
    lineChart(e1, { x, series: ser, band: { lo: T.rows.map((r) => r.sp - r.band), hi: T.rows.map((r) => r.sp + r.band), name: '허용 범위' }, marks: T.rows.map((r, i) => (r.ok ? null : i)).filter((i) => i != null), markName: '허용오차 초과', yFmt: (v) => num(v, 1), tipFmt: (v) => `${num(v, 3)} MW`, height: 240, yMin: 0 });
    const e2 = host.querySelector('#js-rpe');
    const se = [{ name: 'ESS (− 충전 · + 방전) MW', values: T.rows.map((r) => r.ess), color: 'var(--s3)' }];
    e2.insertAdjacentHTML('beforebegin', legendHtml(se, 'bar'));
    barChart(e2, { x, series: se, stacked: false, yFmt: (v) => num(v, 1), tipFmt: (v) => `${num(v, 2)} MW`, height: 240 });
  }

  // 이벤트
  root.querySelectorAll('.js-form input, .js-form select').forEach((el) => el.addEventListener('change', () => { readForm(); rankCands(); drawCands(); S.pick = null; update(); }));
  root.querySelector('#js-rec').addEventListener('click', () => { S.selected = new Set(recommend()); S.pick = null; drawCands(); update(); });
  root.querySelector('#js-none').addEventListener('click', () => { S.selected = new Set(); S.pick = null; drawCands(); update(); });
  root.querySelector('#js-ex').addEventListener('click', () => { S.selected = new Set(['1968', '1967'].filter((id) => cands.some((c) => c.id === id))); S.pick = null; drawCands(); update(); });
  root.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    const w = choose(simulateAll(d, opt()), b.dataset.pick);
    S.pick = w ? { di: w.di, h: w.h } : null; drawReplay(simulateAll(d, opt()));
  }));
  const pickDate = () => {
    const v = root.querySelector('#js-day').value.replaceAll('-', ''); const di = d.days.indexOf(v);
    if (di >= 0) { S.pick = { di, h: Number(root.querySelector('#js-hour').value) }; drawReplay(simulateAll(d, opt())); }
  };
  root.querySelector('#js-day').addEventListener('change', pickDate);
  root.querySelector('#js-hour').addEventListener('change', pickDate);

  rankCands();
  S.selected = new Set(recommend());
  drawCands();
  update();
}
