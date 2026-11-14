// 급전지시 시험 시뮬레이션 엔진 — 화면(브라우저)과 시험(Node)이 같은 계산을 쓴다. 외부 의존 없음.
//
// 시험 하나(2시간 = 15분 8칸):
//   목표(SP) = 시험 직전 칸의 집합자원 출력 A0 × 단계 계수 (예: 100,100,50,50,0,0,100,100%)
//   각 칸: 설비 출력 a 중 줄일 수 있는 몫 c 만 목표까지 줄인다 → x = max(a − c, min(a, SP))
//          남으면(x > SP) ESS 충전, 모자라면(x < SP) ESS 방전 — 출력 한도 P, 충전량(SOC) 한도 안에서
//          편차 = x + ESS − SP 가 허용오차(ICDM × 6%, 목표가 가용 출력보다 낮으면 1.5%) 안이면 합격
//   한 칸이라도 넘으면 그 시험 불합격.

export const DEFAULTS = {
  steps: [1, 1, 0.5, 0.5, 0, 0, 1, 1],
  tol: { normal: 0.06, down: 0.015 },
  ess: { p: 0.91, e: 5.6, eff: 0.93, soc0: 0.5 },
  control: 0,
  startHours: [10, 11, 12, 13, 14, 15, 16],
  target: 0.9,
};

/**
 * 시험 하나를 칸마다 펼친다.
 * pts: [{ a, c }] — 길이 steps.length + 1 (첫 칸 = 시험 직전), a = 가용(=실제) 출력 MW, c = 그중 줄일 수 있는 몫 MW
 */
export function runTest(pts, { icdm, steps = DEFAULTS.steps, tol = DEFAULTS.tol, ess = DEFAULTS.ess, detail = false }) {
  const a0 = pts[0].a;
  let soc = ess.e * ess.soc0;
  let worst = -Infinity; let need = 0; let cause = null;
  const rows = detail ? [] : null;
  for (let k = 0; k < steps.length; k += 1) {
    const { a, c } = pts[k + 1];
    const sp = a0 * steps[k];
    const x = Math.max(a - c, Math.min(a, sp));
    const down = sp < a - 1e-9;
    const band = icdm * (down ? tol.down : tol.normal);
    const gap = x - sp;                                        // + 남음 · − 모자람
    const want = Math.abs(gap) > band ? gap - Math.sign(gap) * band : 0;
    need = Math.max(need, Math.abs(want));
    let e = 0; let limit = null;
    if (want > 0) {
      const room = Math.max(0, (ess.e - soc) / ess.eff / 0.25);
      e = -Math.min(want, ess.p, room);
      if (-e < want - 1e-9) limit = room < ess.p ? '충전량 가득' : 'ESS 출력 부족(흡수)';
    } else if (want < 0) {
      const avail = Math.max(0, soc * ess.eff / 0.25);
      e = Math.min(-want, ess.p, avail);
      if (e < -want - 1e-9) limit = avail < ess.p ? '충전량 바닥' : 'ESS 출력 부족(방전)';
    }
    soc += e < 0 ? -e * 0.25 * ess.eff : -e * 0.25 / ess.eff;
    const dev = gap + e;
    const over = Math.abs(dev) - band;
    if (over > worst) { worst = over; if (over > 1e-6) cause = limit ?? '허용오차 초과'; }
    if (rows) rows.push({ k, sp, a, c, x, ess: e, soc, dev, band, down, ok: over <= 1e-6, limit });
  }
  return { pass: worst <= 1e-6, need, cause: worst > 1e-6 ? cause : null, rows };
}

/**
 * 데이터(서버 joinsim) + 선택한 설비로 모든 시험 창을 돌린다.
 * D = { days, slot0Hour, nSlot, plants: [{ id, cap, icdmCap, base, fixedCtrl, s: [kW 정수|null, …] }] }
 * opt = { selected: Set(id), control, ess, steps, tol, startHours }
 */
export function simulateAll(D, opt) {
  const units = D.plants.filter((p) => p.base || opt.selected.has(p.id));
  const icdm = units.reduce((s, p) => s + (p.base ? p.cap : (p.icdmCap ?? p.cap)), 0);
  const steps = opt.steps ?? DEFAULTS.steps;
  const hours = opt.startHours ?? DEFAULTS.startHours;
  const res = [];
  const pts = Array.from({ length: steps.length + 1 }, () => ({ a: 0, c: 0 }));
  for (let di = 0; di < D.days.length; di += 1) {
    for (const h of hours) {
      const k0 = (h - D.slot0Hour) * 4 - 1;                   // 시험 직전 칸
      if (k0 < 0 || k0 + steps.length >= D.nSlot) continue;
      let ok = true;
      for (let k = 0; k <= steps.length && ok; k += 1) {
        let a = 0; let c = 0;
        for (const u of units) {
          const v = u.s[di * D.nSlot + k0 + k];
          if (v == null) { ok = false; break; }
          const mw = v / 1000;
          a += mw; c += mw * (u.base ? (u.fixedCtrl ?? 1) : (u.ctrl ?? opt.control));   // u.ctrl: 설비별 제어 가능 비율(있으면)
        }
        pts[k].a = Math.max(0, a); pts[k].c = Math.max(0, c);
      }
      if (!ok) continue;
      const t = runTest(pts, { icdm, steps, tol: opt.tol ?? DEFAULTS.tol, ess: opt.ess ?? DEFAULTS.ess });
      res.push({ di, h, pass: t.pass, need: t.need, cause: t.cause, a0: pts[0].a });
    }
  }
  const n = res.length; const ok = res.filter((x) => x.pass).length;
  const needs = res.map((x) => x.need).sort((x, y) => x - y);
  const q = (p) => (needs.length ? needs[Math.min(needs.length - 1, Math.floor(needs.length * p))] : null);
  const causes = {};
  for (const x of res) if (x.cause) causes[x.cause] = (causes[x.cause] ?? 0) + 1;
  return { icdm, n, pass: n ? ok / n : null, need95: q(0.95), need50: q(0.5), causes, windows: res };
}

/** 한 시험 창을 칸마다 펼친다 (재생 화면) */
export function replay(D, opt, di, h) {
  const units = D.plants.filter((p) => p.base || opt.selected.has(p.id));
  const icdm = units.reduce((s, p) => s + (p.base ? p.cap : (p.icdmCap ?? p.cap)), 0);
  const steps = opt.steps ?? DEFAULTS.steps;
  const k0 = (h - D.slot0Hour) * 4 - 1;
  const pts = []; const parts = [];
  for (let k = 0; k <= steps.length; k += 1) {
    let a = 0; let c = 0; const by = {};
    for (const u of units) {
      const v = u.s[di * D.nSlot + k0 + k];
      if (v == null) return null;
      const mw = v / 1000; a += mw; c += mw * (u.base ? (u.fixedCtrl ?? 1) : (u.ctrl ?? opt.control)); by[u.id] = mw;
    }
    pts.push({ a: Math.max(0, a), c: Math.max(0, c) }); parts.push(by);
  }
  const t = runTest(pts, { icdm, steps, tol: opt.tol ?? DEFAULTS.tol, ess: opt.ess ?? DEFAULTS.ess, detail: true });
  return { icdm, a0: pts[0].a, pre: pts[0], parts, ...t };
}
