
/* =====================================================================
   Reports: SGR (stage gates), Expected Trouble, T&C, Handover, Data updates
   "Today" is the viewer's own date (or ?today=YYYY-MM-DD for previews/tests), so the flags are right on any day without a rebuild.
   ===================================================================== */
const MS_DAY = 86400000;
const parseISO = s => { if(!s) return null; const a = s.split('-').map(Number); return new Date(a[0], a[1]-1, a[2]); };
const isoOf = d => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : null;
const dayDiff = (a, b) => Math.round((a - b) / MS_DAY);                 // a - b in whole days
function addMonths(d, n){ const r = new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); if(r.getDate() !== d.getDate()) r.setDate(0); return r; }
function todayDate(){
  const m = /[?&]today=(\d{4}-\d{2}-\d{2})/.exec(location.search);
  if(m) return parseISO(m[1]);
  const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
const inDays = n => n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? `in ${n} days` : `${-n} days ago`;
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/* ---------- Stage Gate Review rules ---------- */
const SGR_RED_DAYS = 7, SGR_YELLOW_DAYS = 21, SGR_STALE_MONTHS = 3;
function gateInfo(p, today){
  if(!p.gates) return {state:'nodata', gs:null};
  const cutoff = addMonths(today, -SGR_STALE_MONTHS);
  const gs = p.gates.map((g, i) => { const s = parseISO(g[0]), e = parseISO(g[1]); return {n:i+1, name:GATES[i].name, s, e, ok: !!(s && e && e >= s)}; });
  if(!gs.some(g => g.ok)) return {state:'nodata', gs};
  const live = gs.filter(g => g.ok && g.e >= cutoff);                      // a gate that ended more than 3 months ago is not considered
  const inside = live.filter(g => g.s <= today && today <= g.e);
  let cur = null, state = 'stale';
  if(inside.length){ cur = inside[inside.length-1]; state = 'ongoing'; }   // windows may overlap: the later gate wins
  else { const past = live.filter(g => g.e < today); if(past.length){ cur = past[past.length-1]; state = 'overdue'; } }   // ended within 3 months: its SGR is overdue
  if(!cur && live.length) state = 'notstarted';                               // some gate is still ahead, none has started
  const next = live.filter(g => g.s > today).sort((a, b) => a.s - b.s)[0] || null;
  gs.forEach(g => {
    g.st = !g.ok ? 'nodates' : g.e < cutoff ? 'ignored' : cur && g.n === cur.n ? 'current' : g.s <= today && today <= g.e ? 'overlap' : g.e < today ? 'done' : 'upcoming';
  });
  return {state, cur, next, gs, days: cur ? dayDiff(cur.e, today) : null, cutoff, today};
}
function sgrFlag(info){
  if(info.state === 'nodata') return {k:'grey', sub:'nodata', label:'No gate data', detail:'This project is not in the gates schedule file (or has no usable gate dates).', key:1e9};
  if(info.state === 'stale')  return {k:'grey', sub:'stale', label:'No active gate', detail:'All planned gate dates are more than 3 months old.', key:1e9};
  if(info.state === 'notstarted') return {k:'grey', sub:'notstarted', label:'No active gate', detail:`Not started yet — Gate ${info.next.n} · ${info.next.name} starts ${fmtDate(isoOf(info.next.s))} (${inDays(dayDiff(info.next.s, info.today))})`, key:1e9};
  const c = info.cur, end = fmtDate(isoOf(c.e)), name = `Gate ${c.n} · ${c.name}`, d = info.days;
  if(info.state === 'overdue') return {k:'red', blink:true, label:'SGR overdue', detail:`${name} · ended ${end} (${inDays(d)})`, key:d};
  const k = d <= SGR_RED_DAYS ? 'red' : d <= SGR_YELLOW_DAYS ? 'yellow' : 'green';
  const label = k === 'red' ? 'SGR due within 1 week' : k === 'yellow' ? 'SGR due within 3 weeks' : 'No SGR needed soon';
  return {k, blink: k === 'red', label, detail:`${name} · ends ${end} (${inDays(d)})`, key:d};
}
const flagDot = f => `<span class="fldot fl-${f.k}${f.blink ? ' blink' : ''}" aria-hidden="true"></span>`;
function gateRows(info, today){                                            // the eight gates against today's date
  return info.gs.map(g => {
    let txt;
    if(!g.ok) txt = 'no dates';
    else {
      const range = `${fmtDate(isoOf(g.s))} → ${fmtDate(isoOf(g.e))}`;
      const rel = g.st === 'ignored' ? `ended ${inDays(dayDiff(g.e, today))} — older than 3 months, not considered`
                : g.st === 'current' ? (info.state === 'overdue' ? `current gate · ended ${inDays(dayDiff(g.e, today))}` : `current gate · ends ${inDays(dayDiff(g.e, today))}`)
                : g.st === 'overlap' ? `in its window too (ends ${inDays(dayDiff(g.e, today))})`
                : g.st === 'done' ? `ended ${inDays(dayDiff(g.e, today))}` : `starts ${inDays(dayDiff(g.s, today))}`;
      txt = `${range}<br><span class="grel">${rel}</span>`;
    }
    return `<div class="grow g-${g.st}"><span class="gn">${g.n}</span><div><div class="gname">${esc(g.name)}${g.st === 'current' ? ' <b class="gcur">◀ current</b>' : ''}</div><div class="gdates">${txt}</div></div></div>`;
  }).join('');
}
function sgrBlock(p){                                                      // goes on every project card
  const today = todayDate(), info = gateInfo(p, today), f = sgrFlag(info);
  const table = info.gs ? `<details class="gtbl"><summary>All gates 1–8 compared with today (${fmtDate(isoOf(today))})</summary><div class="gates">${gateRows(info, today)}</div></details>` : '';
  return `<div class="sgrblock sg-${f.k}"><div class="sgrline">${flagDot(f)}<div class="sgrtxt"><b>${f.label}</b><span>${f.detail}</span></div></div>${table}</div>`;
}

/* ---------- shared bits for the report cards ---------- */
function repCard(title, titleAr, sub){
  const card = document.createElement('div'); card.className = 'card pf rep';
  card.innerHTML = `<div class="strip"></div><div class="pfhead"><div class="t"><b>${title}</b><small>${titleAr}</small></div><div class="d">${sub}</div></div><div class="rbody"></div>`;
  return card;
}
function pill(k, n, label, attrs){ return `<button class="rpill" ${attrs || ''}>${k ? `<span class="fldot fl-${k}${k === 'red' ? ' blink' : ''}" aria-hidden="true"></span>` : ''}<b>${n}</b><span>${label}</span></button>`; }
function projRow(p, line1, line2, tagHtml, extraCls){
  return `<button class="rrow ${extraCls || ''}" data-po="${p.po}"><span class="rr-top"><span class="rr-name">${esc(p.name)}</span></span>` +
         `<span class="rr-meta">${tagHtml || ''}<b>PO ${p.po}</b><span>${p.areaEn}</span><span>${ST[p.sk].dot} ${ST[p.sk].en}</span></span>${line1 ? `<span class="rr-line">${line1}</span>` : ''}${line2 ? `<span class="rr-line sub">${line2}</span>` : ''}</button>`;
}
function wireRows(root){ root.querySelectorAll('.rrow, .openbtn').forEach(b => b.addEventListener('click', e => { e.preventDefault(); handleQuery(b.dataset.po); })); }
function finishReport(card){ const row = botRow(card, true, 'planning'); scrollToTop(row); return row; }

/* ---------- SGR tab ---------- */
const SGR_FILTERS = [['all','All'], ['redyellow','Red + Yellow'], ['red','Red'], ['yellow','Yellow'], ['green','Green'], ['none','No gate']];
function addSgrTab(filter){
  const today = todayDate();
  const rows = PROJECTS.map(p => { const info = gateInfo(p, today); return {p, info, f:sgrFlag(info)}; }).sort((a, b) => a.f.key - b.f.key || a.p.ord - b.p.ord);
  const n = k => rows.filter(r => r.f.k === k).length;
  const counts = {all: rows.length, redyellow: n('red') + n('yellow'), red: n('red'), yellow: n('yellow'), green: n('green'), none: n('grey')};
  const card = repCard('Stage Gate Review (SGR)', 'مراجعة بوابات المراحل', `Today: <b>${fmtDate(isoOf(today))}</b> · the SGR date is the end date of a project's current gate`);
  const dist = GATES.map(g => ({g, c: rows.filter(r => r.info.cur && r.info.cur.n === g.n).length})).filter(x => x.c);
  const legend = `<div class="rrule"><span class="fldot fl-red blink"></span> SGR within 1 week (or overdue) · <span class="fldot fl-yellow"></span> within 3 weeks · <span class="fldot fl-green"></span> later · <span class="fldot fl-grey"></span> no active gate</div>`;
  card.querySelector('.rbody').innerHTML = legend +
    `<div class="rfilters" role="group" aria-label="Filter by SGR flag">${SGR_FILTERS.map(([k, l]) => `<button class="rpill rf" data-f="${k}" aria-pressed="false"><b>${counts[k]}</b><span>${l}</span></button>`).join('')}</div>` +
    `<details class="gdist"><summary>Projects by current gate</summary>${dist.map(x => `<div class="gd"><span class="gn">${x.g.n}</span><span>${esc(x.g.name)}</span><b>${x.c}</b></div>`).join('') || '<div class="gd">—</div>'}</details>` +
    '<div class="rlist"></div>';
  const list = card.querySelector('.rlist');
  const show = k => {
    card.querySelectorAll('.rf').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === k ? 'true' : 'false'));
    const keep = r => k === 'all' ? true : k === 'redyellow' ? (r.f.k === 'red' || r.f.k === 'yellow') : k === 'none' ? r.f.k === 'grey' : r.f.k === k;
    const sel = rows.filter(keep);
    list.innerHTML = sel.length ? sel.map(r => `<details class="srow sg-${r.f.k}"><summary><span class="srow-h">${flagDot(r.f)}<span class="rr-name">${esc(r.p.name)}</span></span><span class="rr-meta"><b>PO ${r.p.po}</b><span>${r.p.areaEn}</span></span><span class="rr-line"><b>${r.f.label}</b> — ${r.f.detail}</span></summary>` +
        `<div class="sbody">${r.info.gs ? `<div class="gates">${gateRows(r.info, today)}</div>` : ''}<button class="optbtn openbtn" data-po="${r.p.po}">Open the control card</button></div></details>`).join('')
      : '<div class="rempty">No projects in this group.</div>';
    wireRows(list);
  };
  card.querySelectorAll('.rf').forEach(b => b.addEventListener('click', () => show(b.dataset.f)));
  finishReport(card); show(filter || 'all');
}

