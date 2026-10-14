
/* =====================================================================
   App shell: light/dark theme, pop-up panel, install + pin to taskbar,
   window placement, taskbar quick links, offline support
   ===================================================================== */
const rootEl = document.documentElement;
const isStandalone = () => rootEl.classList.contains('standalone');
const popupMode = () => !isStandalone() && window.matchMedia('(min-width:720px) and (min-height:480px)').matches;

/* ---------- light / dark theme (light by default; the choice is remembered) ---------- */
function applyTheme(t){
  t = t === 'dark' ? 'dark' : 'light';
  rootEl.setAttribute('data-theme', t);
  const b = $('themeBtn');
  if(b){
    b.querySelector('.ico').textContent = t === 'dark' ? '☀️' : '🌙';
    b.querySelector('.lbl').textContent = t === 'dark' ? 'Light' : 'Dark';
    b.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
}
applyTheme(rootEl.getAttribute('data-theme'));
$('themeBtn').addEventListener('click', () => {
  const next = rootEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('pmoTheme', next); } catch(e) {}
});

/* ---------- pop-up panel: minimise to the avatar launcher, reopen from it ---------- */
function setPanel(open){
  rootEl.classList.toggle('panel-closed', !open);
  $('launcher').setAttribute('aria-expanded', String(!!open));
  if(open && popupMode()) setTimeout(() => $('inp').focus(), 320);
}
$('minBtn').addEventListener('click', () => setPanel(false));
$('launcher').addEventListener('click', () => setPanel(true));
$('lOpen').addEventListener('click', () => setPanel(true));
$('launcherAvatar').innerHTML = avatarHtml('welcome', {ring:true});
$('lNwc').src  = document.querySelector('.brand.nwc img').src;
$('lHill').src = document.querySelector('.brand.hill img').src;

