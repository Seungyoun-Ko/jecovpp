// 통합 모니터링 껍데기 — 파트 이동(#주소), 기간·기준일, 자료 불러오기, 밝게/어둡게
import { esc } from './ui.mjs';

const PARTS = {
  overview: { title: '종합 상황판', sub: '오늘 지금 — 중개 집합자원 · JECO 설비 · 시장 · 경보', range: false, refresh: 60 },
  livegen: { title: '실시간 발전 (발전기별)', sub: '발전기마다 오늘 15분 출력 · 어제 · 예측 — 중개 집합자원은 회원별로 쌓아서, 급전지시·입찰과 비교', range: false, refresh: 300 },
  market: { title: '전력시장', sub: '제주 SMP(하루전·실시간) · 마이너스 가격 · 예비력가격 · 제주 수요 · 가격결정 발전기', range: true },
  daforecast: { title: '하루전 SMP 예측 (입찰용)', sub: '하루전 입찰 마감(D-1 11:00) 전에 내일 24시간 하루전 SMP 를 내다봅니다 — 실제 가격은 D-1 18~22시 공개', range: false, refresh: 300 },
  genforecast: { title: '발전량 예측 (기상청 KIM)', sub: '설비별 태양광·풍력 발전량 예측 — 하루전 입찰용(전전날 21시 발표) · 단기(최근 계량 섞기) · 권장 변경입찰량', range: false, refresh: 300 },
  broker: { title: '중개사업 (집합자원)', sub: '급전지시 추종 · 허용오차 · 임밸런스 원인 · 회원(보유자원)별 배분 · 입찰 구성 점검', range: true },
  fleet: { title: '발전사업 (JECO 설비)', sub: '발전사업자 계정(거래자 0600) — 발전원별 발전량 · 이용률 · 가동률 · 설비 상태', range: true },
  dispatch: { title: '급전 · 낙찰 대비 지시', sub: '하루전 낙찰 → 최종입찰 → 급전지시 → 발전 — 줄어든 몫이 우리 변경입찰인지 거래소 감축 지시인지', range: true, days: 30 },
  finance: { title: '정산 · 수익', sub: '월별·일별 정산 구성 · 원/MWh · 수정정산 · 청구서 대사', range: true },
  compliance: { title: '규정 준수', sub: '전력시장운영규칙 · 별표33 · 비용평가규정 기준 운영 점검표', range: true },
  joinsim: { title: '편입 우선순위 · 급전시험', sub: '미참여 설비를 집합자원에 넣을 순서 — 노후 설비는 출력을 못 줄이니 교래ESS 가 대신 흡수할 수 있는지 12개월 실측으로 시험', range: false },
  bizdev: { title: '사업모델 발굴', sub: '실제 시장·운영 자료로 따져 본 수익 기회 — 가정을 바꿔 다시 계산할 수 있습니다', range: true, days: 90 },
};
const state = {
  part: 'overview', days: 14, to: '',
  token: new URLSearchParams(location.search).get('token') || sessionStorage.getItem('cms-token') || '',
  timer: null, seq: 0,
};
if (state.token) sessionStorage.setItem('cms-token', state.token);
try { const t = localStorage.getItem('hub-theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* 저장 불가 */ }
try { const d = Number(localStorage.getItem('hub-days')); if ([7, 14, 30, 90].includes(d)) state.days = d; } catch { /* 저장 불가 */ }

const $ = (s) => document.querySelector(s);
const view = $('#view');

// 잠근 게시본(GitHub Pages 등)에서는 boot.mjs 가 풀어 둔 자료를 쓴다 — 서버 없이 미리 계산된 기간(7·14·30·90일)만
const STATIC = globalThis.CMS_STATIC || null;

// 게시본이 오래됐으면(3시간 넘게 새로 안 올라옴) 맨 위에 알린다 — 이 PC 가 꺼졌거나 게시 작업이 멈춘 경우
export function staleText(generatedAt, now = Date.now()) {
  const t = Date.parse(generatedAt || '');
  if (!Number.isFinite(t)) return null;
  const h = (now - t) / 3600e3;
  if (h <= 3) return null;
  const ago = h >= 48 ? `${Math.round(h / 24)}일` : `${Math.round(h)}시간`;
  return `이 게시본은 ${ago} 전(${generatedAt.slice(5, 16).replace('T', ' ')}) 자료입니다 — 평소에는 매시 55분에 새로 올라옵니다. 모니터링 PC 가 꺼졌거나 게시 작업이 멈췄을 수 있습니다.`;
}
function showStale() {
  if (!STATIC || typeof document === 'undefined') return;
  const msg = staleText(STATIC.generatedAt);
  let el = document.getElementById('stale');
  if (!msg) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'stale'; el.className = 'alert serious stale'; document.getElementById('view')?.before(el); }
  el.innerHTML = `<span class="ai">⚠</span><div><b>오래된 자료</b> ${msg.replace(/[<>&]/g, ' ')}</div>`;
}
showStale();
if (STATIC && typeof setInterval === 'function') setInterval(showStale, 10 * 60e3);

export async function api(part, extra = {}) {
  if (STATIC) {
    const days = extra.days ?? state.days;
    const hit = STATIC.parts[`${part}|${days}`] ?? STATIC.parts[part];
    if (!hit) throw new Error(`게시본에 이 화면(${part}, ${days}일) 자료가 없습니다.`);
    return hit;
  }
  const q = new URLSearchParams({ days: String(extra.days ?? state.days), ...(state.to ? { to: state.to.replaceAll('-', '') } : {}) });
  const res = await fetch(`/api/hub/${part}?${q}`, { headers: state.token ? { 'X-CMS-Token': state.token } : {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error([body.error || `HTTP ${res.status}`, body.detail].filter(Boolean).join(' — '));
  return body;
}

async function show(part, attempt = 0) {
  if (!PARTS[part]) part = 'overview';
  state.part = part;
  const P = PARTS[part];
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.part === part));
  $('#part-title').textContent = P.title;
  $('#part-sub').textContent = P.sub;
  $('#range').style.visibility = P.range ? 'visible' : 'hidden';
  document.querySelectorAll('#range button').forEach((b) => b.classList.toggle('on', Number(b.dataset.days) === (P.days && !state.userDays ? P.days : state.days)));
  document.title = `${P.title} · JECO 통합 모니터링`;
  $('#side').classList.remove('open');
  clearInterval(state.timer);
  const my = ++state.seq;
  view.innerHTML = '<div class="tiles"><div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div></div><div class="skel" style="height:280px"></div><p class="muted">불러오는 중… 처음 여는 기간은 계산에 시간이 걸릴 수 있습니다.</p>';
  try {
    const mod = await import(`./parts/${part}.mjs`);
    const days = P.days && !state.userDays ? P.days : state.days;
    const data = await api(part, { days });
    if (my !== state.seq) return;
    view.innerHTML = data.stale ? '<p class="muted" style="margin:0">⚠ 방금 계산이 실패해 직전 결과를 보여 줍니다. 잠시 뒤 저절로 새로 고칩니다.</p>' : '';
    const holder = document.createElement('div');
    holder.style.cssText = 'display:flex;flex-direction:column;gap:16px';
    view.appendChild(holder);
    mod.render(holder, data, { api, days, part });
    if (data.fresh) showCollectState(data.fresh);
    $('#foot').textContent = `자료 기준 ${(data.cachedAt || data.asOf || '').slice(0, 16).replace('T', ' ')}${STATIC ? ' · 잠근 게시본 (게시 시점 자료)' : ''} · 조회 전용 (거래소 자료를 읽기만 합니다) · 영업정보 — 사내 사용`;
    if (P.refresh) state.timer = setInterval(() => { if (state.part === part && !document.hidden) show(part); }, P.refresh * 1000);
  } catch (e) {
    if (my !== state.seq) return;
    // 수집 작업이 DB 를 고치는 몇 초 동안 실패할 수 있다 — 두 번까지 저절로 다시 시도
    if (attempt < 2 && !/토큰|401/.test(e.message)) {
      view.insertAdjacentHTML('beforeend', `<p class="muted">잠시 실패 — ${attempt + 1}번째 다시 시도하는 중…</p>`);
      setTimeout(() => { if (my === state.seq) show(part, attempt + 1); }, 4000);
      return;
    }
    view.innerHTML = `<div class="err"><b>불러오지 못했습니다.</b><p>${esc(e.message)}</p>
      <p class="muted">${STATIC ? '게시본에 이 화면 자료가 없을 수 있습니다. 다른 기간을 고르거나 다음 게시를 기다리세요.' : '서버(start.cmd)가 켜져 있는지, 외부 접속이면 접근 토큰이 맞는지 확인하세요.'}</p>
      <button type="button" class="btn" id="retry">다시 시도</button></div>`;
    view.querySelector('#retry').addEventListener('click', () => show(part));
    if (P.refresh) state.timer = setInterval(() => { if (state.part === part && !document.hidden) show(part); }, P.refresh * 1000);
  }
}

/** 사이드바 아래 수집 상태 — 종합 상황판 자료로 채운다 */
function showCollectState(F) {
  const el = $('#collect-state');
  if (!el || !F) return;
  const late = F.runLagMin != null && F.runLagMin > 90;
  el.innerHTML = `${late ? '⚠ 수집 멈춤?' : '● 수집 중'} · 마지막 ${F.lastRun ? esc(F.lastRun.slice(5)) : '—'}${F.fail24 ? `<br>24시간 실패 ${F.fail24}건` : ''}`;
  el.style.color = late ? 'var(--critical)' : '';
}
api('overview').then((d) => showCollectState(d.fresh)).catch(() => { const el = $('#collect-state'); if (el) el.textContent = '수집 상태를 읽지 못했습니다'; });

function route() { show((location.hash || '#overview').slice(1)); }

$('#range').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-days]');
  if (!b) return;
  state.days = Number(b.dataset.days);
  state.userDays = true;
  try { localStorage.setItem('hub-days', String(state.days)); } catch { /* 무시 */ }
  show(state.part);
});
$('#to').addEventListener('change', (e) => { state.to = e.target.value; show(state.part); });
$('#reload').addEventListener('click', () => show(state.part));
$('#theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('hub-theme', document.documentElement.dataset.theme); } catch { /* 무시 */ }
  show(state.part);
});
$('#menu').addEventListener('click', () => $('#side').classList.toggle('open'));
// 지금 화면의 표를 모두 CSV 로 (엑셀에서 바로 열리게 BOM · 표마다 제목 줄)
$('#dl')?.addEventListener('click', () => {
  const cell = (t) => { const s = t.replace(/\s+/g, ' ').trim(); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
  const lines = [`${PARTS[state.part].title},${$('#foot').textContent.split(' · ')[0]}`];
  view.querySelectorAll('table').forEach((t) => {
    const title = t.closest('.card')?.querySelector('h2,h3,.card-title,header b')?.textContent ?? '';
    lines.push('', cell(title));
    t.querySelectorAll('tr').forEach((tr) => lines.push([...tr.children].map((c) => cell(c.textContent)).join(',')));
  });
  if (lines.length === 1) { alert('이 화면에는 내려받을 표가 없습니다.'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`﻿${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' }));
  a.download = `JECO_${state.part}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
window.addEventListener('hashchange', route);
let rz;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => show(state.part), 400); });
if (state.token) {
  for (const a of ['#lnk-classic', '#lnk-mobile']) $(a).href += `?token=${encodeURIComponent(state.token)}`;
}
route();