/* ---------- Handover (Partial Initial Handover = column M "نعم"; Initial Handover = status "استلام ابتدائي") ---------- */
const handoverCat = p => p.sk === 'handover' ? 'initial' : p.hoPartial ? 'partial' : 'none';      // a project already in Initial Handover is not also counted as partial
function addHandoverTab(focus){
  const part = PROJECTS.filter(p => handoverCat(p) === 'partial'), init = PROJECTS.filter(p => handoverCat(p) === 'initial');
  const card = repCard('Handover', 'التسليم والاستلام', `Weekly file as of <b>${REPORT_DATE}</b> · two categories`);
  const sec = (key, title, titleAr, list) => `<div class="hsec hs-${key}" data-cat="${key}"><div class="hhead"><b>${title}</b><small>${titleAr}</small><span class="hcount">${list.length}</span></div>` +
    (list.length ? list.slice().sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : a.ord - b.ord)).map(p => projRow(p, `Completion (PMO LIVE): <b>${fmtDate(p.end)}</b>`, `Progress ${fmtPct(p.actual)} actual vs ${fmtPct(p.planned)} planned`)).join('') : '<div class="rempty">None.</div>') + '</div>';
  card.querySelector('.rbody').innerHTML =
    `<div class="rfilters"><button class="rpill rf" data-f="both" aria-pressed="false"><b>${part.length + init.length}</b><span>Both</span></button>` +
    `<button class="rpill rf" data-f="partial" aria-pressed="false"><b>${part.length}</b><span>Partial Initial Handover</span></button>` +
    `<button class="rpill rf" data-f="initial" aria-pressed="false"><b>${init.length}</b><span>Initial Handover</span></button></div>` +
    `<div class="rrule">Partial Initial Handover = “الإستلام الإبتدائي الجزئي” is Yes · Initial Handover = project status “استلام ابتدائي”</div>` +
    sec('partial', 'Partial Initial Handover', 'الإستلام الإبتدائي الجزئي', part) + sec('initial', 'Initial Handover', 'استلام ابتدائي', init);
  const show = f => { card.querySelectorAll('.rf').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === f ? 'true' : 'false')); card.querySelectorAll('.hsec').forEach(s => { s.hidden = !(f === 'both' || s.dataset.cat === f); }); };
  card.querySelectorAll('.rf').forEach(b => b.addEventListener('click', () => show(b.dataset.f)));
  wireRows(card); finishReport(card); show(focus || 'both');
}

