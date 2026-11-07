// ⑥ 규정 준수 — 점검표
import { tiles, card, table, badge, esc, pct, won, STATUS } from '../ui.mjs';

const fmtV = (v, f) => {
  if (v == null) return '—';
  if (f === 'pct') return pct(v);
  if (f === 'won') return `${won(v)}<small>원</small>`;
  if (f === 'days') return `${v}<small>일</small>`;
  if (f === 'count') return `${v}<small>곳</small>`;
  return esc(v);
};

export function render(root, d) {
  const S = d.summary;
  const overall = S.critical ? 'critical' : S.warning ? 'warning' : 'good';
  const order = { critical: 0, serious: 1, warning: 2, good: 3, na: 4 };
  const items = d.items.slice().sort((a, b) => order[a.status] - order[b.status]);
  const R = d.rules;
  root.innerHTML = `
    ${tiles([
      { label: '종합', value: `${badge(overall, overall === 'good' ? '양호' : overall === 'warning' ? '주의 항목 있음' : '조치 필요')}` },
      { label: '양호', value: `${S.good}`, unit: `/ ${S.total} 항목` },
      { label: '주의', value: `${S.warning}`, unit: '항목' },
      { label: '위반·위험', value: `${S.critical}`, unit: '항목', deltaDir: S.critical ? 'down' : '', delta: S.critical ? '아래 빨간 카드부터 조치' : '' },
    ])}
    <div class="grid g2">
      ${items.map((x) => card({ title: x.title, sub: `${esc(x.part)} · 목표 ${esc(x.target)}`, body: `
        <div class="check"><div class="v">${fmtV(x.value, x.fmt)}</div><div>${badge(x.status, STATUS[x.status]?.label)}</div></div>
        <p style="margin:6px 0 0;font-size:13px">${esc(x.detail ?? '')}</p>
        <div class="rule"><b>근거</b> ${esc(x.rule)}<br><b>조치</b> ${esc(x.action)}</div>` })).join('')}
    </div>
    <p class="section-title">규칙 참고 — 전력시장운영규칙 · 비용평가세부운영규정</p>
    <div class="grid g2">
      ${card({ title: '마감 · 일정', body: table([{ k: 'k', label: '항목' }, { k: 'v', label: '내용' }, { k: 'ref', label: '근거' }], R.deadlines) })}
      ${card({ title: '입찰', body: table([{ k: 'k', label: '항목' }, { k: 'v', label: '내용' }, { k: 'ref', label: '근거' }], R.bidding) })}
      ${card({ title: '정산 (별표33)', body: table([{ k: 'k', label: '항목' }, { k: 'v', label: '내용' }, { k: 'ref', label: '근거' }], R.settlement) })}
      ${card({ title: 'RPCF (성과연동형 용량가격계수)', body: table([{ k: 'k', label: '항목' }, { k: 'v', label: '내용' }, { k: 'ref', label: '근거' }], R.rpcf) })}
    </div>
    <p class="muted" style="font-size:12px">점검 기준 중 "내부 목표"는 규칙 조항이 아니라 운영 목표입니다. 규칙 해석이 바뀌면 src/analysis/hub.mjs 의 compliance() 와 rules.mjs 를 함께 고칩니다.</p>`;
}
