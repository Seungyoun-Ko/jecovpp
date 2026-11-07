// 사업모델 — 입찰 개선 효과 (U051 동복북촌): 최종입찰(변경입찰)을 단기 예측으로 냈다면 정산금이 얼마나 달라졌나
// 서버(src/analysis/bidvalue.mjs)가 정산 명세 시간마다 최종입찰만 바꿔 정산 엔진으로 다시 계산한 결과를 받아, 고른 방법·여유로 보여 준다.
import { lineChart, legendHtml, hbars } from '../charts.mjs';
import { card, table, tiles, num, pct, wonC, won, esc, badge } from '../ui.mjs';
import { api } from '../hub.mjs';

const TITLE = '입찰 개선 효과 — U051 동복북촌 최종입찰';

export async function mount(host) {
  host.innerHTML = card({ title: TITLE, body: '<p class="muted">정산 명세로 다시 계산하는 중…</p>' });
  let D;
  try { D = await api('bidvalue'); } catch (e) { host.innerHTML = card({ title: TITLE, body: `<p class="muted">자료를 불러오지 못했습니다: ${esc(e.message)}</p>` }); return; }
  if (D.error) { host.innerHTML = card({ title: TITLE, body: `<p class="muted">${esc(D.error)}</p>` }); return; }
  const S = { key: D.scen.some((s) => s.key === 'n20') ? 'n20' : 'cur', m: null };
  const byKey = Object.fromEntries(D.scen.map((s) => [s.key, s]));
  const per = (v) => (v == null ? null : (v / D.hours.dayEq) * 365);
  const B = D.base;
  const md = (d) => `${d.slice(4, 6)}.${d.slice(6)}`;

  host.innerHTML = `
    <section class="card"><h2>${esc(TITLE)}</h2>
      <p class="sub">${md(D.from)}~${md(D.to)} 정산 명세 ${D.hours.used.toLocaleString()}시간(${num(D.hours.dayEq, 0)}일) · 실제 정산을 원 단위까지 재현한 엔진(오차 합 ${won(D.reproduce?.absErr)}원)에
        <b>최종입찰(공급가능용량)만</b> 바꿔 넣고 다시 계산했습니다. 실제 발전·하루전 낙찰·용량정산금은 그대로, 거래소 감축 지시는 유지.</p>
      <div class="na-ctl" style="display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;margin:6px 0 10px">
        <span><b>변경입찰에 쓰는 예측</b></span>
        ${D.scen.filter((s) => s.key !== 'perfect').map((s) => `<label style="white-space:nowrap"><input type="radio" name="bv-k" value="${s.key}" ${s.key === S.key ? 'checked' : ''}> ${esc(s.short ?? s.label)}</label>`).join('')}
        <span style="margin-left:8px"><b>여유</b></span>
        <select id="bv-m">${D.margins.map((m) => `<option value="${m}">+${num(m, 1)} MW</option>`).join('')}<option value="best" selected>가장 나은 값</option></select>
      </div>
      <div id="bv-tiles"></div>
      <div class="grid g2">
        <div><h3 class="sec" style="margin-top:4px">방법별 연 개선액 (여유는 각자 가장 나은 값)</h3><div id="bv-bars"></div></div>
        <div><h3 class="sec" style="margin-top:4px">누적 개선액 — 고른 방법</h3><div class="chart" id="bv-cum"></div></div>
      </div>
      <h3 class="sec">방법 × 여유 — 연 환산 개선액 (임밸런스·기대이익·변동비 합)</h3>
      <div id="bv-grid"></div>
      <div class="rule" style="margin-top:10px"><b>읽는 법</b>
        지금 최종입찰은 실제 발전의 <b>${num(B.ratio, 2)}배</b>(오차 ${num(B.nmae, 1)}%)이고 임밸런스 벌점이 연 <b>${wonC(-B.annualImbp)}원</b>입니다.
        초과발전(실제 &gt; 급전지시) 벌점이 미달보다 무거워 — 실시간 가격 0 이하면 입찰하한가 × 2.5, 감축 중이면 실시간가격 − 입찰가 — 예측보다 조금 높게 내는 편이 낫습니다.
        <b>하루 앞 예보만으로는 지금보다 못합니다</b>: 효과는 '변경입찰 마감(대상 시간 75분 전) 때 손에 있는 계량이 얼마나 새것인가'에 달려 있습니다.
        계량은 15분 구간이 끝나고 약 5분 뒤 올라오는데, 지금은 매시 :05 에 받아 마감(매시 :45) 때 마지막 계량이 대상 2시간 전에 끝난 것입니다.
        <b>받는 시각만 :25(마감 20분 전)나 :40(5분 전)으로 옮기면</b> 호출 수는 그대로인 채 15분·30분 새 계량을 쓸 수 있어 개선액이 커집니다(예약 작업 변경 — 승인 필요).
        '발전량 예측' 탭의 권장 변경입찰량이 '새 단기식'입니다. 실시간 감축 지시는 바로 알 수 없어, 감축 중 계량이 낮으면 권장값도 낮게 나올 수 있습니다.</div>
      <p class="muted" style="font-size:12px;margin-top:6px">예측은 교차검증 값(그 주를 빼고 학습한 식 · 출력제한 시간만 완성된 식) · 새 단기식 = 마지막 15분·1시간·2시간 계량과 KIM 예측의 절대오차 회귀(경과 시간별) · 용량정산금(EA)과 입찰량의 관계는 거래소 확인 전이라 그대로 둠 ·
        재입찰 횟수·수동 작업 부담은 넣지 않음 · 계산 ${esc((D.asOf ?? '').slice(0, 16).replace('T', ' '))}</p>
    </section>`;

  const draw = () => {
    const s = byKey[S.key];
    const g = S.m === null ? s.grid.find((x) => x.m === s.best) : (s.grid.find((x) => x.m === S.m) ?? s.grid[0]);
    const perfect = byKey.perfect.grid[0];
    host.querySelector('#bv-tiles').innerHTML = tiles([
      { label: '지금 임밸런스 벌점 (연)', value: wonC(-B.annualImbp), unit: '원', delta: `최종입찰 ÷ 실제 ${num(B.ratio, 2)}배 · 오차 ${num(B.nmae, 1)}%` },
      { label: `개선액 — ${s.short ?? s.label} +${num(g.m, 1)}MW`, value: wonC(g.annual), unit: '원/년', delta: `기간 ${wonC(g.d)}원 · 입찰 ÷ 실제 ${num(g.ratio, 2)}배`, deltaDir: g.d >= 0 ? 'up' : 'down' },
      { label: '임밸런스 벌점 변화', value: wonC(per(g.dImbp)), unit: '원/년', delta: `기대이익 ${wonC(per(g.dMap))} · 변동비 ${wonC(per(g.dMwp))}`, deltaDir: g.dImbp >= 0 ? 'up' : 'down' },
      { label: '상한 (완벽한 예측)', value: wonC(perfect.annual), unit: '원/년', delta: `벌점 ${pct(B.imbp ? 1 - perfect.imbp / B.imbp : null, 0)} 줄어듦` },
    ]);
    const cum = []; let a = 0; for (const v of g.daily) { a += v ?? 0; cum.push(a); }
    const pc = []; let b = 0; for (const v of perfect.daily) { b += v ?? 0; pc.push(b); }
    const el = host.querySelector('#bv-cum');
    el.previousElementSibling?.classList?.contains('legend') && el.previousElementSibling.remove();
    const series = [
      { name: `${s.short ?? s.label} +${num(g.m, 1)}MW`, values: cum, color: g.d >= 0 ? 'var(--s1)' : 'var(--s8)', width: 2.5 },
      { name: '완벽한 예측 (상한)', values: pc, color: 'var(--axis)', dash: true },
    ];
    el.insertAdjacentHTML('beforebegin', legendHtml(series));
    lineChart(el, { x: D.days.map(md), series, yFmt: (v) => wonC(v), tipFmt: (v) => `${won(v)}원`, height: 220, xEvery: 7 });
  };
  hbars(host.querySelector('#bv-bars'), D.scen.map((s) => { const g = s.grid.find((x) => x.m === s.best); return { label: s.short ?? s.label, value: Math.max(0, g.annual), sub: g.annual < 0 ? `손해 ${wonC(-g.annual)}원 (여유 +${num(g.m, 1)}MW)` : `여유 +${num(g.m, 1)}MW · 입찰 ${num(g.ratio, 2)}배` }; }), { fmt: (v) => `${wonC(v)}원/년` });
  host.querySelector('#bv-grid').innerHTML = table([
    { k: 'label', label: '방법' },
    ...D.margins.map((m) => ({ k: `m${m}`, label: `+${num(m, 1)}MW`, n: true, fmt: (v) => (v == null ? '—' : `<span class="${v < 0 ? 'neg' : ''}">${wonC(v)}</span>`) })),
    { k: 'best', label: '가장 나은 여유', fmt: (v) => badge('good', `+${num(v, 1)}MW`) },
  ], D.scen.filter((s) => s.key !== 'perfect').map((s) => ({ label: `${s.label}${s.w != null ? ` (계량 몫 ${num(s.w * 100, 0)}%)` : ''} · 오차 ${num(s.nmae, 1)}%`, ...Object.fromEntries(s.grid.map((x) => [`m${x.m}`, x.annual])), best: s.best })));

  host.querySelectorAll('input[name="bv-k"]').forEach((x) => x.addEventListener('change', () => { S.key = x.value; draw(); }));
  host.querySelector('#bv-m').addEventListener('change', (e) => { S.m = e.target.value === 'best' ? null : Number(e.target.value); draw(); });
  draw();
}