/* ---------- install as an app + pin to the Windows taskbar ---------- */
let deferredPrompt = null;
const toast = msg => { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 6500); };
function detectPlatform(){
  const ua = navigator.userAgent || '';
  if(/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if(/Android/.test(ua)) return 'android';
  if(/Edg\//.test(ua)) return 'edge';
  if(/Chrome\//.test(ua)) return 'chrome';
  return 'other';
}
const INSTALL_HELP = {
  edge:   {label:'Microsoft Edge (Windows)', sub:'Install once, then open it from the taskbar like any other Windows app.', steps:[
            'Click the <b>⋯</b> menu at the top-right of Edge → <b>Apps</b> → <b>Install this site as an app</b>.',
            'In the window that appears tick <b>Pin to taskbar</b> (and <b>Pin to Start</b> if you like), then click <b>Install</b>.',
            'Click the <b>PMO Bot avatar</b> on your taskbar any time. It opens in its own small window &mdash; drag it to the bottom-right corner and Windows remembers the spot. Right-click the icon for quick links (Portfolio, Troubled, Delayed).']},
  chrome: {label:'Google Chrome (Windows)', sub:'Install once, then open it from the taskbar like any other Windows app.', steps:[
            'Click the <b>⋮</b> menu at the top-right of Chrome → <b>Cast, save and share</b> → <b>Install page as app…</b> (or click the install icon in the address bar) and press <b>Install</b>.',
            'The app opens in its own window. Right-click its icon on the taskbar → <b>Pin to taskbar</b>.',
            'From then on click the <b>PMO Bot avatar</b> on the taskbar &mdash; right-click it for quick links (Portfolio, Troubled, Delayed).']},
  ios:    {label:'iPhone / iPad (Safari)', sub:'Add the bot to your Home Screen.', steps:[
            'Tap the <b>Share</b> button (square with an arrow) at the bottom of Safari.',
            'Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.',
            'Open the <b>PMO Bot</b> avatar icon from your Home Screen.']},
  android:{label:'Android (Chrome)', sub:'Add the bot to your Home screen.', steps:[
            'Tap the <b>⋮</b> menu in Chrome → <b>Install app</b> (or <b>Add to Home screen</b>).',
            'Confirm with <b>Install</b>.',
            'Open the <b>PMO Bot</b> avatar icon from your Home screen.']},
};
function openInstallModal(){
  const p = detectPlatform(), main = INSTALL_HELP[p] || INSTALL_HELP.edge;
  $('imTitle').innerHTML = '📌 Install the PMO Bot &amp; pin it';
  $('imSub').textContent = (INSTALL_HELP[p] ? main.label + ' — ' : 'Windows — ') + main.sub;
  $('imSteps').innerHTML = main.steps.map(s => `<li>${s}</li>`).join('');
  $('imOtherBody').innerHTML = Object.keys(INSTALL_HELP).filter(k => INSTALL_HELP[k] !== main)
    .map(k => `<p><b>${INSTALL_HELP[k].label}</b></p><ol>${INSTALL_HELP[k].steps.map(s => `<li>${s}</li>`).join('')}</ol>`).join('');
  $('installModal').classList.add('open');
  $('imClose').focus();
}
function closeInstallModal(){ $('installModal').classList.remove('open'); }
async function installFlow(){
  if(deferredPrompt){
    try {
      deferredPrompt.prompt();
      const r = await deferredPrompt.userChoice; deferredPrompt = null;
      if(r && r.outcome === 'accepted') toast('Installing… tick “Pin to taskbar” if Windows asks, or right-click the icon → Pin to taskbar.');
    } catch(e) { openInstallModal(); }
  } else openInstallModal();
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });
window.addEventListener('appinstalled', () => { deferredPrompt = null; $('installBtn').hidden = true; toast('PMO Bot installed. Right-click its icon on the taskbar → Pin to taskbar.'); });
$('installBtn').addEventListener('click', installFlow);
$('lInstall').addEventListener('click', installFlow);
$('imClose').addEventListener('click', closeInstallModal);
$('installModal').addEventListener('click', e => { if(e.target === $('installModal')) closeInstallModal(); });
if(isStandalone()){ $('installBtn').hidden = true; }

document.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  if($('installModal').classList.contains('open')) closeInstallModal();
  else if(popupMode()) setPanel(false);
});

/* ---------- installed app: open as a small window in the bottom-right corner of the screen ---------- */
function positionAsPopup(win, scr){
  try {
    if(!win || typeof win.resizeTo !== 'function' || typeof win.moveTo !== 'function') return false;
    if(win.innerWidth <= 560) return false;                              // already small (the user's own size) - leave it alone
    const w = 440, h = Math.min(780, scr.availHeight - 16);
    win.resizeTo(w, h);
    win.moveTo((scr.availLeft || 0) + scr.availWidth - w - 8, (scr.availTop || 0) + scr.availHeight - h - 8);
    return true;
  } catch(e) { return false; }
}
if(isStandalone()){
  try { if(!sessionStorage.getItem('pmoPlaced')){ sessionStorage.setItem('pmoPlaced', '1'); positionAsPopup(window, window.screen); } } catch(e) {}
}

/* ---------- taskbar quick links (?q=portfolio / troubled / delayed ...) ---------- */
(function(){
  const q = (new URLSearchParams(location.search).get('q') || '').trim();
  if(!q) return;
  try { history.replaceState(null, '', location.pathname + location.hash); } catch(e) {}
  if(/^portfolio$/i.test(q)){ const pf = document.querySelector('.card.pf'); if(pf) scrollToTop(pf.closest('.msgrow')); return; }   // already on screen
  setTimeout(() => handleQuery(q, cap(q)), 500);
})();

/* ---------- offline support (https / localhost only) ---------- */
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
if(popupMode()) setTimeout(() => { try { $('inp').focus({preventScroll:true}); } catch(e) {} }, 400);

/* report date shown in the header / start page comes from the loaded weekly file */
document.querySelectorAll('[data-rd]').forEach(e => { e.textContent = REPORT_DATE; });
