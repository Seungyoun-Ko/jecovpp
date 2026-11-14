// ⑪ 발전량 예측 (기상청 KIM) · 권장 변경입찰량
import { lineChart, legendHtml } from '../charts.mjs';
import { tiles, card, table, badge, num, esc, emptyState } from '../ui.mjs';

const ymdDot = (d) => (d ? `${d.slice(4, 6)}.${d.slice(6)}` : '');
const tsShort = (ts) => (ts ? `${ts.slice(5, 7)}.${ts.slice(8, 10)} ${ts.slice(11, 13)}시` : '—');
const runTxt = (t) => (t ? `${t.slice(4, 6)}.${t.slice(6, 8)} ${t.slice(8, 10)}시 발표` : '—');
const STATUS = { run: ['good', '가동'], down: ['serious', '정지 추정'], nometer: ['na', '계량 없음'] };

export function render(root, d) {
  if (d.error) {
    root.innerHTML = card({ title: '발전량 예측을 아직 볼 수 없습니다', body: emptyState(esc(d.error)) });
    return;
  }
  const tok = (() => { try { return sessionStorage.getItem('cms-token') || ''; } catch { return ''; } })();
  const T = d.track; const A = d.advice;
  const deadline = (() => { const t = new Date(`${d.today.slice(0, 4)}-${d.today.slice(4, 6)}-${d.today.slice(6)}T11:00:00+09:00`); return t; })();
  const left = Math.round((deadline - Date.now()) / 60000);
  const leftTxt = left > 0 ? `오늘 11:00 마감까지 ${Math.floor(left / 60)}시간 ${left % 60}분` : '오늘 입찰 마감 지남';
  // 잠근 게시본에는 서버가 없으므로 CSV 를 브라우저에서 만든다
  const csvHref = globalThis.CMS_STATIC
    ? URL.createObjectURL(new Blob([`﻿${['시간', ...d.units.flatMap((u) => [`${u.name} 예측(MW)`, 'P10', 'P90'])].join(',')}\r\n${Array.from({ length: 24 }, (_, h) => {
      const ts = `${d.target.slice(0, 4)}-${d.target.slice(4, 6)}-${d.target.slice(6)} ${String(h).padStart(2, '0')}:00`;
      return [`${String(h).padStart(2, '0')}시`, ...d.units.flatMap((u) => { const x = u.rows.find((z) => z.ts === ts); return [x?.p ?? '', x?.p10 ?? '', x?.p90 ?? '']; })].join(',');
    }).join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' }))
    : `/api/hub/genforecast.csv?target=${d.target}${tok ? `&token=${encodeURIComponent(tok)}` : ''}`;
  const u051 = d.units.find((u) => u.id === 'U051'); const agg = d.units.find((u) => u.id !== 'U051');
  const downs = d.plants.filter((p) => p.status === 'down');
  const tileOf = (u) => u && ({
    label: `${ymdDot(d.target)} ${u.id} 예상 발전량`, value: num(u.tomorrow.p, 1), unit: 'MWh',
    delta: u.tomorrow.partial ? `${u.tomorrow.hours}시간만 (나머지는 다음 발표 후)` : `용량 ${num(u.cap, 1)}MW · 이용률 ${num((u.tomorrow.p / (u.cap * 24)) * 100, 0)}%`,
    trend: u.rows.filter((x) => x.ts.startsWith(`${d.target.slice(0, 4)}-${d.target.slice(4, 6)}-${d.target.slice(6)}`)).map((x) => x.p),
  });
  const accTile = (u) => u?.cv && ({
    label: `${u.id} 예측 오차 (시간별)`, value: num(u.cv.nmae, 1), unit: '%',
    delta: `30일 평균 방식 ${num(u.cv.base, 1)}% → ${num((1 - u.cv.nmae / u.cv.base) * 100, 0)}% 줄임`, deltaDir: 'up',
  });
  const bidE = T.U051?.bidErr;
  const s2 = u051?.st2cv;
  const stTile = s2?.[2] != null && { label: 'U051 변경입찰용 단기 오차', value: num(s2[2], 1), unit: '%', title: '마감(75분 전) 때 손에 있는 15분 계량 + KIM, 교차검증, 용량 대비',
    delta: `계량 :05 수집(지금) 기준 · 기존 방식 ${num(s2.old2, 1)}% · :25 수집 ${num(s2[1.75], 1)}% · :40 ${num(s2[1.5], 1)}%`, deltaDir: 'up' };
  root.innerHTML = `
    <div class="alert info"><span class="ai">☁</span><div><b>입찰용 예측은 ${esc(runTxt(u051?.bidTmfc ?? agg?.bidTmfc))} 기준</b> — 21시 발표는 다음날 01~02시, 09시 발표는 13~14시에 다 올라와 하루전 입찰(D-1 11:00)에는 전전날 21시 발표를 씁니다. ${esc(leftTxt)}.
      <div style="margin-top:4px"><a href="${csvHref}" download="generation_forecast_${d.target}.csv">⬇ ${ymdDot(d.target)} 시간별 예측 내려받기 (CSV)</a> · 예측식 학습 ${esc(d.model.trainedAt.slice(5, 16).replace('T', ' '))} (${d.model.days}일치)</div></div></div>
    ${downs.length ? `<div class="alert warning"><span class="ai">!</span><div><b>정지 추정 설비 ${downs.length}곳</b> — ${downs.map((p) => `${esc(p.name)}(${p.g})`).join(', ')}: 계량 값이 있던 가장 최근 시간들에 예측은 컸는데 계량이 거의 0 이라 예측에서 0 으로 둡니다. 다시 돌면 자동으로 되돌립니다.</div></div>` : ''}
    ${tiles([tileOf(u051), tileOf(agg), accTile(u051), accTile(agg), stTile,
      bidE ? { label: 'U051 지금 입찰의 오차 (30일)', value: num(bidE.nmae, 1), unit: '%', delta: `실제보다 ${num(bidE.bias, 1)}%p 많이 · 실제의 ${num(bidE.ratio, 2)}배`, deltaDir: 'down', title: '최종 공급가능용량(입찰) vs 동복북촌 계량, 시간별, 용량 대비' } : null,
      { label: '기상 예보', value: runTxt(d.status.nwpRun).replace(' 발표', ''), delta: d.status.backfillDone ? '과거분 다 받음' : `과거분 ${d.status.backfillUpTo ? `${d.status.backfillUpTo.slice(2, 4)}.${d.status.backfillUpTo.slice(4, 6)}.${d.status.backfillUpTo.slice(6)}` : ''} 까지 (2월까지 채우는 중)` },
    ].filter(Boolean))}
    ${A.map((a) => card({
      title: `권장 변경입찰량 — ${esc(a.name)}`,
      sub: `다음 변경 가능 시간 <b>${esc(tsShort(a.gate))}</b> (마감 75분 전) · 허용오차 ±${num(a.tol, 2)}MW (ICDM ${num(a.icdm, 1)} × ${num(a.tolRate * 100, 1)}%) · 마지막 계량 ${a.lastQ ? `${esc(a.lastQ.slice(5, 10).replace('-', '.'))} ${esc(a.lastQ.slice(11, 16))}~ 15분 구간` : esc(tsShort(a.lastMeter))} · 입찰 수신 ${esc((a.bidAt || '').slice(5, 16).replace('T', ' '))}`,
      body: table([
        { k: 'ts', label: '시간', fmt: (v, r) => `${esc(tsShort(v))}${r.open ? '' : ' <span class="muted">(마감)</span>'}` },
        { k: 'poa', label: '하루전 낙찰', n: true, fmt: (v) => num(v, 2) },
        { k: 'bid', label: '지금 입찰', n: true, fmt: (v, r) => `${num(v, 2)}${r.rv ? ` <span class="muted">${esc(r.rv)}차</span>` : ''}` },
        { k: 'rec', label: '예측(권장)', n: true, fmt: (v) => `<b>${num(v, 2)}</b>` },
        { k: (r) => (r.lo == null ? '—' : `${num(r.lo, 1)} ~ ${num(r.hi, 1)}`), label: '80% 범위', n: true },
        { k: 'src', label: '근거' },
        { k: 'diff', label: '입찰 − 예측', n: true, fmt: (v) => num(v, 2) },
        { k: 'act', label: '판단', fmt: (v, r) => (v === 'down' ? badge('critical', `낮추기 ▼ ${num(r.excMwh, 2)}`) : v === 'up' ? badge('warning', `올리기 검토 ▲ ${num(r.excMwh, 2)}`) : v === 'ok' ? badge('good', '허용 안') : '—') },
      ], a.rows),
      note: a.note
        ? `${esc(a.note)} — 집합자원 입찰에는 교래ESS 충·방전 계획이 섞여 있어 판단은 표시하지 않습니다(예측은 재생 설비 몫).${a.down?.length ? ` 정지 추정 ${a.down.join(', ')} 은 0.` : ''}`
        : '예측(권장) = 마지막 계량 뒤 9시간까지는 단기 예측(풍력: 마지막 15분·1시간·2시간 계량 + KIM 회귀), 그 뒤는 KIM 예측. 실시간 감축 지시는 바로 알 수 없어 감축 중 계량이 낮으면 권장값도 낮게 나옵니다 — 감축 중이면 낮추지 마세요(기대이익정산금이 줄어듭니다). 판단 숫자 = 허용오차를 넘는 몫(MWh, 그대로 두면 불균형 대상). 이 화면은 읽기 전용 — 변경입찰은 거래소 화면에서 직접 합니다.',
    })).join('')}
    ${d.units.map((u) => card({ title: `${esc(u.name)} — 오늘·${ymdDot(d.target)} 시간별`, sub: `예측 · 80% 범위 · 단기 예측 · 실제 계량 (MW)${u.down.length ? ` · 정지 추정 ${u.down.join(', ')} 제외` : ''}`, body: `<div class="chart" id="gf-${u.id}"></div>` })).join('')}
    <div class="grid g21">
      ${card({ title: '예측 정확도 — 최근 30일', sub: '시간별 오차(용량 대비, 태양광은 7~18시). 저장된 입찰용 예측이 쌓이기 전 날은 그 시점 자료로 다시 계산한 사후 검증', body: `
        ${tiles(d.units.map((u) => ({ label: `${u.id} (${T[u.id]?.liveDays ?? 0}일 실시간)`, value: num(T[u.id]?.nmae, 1), unit: '%', delta: `30일 평균 방식 ${num(T[u.id]?.base, 1)}%` })))}
        <div class="chart" id="gf-track" style="margin-top:12px"></div>
        ${Object.entries(T).some(([, v]) => v.st.some((x) => x.n >= 24)) ? table([{ k: 'id', label: '단기 (계량 후)' }, ...[1, 2, 3, 4, 6, 9].map((L) => ({ k: (r) => r.st.find((x) => x.L === L && x.n >= 24)?.nmae, label: `${L}시간 뒤`, n: true, fmt: (v) => (v == null ? '—' : `${num(v, 1)}%`) }))], Object.entries(T).map(([id, v]) => ({ id, st: v.st }))) : '<p class="muted">단기 예측 정확도는 저장이 하루 넘게 쌓이면 나옵니다.</p>'}` })}
      ${card({ title: '방법', body: `
        <ul class="plain" style="margin:0;padding-left:18px;line-height:1.7">
          <li><b>풍력</b> — KIMR(6.5km)·KIML(2km) 80m 풍속, 설비 주변 3×3 칸 평균 → 앞뒤 시간 평활 → 설비별 경험 출력곡선(0.5 m/s 칸 <b>중앙값</b>, 단조 증가). 교차검증으로 좋아지는 설비만 시각·풍향 보정.</li>
          <li><b>태양광</b> — 그 시간을 덮는 일사(정시 순간값 두 개 + 1시간 평균) × 태양고도 · 기온 · 하층운, 절대오차가 가장 작게 학습(MOS).</li>
          <li><b>학습에서 뺌</b> — 출력 제한(급전지시 &lt; 공급가능용량) 시간 · 정지한 날 · 값 없는 계량.</li>
          <li><b>단기</b> — 풍력: 마지막 15분 계량이 끝난 뒤 경과 시간(15분 단위)마다 마지막 15분·1시간·2시간 계량과 KIM 예측(그 시간·계량 시간)을 절대오차가 가장 작게 회귀. 태양광: 최근 실제/예측 비율과 KIM 을 가중치로 섞음. 계량은 15분 구간이 끝나고 약 5분 뒤 올라옵니다.</li>
          <li><b>범위</b> — 교차검증 잔차를 예측 크기 5구간으로 나눈 10%·90% 분위 (태양광은 낮 시간만).</li>
        </ul>` })}
    </div>
    ${card({ title: `설비별 — ${ymdDot(d.target)} 예상`, body: table([
      { k: 'name', label: '설비', fmt: (v, r) => `${esc(v)} <span class="muted">${esc(r.g)}</span>` },
      { k: 'kind', label: '종류' }, { k: 'cap', label: '용량 MW', n: true, fmt: (v) => num(v, 2) },
      { k: 'status', label: '상태', fmt: (v) => badge(...(STATUS[v] ?? ['na', v])) },
      { k: (r) => r.tomorrow.p, label: '예상 MWh', n: true, fmt: (v) => num(v, 2) },
      { k: (r) => r.cv?.nmae, label: '예측 오차', n: true, fmt: (v) => (v == null ? '—' : `${num(v, 1)}%`) },
      { k: (r) => r.cv?.base, label: '30일 평균 방식', n: true, fmt: (v) => (v == null ? '—' : `${num(v, 1)}%`) },
      { k: (r) => (r.borrowed ? `${r.borrowed} 식 빌림` : `${r.days}일 · ${r.n}시간${r.opt ? ` · ${Object.keys(r.opt).map((k) => ({ hour: '시각', dir: '풍향' })[k]).join('·') || '기본'}` : ''}`), label: '학습' },
    ], d.plants) })}`;

  const day0 = `${d.today.slice(0, 4)}-${d.today.slice(4, 6)}-${d.today.slice(6)}`;
  for (const u of d.units) {
    const R = u.rows.filter((x) => x.ts >= `${day0} 00:00`).slice(0, 48);
    const s = [
      { name: 'KIM 예측', values: R.map((x) => x.p), color: 'var(--s1)' },
      { name: '단기 예측', values: R.map((x) => x.st ?? null), color: 'var(--s3)', dash: true },
      { name: '실제', values: R.map((x) => x.a), color: 'var(--s2)' },
    ];
    const el = root.querySelector(`#gf-${u.id}`);
    el.insertAdjacentHTML('beforebegin', legendHtml(s));
    lineChart(el, { x: R.map((x) => tsShort(x.ts)), series: s, band: { lo: R.map((x) => x.p10 ?? null), hi: R.map((x) => x.p90 ?? null), name: '80% 범위' }, yFmt: (v) => num(v, u.cap > 5 ? 0 : 1), tipFmt: (v) => `${num(v, 2)} MW`, height: 240, xEvery: 6 });
  }
  const days = [...new Set(Object.values(T).flatMap((v) => v.daily.map((x) => x.d)))].sort();
  if (days.length) {
    const cols = ['var(--s1)', 'var(--s4)'];
    const s = Object.entries(T).flatMap(([id, v], i) => [
      { name: `${id} 예측`, values: days.map((dd) => v.daily.find((x) => x.d === dd)?.nmae ?? null), color: cols[i % 2] },
      { name: `${id} 30일 평균 방식`, values: days.map((dd) => v.daily.find((x) => x.d === dd)?.base ?? null), color: cols[i % 2], dash: true },
    ]);
    const el = root.querySelector('#gf-track');
    el.insertAdjacentHTML('beforebegin', legendHtml(s));
    lineChart(el, { x: days.map((x) => `${x.slice(5, 7)}.${x.slice(8)}`), series: s, yFmt: (v) => `${num(v, 0)}%`, tipFmt: (v) => `${num(v, 1)}%`, height: 200 });
  }
}