/* ---------- T&C: Gate 7 "Testing & Commissioning" window, nearest to today first ---------- */
function tcRows(today){
  const cutoff = addMonths(today, -SGR_STALE_MONTHS), rows = [], skipped = []; let noDates = 0, old = 0;
  PROJECTS.forEach(p => {
    const g = p.gates && p.gates[6], s = g && parseISO(g[0]), e = g && parseISO(g[1]);
    if(!s || !e || e < s){ noDates++; skipped.push({p, why:'nodates'}); return; }
    if(e < cutoff){ old++; skipped.push({p, why:'old'}); return; }                                          // older than 3 months: not considered
    const state = s <= today && today <= e ? 'now' : s > today ? 'soon' : 'overdue';
    rows.push({p, s, e, state, dist: state === 'now' ? 0 : state === 'soon' ? dayDiff(s, today) : dayDiff(today, e), cat: handoverCat(p)});
  });
  rows.sort((a, b) => a.dist - b.dist || a.e - b.e || a.p.ord - b.p.ord);
  return {rows, noDates, old, skipped};
}
function addTcTab(){
  const today = todayDate(), {rows, noDates, old, skipped} = tcRows(today), nm = GATES[6].name;
  const by = k => rows.filter(r => r.cat === k).length, st = k => rows.filter(r => r.state === k).length;
  const allP = PROJECTS.filter(p => handoverCat(p) === 'partial').length, allI = PROJECTS.filter(p => handoverCat(p) === 'initial').length;
  const skP = skipped.filter(x => handoverCat(x.p) === 'partial').length, skI = skipped.filter(x => handoverCat(x.p) === 'initial').length;
  const card = repCard('T&C — Testing & Commissioning', 'الاختبار والتشغيل التجريبي', `Gate 7 · ${esc(nm)} · nearest to today (<b>${fmtDate(isoOf(today))}</b>) first`);
  const tag = c => c === 'partial' ? '<span class="htag hp">Partial Initial Handover</span>' : c === 'initial' ? '<span class="htag hi">Initial Handover</span>' : '<span class="htag hn">Not handed over yet</span>';
  card.querySelector('.rbody').innerHTML =
    `<div class="tsum"><div class="tsum-h">Summary — ${rows.length} projects</div>` +
    `<div class="tsum-g"><div class="tbox hp"><b>${by('partial')}</b><span>Partial Initial Handover</span></div><div class="tbox hi"><b>${by('initial')}</b><span>Initial Handover</span></div><div class="tbox hn"><b>${by('none')}</b><span>Not handed over yet</span></div></div>` +
    `<div class="tsum-t">In T&C now <b>${st('now')}</b> · Starts later <b>${st('soon')}</b> · Window ended within 3 months <b>${st('overdue')}</b></div>` +
    `<div class="tsum-t">All projects in the weekly file: Partial Initial Handover <b>${allP}</b> · Initial Handover <b>${allI}</b>.` +
    `${skP + skI ? ` Not in this list (T&C window older than 3 months, or not in the gates file): Partial <b>${skP}</b> · Initial <b>${skI}</b>.` : ''}</div></div>` +
    `<div class="rlist">${rows.map(r => {
      const rel = r.state === 'now' ? `in T&C now — ends ${inDays(dayDiff(r.e, today))}` : r.state === 'soon' ? `starts ${inDays(dayDiff(r.s, today))}` : `window ended ${inDays(dayDiff(r.e, today))}`;
      return projRow(r.p, `T&C: <b>${fmtDate(isoOf(r.s))}</b> → <b>${fmtDate(isoOf(r.e))}</b>`, rel, tag(r.cat), 'tc-' + r.state);
    }).join('') || '<div class="rempty">No project has a Testing & Commissioning window around today.</div>'}</div>` +
    `<div class="rrule">${noDates} projects have no usable T&C dates (not in the gates file) · ${old} windows ended more than 3 months ago and are not listed.</div>`;
  wireRows(card); finishReport(card);
}

