// 게시본 시작 — 암호로 data.json 을 풀어 화면(hub.mjs)에 넘긴다. 암호·풀린 자료는 메모리에만 있다.
// 연 뒤에는 stamp.json(게시 시각만, 몇십 바이트)을 2분마다 보고, 새 게시분이 있으면 data.json 을 받아 같은 암호로 풀어 화면을 바꾼다.
const $ = (s) => document.querySelector(s);
const u8 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let env = null;
let pass = null;          // 탭 메모리에만 — 새 게시분을 풀 때 쓴다
let busy = false;
async function load() {
  const r = await fetch('./data.json?ts=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('게시 자료를 받지 못했습니다 (HTTP ' + r.status + ')');
  env = await r.json();
  const g = $('#gate-at');                                  // 연 뒤에는 암호 화면이 없다
  if (g) g.textContent = (env.publishedAt || '').slice(0, 16).replace('T', ' ');
}
async function unseal(pass) {
  if (!crypto.subtle) throw new Error('이 브라우저는 암호 풀기(WebCrypto)를 지원하지 않습니다. https 주소로 여세요.');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: u8(env.salt), iterations: env.iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  let plain;
  try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8(env.iv) }, key, u8(env.ct)); } catch { throw new Error('암호가 맞지 않습니다.'); }
  const text = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(text);
}
load().catch((e) => { $('#gate-msg').textContent = e.message; });
$('#gate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = $('#gate-pass'); const go = $('#gate-go');
  go.disabled = true; $('#gate-msg').textContent = '여는 중…';
  try {
    if (!env) await load();
    globalThis.CMS_STATIC = await unseal(p.value);
    pass = p.value;
    p.value = '';
    $('#gate').remove();
    await import('./hub.mjs');
    setInterval(check, 2 * 60e3);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  } catch (err) {
    $('#gate-msg').textContent = err.message; go.disabled = false; p.select();
  }
});
/** 새 게시분이 올라왔으면 받아서 풀고 화면에 알린다 (hub.mjs 가 'cms-static' 을 받아 지금 화면을 다시 그림) */
async function check() {
  if (busy || !pass) return;
  busy = true;
  try {
    let at = null;
    const s = await fetch('./stamp.json?ts=' + Date.now(), { cache: 'no-store' });
    if (s.ok) at = (await s.json()).publishedAt;
    if (at && at === env.publishedAt) return;
    const old = env.publishedAt;
    await load();
    if (env.publishedAt === old) return;
    globalThis.CMS_STATIC = await unseal(pass);
    dispatchEvent(new Event('cms-static'));
  } catch (e) {
    // 암호가 바뀌었으면 다시 넣어야 한다 — 맨 위에 알림
    if (/암호가 맞지/.test(e.message)) { pass = null; dispatchEvent(new CustomEvent('cms-static-error', { detail: '화면 암호가 바뀌었습니다. 새로 고침(F5) 뒤 새 암호를 넣으세요.' })); }
  } finally { busy = false; }
}
