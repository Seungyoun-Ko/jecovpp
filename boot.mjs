// 게시본 시작 — 암호로 data.json 을 풀어 화면(hub.mjs)에 넘긴다. 암호·풀린 자료는 메모리에만 있다.
const $ = (s) => document.querySelector(s);
const u8 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let env = null;
async function load() {
  const r = await fetch('./data.json?ts=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('게시 자료를 받지 못했습니다 (HTTP ' + r.status + ')');
  env = await r.json();
  $('#gate-at').textContent = (env.publishedAt || '').slice(0, 16).replace('T', ' ');
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
    p.value = '';
    $('#gate').remove();
    await import('./hub.mjs');
  } catch (err) {
    $('#gate-msg').textContent = err.message; go.disabled = false; p.select();
  }
});