/* ---------- Expected Trouble: projects expected to move to Trouble, soonest first ---------- */
function troubleRows(today){
  return PROJECTS.filter(p => p.sk !== 'trouble' && p.expTroubled && p.expTroubled.d).map(p => ({p, d:parseISO(p.expTroubled.d)}))
    .map(r => ({...r, days: dayDiff(r.d, today)})).sort((a, b) => a.d - b.d || a.p.ord - b.p.ord);
}
function addTroubleTab(){
  const today = todayDate(), rows = troubleRows(today);
  const c = (lo, hi) => rows.filter(r => r.days >= lo && r.days <= hi).length;
  const card = repCard('Expected Trouble', 'المتوقع تعثرها', `Projects expected to move to Trouble, soonest first · today <b>${fmtDate(isoOf(today))}</b> · date from the weekly file (average completion rates)`);
  let html = `<div class="tsum"><div class="tsum-h">${rows.length} projects</div><div class="tsum-t">Date already passed <b>${c(-1e9, -1)}</b> · within 30 days <b>${c(0, 30)}</b> · 31–90 days <b>${c(31, 90)}</b> · later <b>${c(91, 1e9)}</b></div></div><div class="rlist">`;
  let group = null;
  rows.forEach(r => {
    const g = r.days < 0 ? 'Date already passed' : `${MONTHS_LONG[r.d.getMonth()]} ${r.d.getFullYear()}`;
    if(g !== group){ group = g; html += `<div class="rgroup">${g}</div>`; }
    const urgency = r.days < 0 ? 'passed' : r.days <= 30 ? 'u30' : r.days <= 90 ? 'u90' : 'later';
    html += projRow(r.p, `Expected to move to Trouble: <b>${fmtDate(isoOf(r.d))}</b>`, inDays(r.days), '', 'et-' + urgency);
  });
  card.querySelector('.rbody').innerHTML = html + (rows.length ? '' : '<div class="rempty">No project has an expected Trouble date.</div>') + '</div>';
  wireRows(card); finishReport(card);
}

/* ---------- password lock for the update controls ----------
   A SOFT lock: it keeps the upload / run controls away from people who only use the app. Only a salted PBKDF2 fingerprint of the password is stored here, never the password.
   (Real protection of the upload itself is GitHub's own login: only accounts with write access to the repository can add files.) */
const UPDATE_LOCK = {salt:'d59b672e572b08dd1d73d06f8d8ebf18', iter:300000, hash:'72a7390f2cdc5a2576db36b9510a37bdc2cd64f17598f6679d7f305bc52238a7'};
const UNLOCK_MIN = 15; let unlockedAt = 0, lockFails = 0, lockUntil = 0; const DATA_PANELS = [];     // every open Data updates panel, so unlocking / locking applies to all of them at once
function refreshPanels(){ for(let i = DATA_PANELS.length - 1; i >= 0; i--){ const p = DATA_PANELS[i]; if(!document.body.contains(p.card)) DATA_PANELS.splice(i, 1); else renderActions(p.card, p.base); } }
const hexBytes = h => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));
const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
function isUnlocked(){ let t = unlockedAt; try { t = Math.max(t, +sessionStorage.getItem('pmoUpdateUnlocked') || 0); } catch(e){} return !!t && Date.now() - t < UNLOCK_MIN * 60000; }
function setUnlocked(on){ unlockedAt = on ? Date.now() : 0; try { on ? sessionStorage.setItem('pmoUpdateUnlocked', String(unlockedAt)) : sessionStorage.removeItem('pmoUpdateUnlocked'); } catch(e){} }
async function passwordOk(pw){
  if(!(window.crypto && crypto.subtle)) throw new Error('secure');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:hexBytes(UPDATE_LOCK.salt), iterations:UPDATE_LOCK.iter}, key, 256);
  const a = toHex(bits), b = UPDATE_LOCK.hash; let d = a.length ^ b.length;
  for(let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);                // compare without stopping at the first difference
  return d === 0;
}

/* ---------- Data updates: what is loaded, when it is checked, where to drop new files ---------- */
function repoInfo(){
  const h = location.hostname, m = h.match(/^([^.]+)\.github\.io$/), seg = location.pathname.split('/')[1];
  if(m && seg) return {owner:m[1], repo:seg};
  const r = (BUILD.repo || 'sandbox-pmo/Main-nwc-pmo-bot').split('/'); return {owner:r[0], repo:r[1]};
}
function nextCheck(now){                                                  // hourly 08:00-19:00 Riyadh time (UTC+3), Sunday-Thursday
  let t = new Date(Math.floor(now.getTime() / 3600000) * 3600000 + 3600000);
  for(let i = 0; i < 24 * 8; i++, t = new Date(t.getTime() + 3600000)){
    const r = new Date(t.getTime() + 3 * 3600000), wd = r.getUTCDay(), hr = r.getUTCHours();
    if(wd >= 0 && wd <= 4 && hr >= 8 && hr <= 19) return t;
  }
  return null;
}
function addDataPanel(){
  const {owner, repo} = repoInfo(), base = `https://github.com/${owner}/${repo}`;
  const built = new Date(BUILD.built), nx = nextCheck(new Date());
  const fmtT = d => d.toLocaleString('en-GB', {weekday:'short', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Riyadh'}) + ' (Riyadh)';
  const n = BUILD.notes || {}, bits = [];
  (n.ignored || []).forEach(i => bits.push(`⚠ <b>${esc(i.file)}</b> in the drop folder was <b>ignored</b> — ${esc(i.why)}. The newest readable file of that kind is used instead.`));
  if((n.unmatched || []).length) bits.push(`${n.unmatched.length} projects are not in the gates file (${n.unmatched.slice(0, 6).map(esc).join(', ')}${n.unmatched.length > 6 ? ' …' : ''})`);
  if(n.datesCleaned) bits.push(`${n.datesCleaned} gate dates were typed oddly (e.g. “01-Oct-24 A”, “20225”) and were corrected automatically`);
  if(n.badDatesCount) bits.push(`${n.badDatesCount} gate dates could not be read`);
  if(n.reversed) bits.push(`${n.reversed} gate has a finish date before its start date and is ignored`);
  if(n.textNumbers) bits.push(`${n.textNumbers} number typed as text was converted`);
  const card = repCard('Data updates', 'تحديث البيانات', 'Drop the two Excel files in the GitHub folder — the app updates itself');
  card.querySelector('.rbody').innerHTML =
    `<div class="dtable"><div><span>Weekly progress file</span><b>${esc(BUILD.weeklyFile)}</b><small>report date ${REPORT_DATE}</small></div>` +
    `<div><span>Gates schedule file</span><b>${esc(BUILD.gatesFile)}</b></div>` +
    `<div><span>Projects loaded</span><b>${BUILD.projects}</b><small>${BUILD.withGates} with gate data</small></div>` +
    `<div><span>Data last updated</span><b>${fmtT(built)}</b></div>` +
    `<div><span>Automatic check</span><b>every hour, 08:00–19:00, Sunday–Thursday</b><small>${nx ? 'next check: ' + fmtT(nx) : ''}</small></div></div>` +
    `<div class="dactions"></div>` +
    (bits.length ? `<div class="dq"><b>Data-quality notes</b><ul>${bits.map(b => `<li>${b}</li>`).join('')}</ul></div>` : '');
  finishReport(card);
  DATA_PANELS.push({card, base}); renderActions(card, base);
}
function renderActions(card, base){                                         // the update controls: locked until the password is entered
  const box = card.querySelector('.dactions'); clearTimeout(card._relock);
  if(isUnlocked()){
    box.innerHTML = `<div class="dbtns"><a class="optbtn dlink" href="${base}/upload/main/drop" target="_blank" rel="noopener">⬆ Upload the new Excel files</a>` +
      `<a class="optbtn dlink" href="${base}/tree/main/drop" target="_blank" rel="noopener">📂 Open the drop folder</a>` +
      `<a class="optbtn dlink" href="${base}/actions/workflows/update.yml" target="_blank" rel="noopener">▶ Check for new files now (Run workflow)</a></div>` +
      `<div class="rrule">Drop <b>both</b> files — the weekly progress file and the gates schedule file (any file name). The newest of each kind is used. If a file cannot be read, the site keeps the previous data and the update shows an error in GitHub → Actions. GitHub asks you to sign in with an account that has write access.</div>` +
      `<div class="lockbar"><span>🔓 Unlocked — locks again after ${UNLOCK_MIN} minutes</span><button class="optbtn lockbtn" type="button">Lock now</button></div>`;
    box.querySelector('.lockbtn').addEventListener('click', () => { setUnlocked(false); refreshPanels(); });
    let t0 = unlockedAt; try { t0 = Math.max(t0, +sessionStorage.getItem('pmoUpdateUnlocked') || 0); } catch(e){}
    card._relock = setTimeout(() => { if(!isUnlocked()) refreshPanels(); }, Math.max(1000, UNLOCK_MIN * 60000 - (Date.now() - t0) + 500));
    return;
  }
  box.innerHTML = `<div class="lockbox"><div class="lockhead">🔒 Updating the data is password-protected</div><div class="rrule">Enter the password to see the upload and update controls. What is loaded now, and when it was last updated, stays visible to everyone.</div>` +
    `<label class="locklabel">Password<span class="lockrow"><input class="lockinput" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"><button class="optbtn lockgo" type="button">Unlock</button></span></label><div class="lockerr" role="alert" aria-live="polite"></div></div>`;
  const inp = box.querySelector('.lockinput'), go = box.querySelector('.lockgo'), err = box.querySelector('.lockerr'); let busy = false;
  const wait = () => { const s = Math.ceil((lockUntil - Date.now()) / 1000); if(s > 0){ err.textContent = `Too many attempts — try again in ${s} s.`; go.disabled = true; setTimeout(wait, 500); } else { go.disabled = false; if(err.textContent.startsWith('Too many')) err.textContent = ''; } };
  const attempt = async () => {
    if(busy || Date.now() < lockUntil) return; const pw = inp.value; if(!pw){ err.textContent = 'Please type the password.'; inp.focus(); return; }
    busy = true; go.disabled = true; err.textContent = 'Checking…';
    try {
      const ok = await passwordOk(pw);
      if(ok){ lockFails = 0; inp.value = ''; setUnlocked(true); refreshPanels(); return; }
      lockFails++; inp.value = ''; err.textContent = 'Wrong password.';
      if(lockFails >= 3){ lockUntil = Date.now() + Math.min(60, Math.pow(2, lockFails - 3)) * 1000; wait(); }
    } catch(e){ err.textContent = 'The password cannot be checked on this page — open the app from its https address.'; }
    busy = false; if(Date.now() >= lockUntil) go.disabled = false; inp.focus();
  };
  go.addEventListener('click', attempt); inp.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); attempt(); } });
  if(Date.now() < lockUntil) wait();
}

/* ---------- typed instructions that open these screens ---------- */
function routeReport(q){
  const t = q.split(' ').filter(Boolean), has = w => t.includes(w), any = (...ws) => ws.some(has);
  const only = set => t.every(w => set.has(w) || STOP.has(w));
  if(any('sgr') || (any('gate', 'gates') && any('review', 'stage', 'reviews', 'sgr')) || (has('gates') && t.length <= 2) || only(new Set(['stage','gate','review'])) && any('gate', 'review')){
    const f = any('overdue') ? 'red' : any('red') ? 'red' : any('yellow', 'amber') ? 'yellow' : any('soon', 'upcoming', 'next', 'coming') ? 'redyellow' : any('green') ? 'green' : 'all';
    return {type:'report', view:'sgr', arg:f};
  }
  if(q === 't c' || any('tc', 'tnc', 'commissioning') || (has('testing') && t.length <= 3)) return {type:'report', view:'tc'};
  if(any('expected', 'upcoming', 'soon', 'predicted', 'coming', 'going', 'next') && any('trouble', 'troubled', 'troubles') && t.length <= 5) return {type:'report', view:'trouble'};
  if(q.indexOf('المتوقع') >= 0 && q.indexOf('تعثر') >= 0) return {type:'report', view:'trouble'};
  const HW = new Set(['handover','handovers','initial','partial','partially','handed','over','hand','status','and']);
  if((any('handover', 'handovers') || (any('handed', 'hand') && has('over'))) && only(HW)) return {type:'report', view:'handover', arg: any('partial', 'partially') ? 'partial' : any('initial') ? 'initial' : 'both'};
  const DW = new Set(['data','update','updates','upload','files','file','drop','dropbox','box','revision','latest','new','excel','sync','refresh','automatic','hourly','last','next','when','folder','submit']);
  if(any('upload', 'dropbox', 'revision', 'refresh', 'sync', 'folder', 'submit') && only(DW) || (has('data') && only(DW)) || (has('drop') && has('box'))) return {type:'report', view:'data'};
  // the same screens, asked in Arabic
  const AH = new Set(['استلام','الاستلام','تسليم','التسليم','ابتدايي','الابتدايي','جزيي','الجزيي','المشاريع','مشاريع']);
  if(any('استلام','الاستلام','تسليم','التسليم') && only(AH)) return {type:'report', view:'handover', arg: any('جزيي','الجزيي') ? 'partial' : any('ابتدايي','الابتدايي') ? 'initial' : 'both'};
  if(any('بوابات','بوابه','البوابات') && any('مراجعه','المراجعه','المراحل','مراحل','المرحله')) return {type:'report', view:'sgr', arg:'all'};
  const anyA = (...ws) => ws.some(w => t.includes(w) || t.includes('و' + w));          // Arabic "and ..." prefix
  if(anyA('الاختبار','اختبار') && anyA('التشغيل','تشغيل')) return {type:'report', view:'tc'};
  if(any('بيانات','البيانات','الملفات','ملفات','الملف') && any('تحديث','التحديث','رفع')) return {type:'report', view:'data'};
  return null;
}
const REPORT_LABEL = {sgr:'SGR — Stage Gate Review', tc:'T&C — Testing & Commissioning', trouble:'Expected Trouble', handover:'Handover', data:'Data updates'};
function openReport(r){
  const lead = {sgr:'the Stage Gate Review (SGR) view', tc:'the T&C (Testing & Commissioning) list', trouble:'the projects expected to move to Trouble', handover:'the Handover view', data:'the data updates panel'}[r.view];
  addText(corr(r) + `Here is ${lead}:`, 'in');
  ({sgr:addSgrTab, tc:addTcTab, trouble:addTroubleTab, handover:addHandoverTab, data:addDataPanel})[r.view](r.arg);
  speakResponse({sgr:'Stage gate review. Red projects need an SGR within a week, yellow within three weeks.', tc:'Testing and commissioning, nearest to today first.', trouble:'Projects expected to move to trouble, soonest first.', handover:'Partial initial handover and initial handover projects.', data:'Data updates.'}[r.view]);
}
