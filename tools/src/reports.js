
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
function gateInfoStatus(p, today){                                          // stage-gate TRACKER layout: a status per gate + a planned date for some gates
  const cutoff = addMonths(today, -SGR_STALE_MONTHS);
  const gs = p.gates.map((g, i) => ({n:i+1, name:GATES[i].name, ar:GATES[i].ar, s:null, e:parseISO(g[1]), c:p.gst[i], ok:true}));
  const prog = gs.filter(g => g.c === 'p'); let cur = null;
  if(prog.length) cur = prog[prog.length - 1];                                // the gate marked "in progress" (the later one if two are)
  else { const pend = gs.filter(g => g.c === '-'); if(pend.length) cur = pend[0]; }   // else the first gate not started
  let state, days = null;
  if(!cur) state = 'complete';
  else if(!cur.e) state = 'nodate';
  else { days = dayDiff(cur.e, today); state = days >= 0 ? 'ongoing' : cur.e >= cutoff ? 'overdue' : 'stale'; }     // a planned date older than 3 months is not considered
  gs.forEach(g => { g.st = g.c === 'c' ? 'done' : g.c === 'n' ? 'ignored' : cur && g.n === cur.n ? (state === 'stale' ? 'ignored' : 'current') : 'upcoming'; });
  const shown = state === 'ongoing' || state === 'overdue' || state === 'nodate' ? cur : null;
  return {state, cur: shown, stale: state === 'stale' ? cur : null, gs, days: state === 'ongoing' || state === 'overdue' ? days : null, cutoff, today, model:'status', next:null};
}
function gateInfo(p, today){
  if(!p.gates) return {state:'nodata', gs:null};
  if(p.gst) return gateInfoStatus(p, today);
  const cutoff = addMonths(today, -SGR_STALE_MONTHS);
  const gs = p.gates.map((g, i) => { const s = parseISO(g[0]), e = parseISO(g[1]); return {n:i+1, name:GATES[i].name, ar:GATES[i].ar, s, e, ok: !!(s && e && e >= s)}; });
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
  return {state, cur, next, gs, days: cur ? dayDiff(cur.e, today) : null, cutoff, today, model:'windows'};
}
function sgrFlag(info){
  if(info.state === 'nodata') return {k:'grey', sub:'nodata', label:'No gate data', detail:'This project is not in the gates schedule file (or has no usable gate dates).', key:1e9};
  if(info.state === 'complete') return {k:'grey', sub:'complete', label:'All gates completed', detail:'Every applicable gate of this project is marked completed.', key:1e9};
  if(info.state === 'nodate')   { const c = info.cur; return {k:'grey', sub:'nodate', label:'No SGR date', detail:`Gate ${c.n} · ${c.name} is in progress — the gates file has no planned date for it`, key:1e9}; }
  if(info.state === 'stale')  return {k:'grey', sub:'stale', label:'No active gate', detail: info.model === 'status' ? 'The planned date of the current gate is more than 3 months old.' : 'All planned gate dates are more than 3 months old.', key:1e9};
  if(info.state === 'notstarted') return {k:'grey', sub:'notstarted', label:'No active gate', detail:`Not started yet — Gate ${info.next.n} · ${info.next.name} starts ${fmtDate(isoOf(info.next.s))} (${inDays(dayDiff(info.next.s, info.today))})`, key:1e9};
  const c = info.cur, end = fmtDate(isoOf(c.e)), name = `Gate ${c.n} · ${c.name}`, d = info.days;
  if(info.state === 'overdue') return {k:'red', blink:true, label:'SGR overdue', detail:`${name} · ended ${end} (${inDays(d)})`, key:d};
  const k = d <= SGR_RED_DAYS ? 'red' : d <= SGR_YELLOW_DAYS ? 'yellow' : 'green';
  const label = k === 'red' ? 'SGR due within 1 week' : k === 'yellow' ? 'SGR due within 3 weeks' : 'No SGR needed soon';
  return {k, blink: k === 'red', label, detail:`${name} · ends ${end} (${inDays(d)})`, key:d};
}
const flagDot = f => `<span class="fldot fl-${f.k}${f.blink ? ' blink' : ''}" aria-hidden="true"></span>`;
const gnameHtml = g => esc(g.name) + (g.ar ? ` <small class="gar">${esc(g.ar)}</small>` : '');
function gateRowsStatus(info, today){                                       // tracker layout: the status of each gate, its planned date (when there is one) against today
  return info.gs.map(g => {
    const lab = g.c === 'c' ? 'Completed' : g.c === 'n' ? 'Not applicable' : g.c === 'p' ? 'In progress' : 'Not started';
    let rel = '';
    if(g.e && g.c !== 'n'){ const d = dayDiff(g.e, today); rel = `planned ${fmtDate(isoOf(g.e))} (${g.c === 'c' ? 'completed' : inDays(d)})` + (g.st === 'ignored' && g.c !== 'c' ? ' — more than 3 months old, not considered' : ''); }
    else if(g.c === 'p') rel = 'no planned date in the file';
    return `<div class="grow g-${g.st}"><span class="gn">${g.n}</span><div><div class="gname">${gnameHtml(g)}${g.st === 'current' ? ' <b class="gcur">◀ current</b>' : ''}</div><div class="gdates"><b>${lab}</b>${rel ? `<br><span class="grel">${rel}</span>` : ''}</div></div></div>`;
  }).join('');
}
function gateRows(info, today){                                            // the eight gates against today's date
  if(info.model === 'status') return gateRowsStatus(info, today);
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
    return `<div class="grow g-${g.st}"><span class="gn">${g.n}</span><div><div class="gname">${gnameHtml(g)}${g.st === 'current' ? ' <b class="gcur">◀ current</b>' : ''}</div><div class="gdates">${txt}</div></div></div>`;
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
    if(p.gst && p.gates){                                                 // tracker layout: gate 7 status + planned date
      const c7 = p.gst[6], e7 = parseISO(p.gates[6][1]);
      if(c7 === 'c' || c7 === 'n') return;                                // finished / not applicable: not in the pipeline
      if(!e7){ noDates++; skipped.push({p, why:'nodates'}); return; }
      const st7 = c7 === 'p' ? 'now' : e7 >= today ? 'soon' : 'overdue';
      if(st7 === 'overdue' && e7 < cutoff){ old++; skipped.push({p, why:'old'}); return; }
      rows.push({p, s:null, e:e7, state:st7, dist: st7 === 'now' ? 0 : st7 === 'soon' ? dayDiff(e7, today) : dayDiff(today, e7), cat: handoverCat(p)}); return;
    }
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
      const dd = dayDiff(r.e, today);
      const rel = r.s ? (r.state === 'now' ? `in T&C now — ends ${inDays(dd)}` : r.state === 'soon' ? `starts ${inDays(dayDiff(r.s, today))}` : `window ended ${inDays(dd)}`)
                      : (r.state === 'now' ? `in T&C now — ${dd >= 0 ? 'planned to finish ' + inDays(dd) : 'planned date passed ' + inDays(dd)}` : r.state === 'soon' ? `planned ${inDays(dd)}` : `planned date passed ${inDays(dd)}`);
      return projRow(r.p, r.s ? `T&C: <b>${fmtDate(isoOf(r.s))}</b> → <b>${fmtDate(isoOf(r.e))}</b>` : `T&C planned date: <b>${fmtDate(isoOf(r.e))}</b>`, rel, tag(r.cat), 'tc-' + r.state);
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
  if(n.unknownGateStatus) bits.push(`${n.unknownGateStatus} gate status cell contained text that is not a status (treated as not started)`);
  if(n.reversed) bits.push(`${n.reversed} gate has a finish date before its start date and is ignored`);
  if(n.textNumbers) bits.push(`${n.textNumbers} number typed as text was converted`);
  const card = repCard('Data updates', 'تحديث البيانات', 'Drop the two Excel files in the GitHub folder — the app updates itself');
  card.querySelector('.rbody').innerHTML =
    `<div class="dtable"><div><span>Weekly progress file</span><b>${esc(BUILD.weeklyFile)}</b><small>report date ${REPORT_DATE}</small></div>` +
    `<div><span>Gates file (newest readable)</span><b>${esc(BUILD.gatesFile)}</b><small>${BUILD.gatesModel === 'status' ? 'stage-gate tracker: status of each gate + planned dates' : 'schedule: start and finish dates of each gate'}</small></div>` +
    ((BUILD.gatesSources || []).length > 1 ? `<div><span>Gate data comes from</span>${BUILD.gatesSources.map(s => `<b>${s.projects} projects — ${esc(s.file)}</b>`).join('')}<small>the newest file leads; older files only fill the projects it does not cover</small></div>` : '') +
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
  const mt = routeMeet(q); if(mt) return mt;
  const mo = routeMOM(q); if(mo) return mo;
  const wh = routeWH(q); if(wh) return wh;
  const asst = routeAssist(q); if(asst) return asst;
  const t = q.split(' ').filter(Boolean), has = w => t.includes(w), any = (...ws) => ws.some(has);
  const only = set => t.every(w => set.has(w) || STOP.has(w));
  if(any('sgr') || (any('gate', 'gates') && any('review', 'stage', 'reviews', 'sgr')) || (has('gates') && t.length <= 2) || only(new Set(['stage','gate','review'])) && any('gate', 'review')){
    const f = any('overdue') ? 'red' : any('red') ? 'red' : any('yellow', 'amber') ? 'yellow' : any('soon', 'upcoming', 'next', 'coming') ? 'redyellow' : any('green') ? 'green' : 'all';
    return {type:'report', view:'sgr', arg:f};
  }
  if((any('operating', 'benefited', 'unused', 'underused') && only(new Set(['operating','status','projects','project','benefited','not','fully','unused','underused','dashboard','report','adhoc','ad','hoc']))) || q === 'operating status') return {type:'report', view:'adhoc'};
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
const REPORT_LABEL = {meet:'Weekly Meeting Data', mom:'MOM · PMO Executive Meeting', wh:'White Helmet', sgrdays:'SGR within days', adhoc:'Operating Status', sgr:'SGR — Stage Gate Review', tc:'T&C — Testing & Commissioning', trouble:'Expected Trouble', handover:'Handover', data:'Data updates'};
function openReport(r){
  const lead = {meet:'the weekly meeting data', mom:'the MOM of the PMO Executive Meeting', wh:'the White Helmet dashboard', sgrdays:'the projects reaching SGR within the period', adhoc:'the Operating Status dashboard (projects not fully benefited from)', sgr:'the Stage Gate Review (SGR) view', tc:'the T&C (Testing & Commissioning) list', trouble:'the projects expected to move to Trouble', handover:'the Handover view', data:'the data updates panel'}[r.view];
  addText(corr(r) + `Here is ${lead}:`, 'in');
  ({meet:addMeetingTab, mom:addMOMTab, wh:(a) => (a ? addWHSearch(a) : addWHTab()), sgrdays:addSgrDays, adhoc:addOpsTab, sgr:addSgrTab, tc:addTcTab, trouble:addTroubleTab, handover:addHandoverTab, data:addDataPanel})[r.view](r.arg);
  speakResponse({meet:'Weekly meeting data.', mom:'Minutes of the PMO executive meeting, Northwestern Cluster.', wh:'White Helmet reports and observations.', sgrdays:'Projects reaching stage gate review soon.', adhoc:'Operating status of projects not fully benefited from.', sgr:'Stage gate review. Red projects need an SGR within a week, yellow within three weeks.', tc:'Testing and commissioning, nearest to today first.', trouble:'Projects expected to move to trouble, soonest first.', handover:'Partial initial handover and initial handover projects.', data:'Data updates.'}[r.view]);
}


/* =====================================================================
   Assistant: understands typos, consultant names (FCC / Future / فيوتشر, Dorsch / دورش), "SGR in N days",
   asks "Do you mean" only when unsure, and offers choices when it cannot help.
   ===================================================================== */
const CONSULTANTS = [
  {key: 'FCC', en: 'FCC', words: ['fcc', 'future', 'futur', 'فيوتشر', 'فيوتشير', 'فيوتر', 'فيوتشرز']},
  {key: 'Dorsch', en: 'Dorsch', words: ['dorsch', 'dorch', 'dorsh', 'دورش', 'دورتش', 'دورس']},
];
const CONS_FILLER = new Set(['projects','project','consultant','consultants','the','of','by','for','show','list','all','me','give','what','which','are','is','in','with','and','or','pls','please','مشاريع','مشروع','استشاري','الاستشاري','الاستشارى','استشارى','من','عند','لدى','كل','جميع','عرض','اعرض','ما','هي','في','مع','و','او','أو']);
const ASST_WEEK = ['week','weeks','wk','wks','أسبوع','اسبوع','أسابيع','اسابيع','اسبوعين'];
const ASST_DAY = ['day','days','يوم','أيام','ايام','يوما'];
const ASST_SGR = ['sgr','sgrs','gate','gates','stage','review','بوابه','بوابة','بوابات','مراجعه','مراجعة','مراحل'];
function isArabic(s){ return /[\u0600-\u06FF]/.test(String(s || '')); }
function nearWord(t, words){                                  // closest word for a typed token, with a tolerance that grows with length
  let best = {d: 99, w: null};
  for(const w of words){ const tol = t.length <= 2 ? 0 : t.length <= 4 ? 1 : 2; const d = w === t ? 0 : (t.length >= 3 && w.startsWith(t)) ? 0 : levenshtein(t, w); if(d <= tol && d < best.d) best = {d, w}; }
  return best;
}
function consultantOf(p){ const c = String(p.consultant || '').toLowerCase(); if(c.includes('فيوتشر') || c.includes('fcc')) return 'FCC'; if(c.includes('دورش') || c.includes('dorsch')) return 'Dorsch'; return ''; }
function consultantList(key){ return PROJECTS.filter(p => consultantOf(p) === key).sort((a, b) => a.ord - b.ord); }
function routeAssist(q){
  const toks = nrm(q).split(/[\s,?؟!.]+/).filter(Boolean); if(!toks.length) return null;
  const ar = isArabic(q);
  /* SGR within N days: "what will be the projects to reach SGR in the next 15 days?" */
  const ni = toks.findIndex(t => /^\d{1,3}$/.test(t) && +t > 0 && +t <= 52);
  if(ni >= 0 && toks.some(t => nearWord(t, ASST_SGR).w)){
    const n = +toks[ni], unit = [toks[ni + 1], toks[ni - 1]].find(t => t && (ASST_WEEK.includes(t) || ASST_DAY.includes(t)));
    if(unit && ASST_WEEK.includes(unit)) return {type:'report', view:'sgrdays', arg:{days: n * 7, label: n + (n === 1 ? ' week' : ' weeks')}};
    if(unit && ASST_DAY.includes(unit)) return {type:'report', view:'sgrdays', arg:{days: n, label: n + (n === 1 ? ' day' : ' days')}};
    /* no unit given: do not guess between days and weeks */
    return {type:'confirm', raw:q, assist:true, options:[
      {label: n + ' days', query: 'sgr within ' + n + ' days', r: {type:'none'}},
      {label: n + ' weeks (' + n * 7 + ' days)', query: 'sgr within ' + n + ' weeks', r: {type:'none'}}]};
  }
  /* consultant filter: only consultant words (typos allowed) and filler words */
  const rest = toks.filter(t => !CONS_FILLER.has(t)); if(!rest.length) return null;
  const hits = rest.map(t => { const best = CONSULTANTS.map(c => ({c, ...nearWord(t, c.words)})).filter(x => x.w).sort((a, b) => a.d - b.d); return best.length ? best : null; });
  if(hits.some(h => !h)) return null;
  const keys = [...new Set(hits.map(h => h[0].c.key))];
  const ambiguous = hits.some(h => h.length > 1 && h[0].d === h[1].d && h[0].c.key !== h[1].c.key);
  if(ambiguous || keys.length > 1){
    const opts = CONSULTANTS.map(c => ({label: (ar ? c.words.find(w => /[\u0600-\u06FF]/.test(w)) + ' — ' : '') + c.en + ' consultant', query: 'consultant ' + c.en, r: {type:'none'}}));
    return {type:'confirm', raw:q, options:opts, assist:true};
  }
  const key = keys[0], list = consultantList(key);
  if(!list.length) return null;
  return {type:'list', list, label: `${key} consultant`, assist:true};
}
function assistOffer(qRaw){                                   // the bot cannot place the request: search all the app's text first, then offer choices
  const hits = typeof meetSearch === 'function' ? meetSearch(qRaw) : [];
  if (hits.length) { const card = repCard('Search results', 'نتائج البحث', 'All the app data'); card.querySelector('.rbody').innerHTML = meetResultsHtml(qRaw); wireMeet(card, qRaw); finishReport(card); return; }
  const ar = isArabic(qRaw);
  const bubble = document.createElement('div'); bubble.className = 'msg in';
  const head = ar ? `أستطيع مساعدتك في هذه المعلومات… اختر أحد الخيارات أو اكتب سؤالاً جديداً.` : `I can help you with getting this information… Please choose between these options or write a new question.`;
  const opts = [['📊 Portfolio', 'portfolio'], ['🚦 SGR in 15 days', 'sgr in 15 days'], ['🏗 FCC projects', 'consultant FCC'], ['🏗 Dorsch projects', 'consultant Dorsch'], ['❓ Help', 'help']];
  bubble.innerHTML = fmtMsg(head) + '<div class="optlist">' + opts.map(([l, q]) => `<button class="optbtn askbtn" data-q="${esc(q)}"><span class="on">${esc(l)}</span></button>`).join('') + '</div>' + `<span class="time">${timeNow()}</span>`;
  botRow(bubble);
  bubble.querySelectorAll('.askbtn').forEach(b => b.addEventListener('click', () => handleQuery(b.dataset.q, b.textContent.trim())));
}
function addSgrDays(arg){
  const days = typeof arg === 'number' ? arg : arg.days, span = typeof arg === 'number' ? days + ' days' : arg.label + ' (' + days + ' days)';
  const today = todayDate(), cutoff = addMonths(today, -SGR_STALE_MONTHS);
  const rows = PROJECTS.map(p => { const info = gateInfo(p, today); return {p, info, f: sgrFlag(info)}; })
    .filter(x => x.info.state === 'ongoing' && x.info.days <= days && x.info.days >= 0)
    .sort((a, b) => a.info.days - b.info.days || a.p.ord - b.p.ord);
  const card = repCard('SGR within ' + span, 'مراجعة بوابات المراحل خلال ' + span, `Projects whose current gate ends within ${span} (today ${fmtDate(isoOf(today))}) · overdue gates are not shown`);
  const ar = `<div class="sgrin-h">${rows.length} project${rows.length === 1 ? '' : 's'} within ${span} · ${rows.length} مشروع خلال ${span}</div>`;
  const list = rows.length ? rows.map(x => `<details class="srow sg-${x.f.k}"><summary><span class="srow-h">${flagDot(x.f)}<span class="rr-name">${esc(x.p.name)}</span></span><span class="rr-meta"><b>PO ${x.p.po}</b><span>${x.p.areaEn}</span></span><span class="rr-line"><b>${x.f.label}</b> — ${x.f.detail}</span></summary>` +
    `<div class="sbody">${x.info.gs ? `<div class="gates">${gateRows(x.info, today)}</div>` : ''}<button class="optbtn openbtn" data-po="${x.p.po}">Open the control card</button></div></details>`).join('')
    : '<div class="rempty">No project reaches SGR within this period.</div>';
  card.querySelector('.rbody').innerHTML = ar + '<div class="rlist">' + list + '</div>';
  card.querySelectorAll('.openbtn').forEach(b => b.addEventListener('click', e => { e.preventDefault(); handleQuery(b.dataset.po); }));
  finishReport(card);
}
/* idle: after one minute without any action the bot says hello once */
let assistLastAct = Date.now(), assistGreeted = false;
['keydown', 'click', 'touchstart', 'input'].forEach(ev => document.addEventListener(ev, () => { assistLastAct = Date.now(); assistGreeted = false; }, true));
setInterval(() => { if(!assistGreeted && Date.now() - assistLastAct > 120000){ assistGreeted = true; addText('Hi, this is your PMO Buddy. How can I help you?\n\n\u2067مرحبا، أنا PMO رفيقك ، كيف أقدر أساعدك  ؟\u2069', 'in'); } }, 5000);

/* =====================================================================
   White Helmet tab: floor-plan reports, 360 observations, issuers, contractors, consultants, regions.
   Data: const WH (built from the White Helmet database, dropped in the same folder as the weekly file).
   ===================================================================== */
const WH_WORDS = ['wh', 'white', 'helmet'];
const WH_NO = () => (typeof WH === 'undefined' ? null : WH);
function whKey(s){ return String(s || '').replace(/\s+/g, '').toUpperCase(); }
function whLinks(p){                                                       // weekly project(s) this White Helmet project points to: PO first, then project number
  const byPo = p.po ? PROJECTS.find(x => whKey(x.po) === whKey(p.po)) : null;
  const byNo = p.pno ? PROJECTS.find(x => whKey(x.pno) === whKey(p.pno)) : null;
  if (byPo && byNo && byPo.po !== byNo.po) return {ambiguous: true, a: byPo, b: byNo};
  return {project: byPo || byNo || null};
}
function whBar(l, s, n, mx, color){
  const w = n && mx ? Math.max(4, Math.round(n / mx * 100)) : 0;
  return `<div class="brow"><div class="btop"><span class="bl"><b>${esc(l)}</b>${s ? `<small>${esc(s)}</small>` : ''}</span><span class="bn"><b>${n.toLocaleString('en-US')}</b></span></div><div class="btrack"><i style="width:${w}%;background:${color}"></i></div></div>`;
}
function whOpenBtn(p){
  const L = whLinks(p);
  if (L.ambiguous) return `<div class="whchoose"><div class="whq" dir="rtl">هذان الرقمان يشيران إلى مشروعين مختلفين — اختر أحدهما</div><small>These numbers point to 2 different projects. Please choose one:</small>` +
    `<button class="optbtn whpick" data-po="${esc(L.a.po)}">PO ${esc(L.a.po)} · ${esc(L.a.name.slice(0, 40))}</button><button class="optbtn whpick" data-po="${esc(L.b.po)}">Project ${esc(L.b.pno)} · ${esc(L.b.name.slice(0, 40))}</button></div>`;
  return L.project ? `<button class="optbtn openbtn" data-po="${esc(L.project.po)}">Open the control card</button>` : `<small class="none">Not in the weekly report — no control card</small>`;
}
function whPanel(key){
  const W = WH_NO(), k = W.kpi;
  if (key === 'obsProj') {
    const top = W.projects.filter(p => p.obs > 0).sort((a, b) => b.obs - a.obs).slice(0, 5), mx = top[0] ? top[0].obs : 1;
    return `<div class="rgroup">Top 5 Projects with Observations · أعلى 5 مشاريع بالملاحظات</div>` + top.map(p => whBar(p.name.slice(0, 60), `PO ${p.po} · ${p.pno}`, p.obs, mx, '#3B8FEA')).join('');
  }
  if (key === 'obsIss') {
    const top = W.issuers.filter(x => x.obs > 0).sort((a, b) => b.obs - a.obs).slice(0, 5), mx = top[0] ? top[0].obs : 1;
    return `<div class="rgroup">Top 5 Observations Issuers · أعلى 5 مصدري الملاحظات</div>` + top.map(x => whBar(x.name, `${x.projects.length} projects`, x.obs, mx, '#3B8FEA')).join('');
  }
  if (key === 'repIss') {
    const top = W.issuers.filter(x => x.rep > 0).sort((a, b) => b.rep - a.rep).slice(0, 5), mx = top[0] ? top[0].rep : 1;
    return `<div class="rgroup">Top 5 Reports Issuers · أعلى 5 ناشري التقارير</div>` + top.map(x => whBar(x.name, `${x.projects.length} projects`, x.rep, mx, '#8B6FD6')).join('');
  }
  if (key === 'contr') {
    const top = W.contractors.slice(0, 5), mx = top[0] ? top[0].reports : 1;
    return `<div class="rgroup">Top 5 Contractors · أعلى 5 مقاولين</div>` + top.map(c => whBar(c.name.slice(0, 48), `${c.projects} projects`, c.reports, mx, '#2E8B57')).join('');
  }
  if (key === 'cons') {
    const mx = W.consultants[0] ? W.consultants[0].reports : 1;
    return `<div class="rgroup">Sort by Consultant · حسب الاستشاري</div>` + W.consultants.map(c => whBar(c.name, `${c.projects} projects`, c.reports, mx, '#7A5517')).join('');
  }
  if (key === 'region') {
    const mx = W.regions[0] ? W.regions[0].reports : 1;
    return `<div class="rgroup">Sort by Region · حسب المنطقة</div>` + W.regions.map(r => whBar(r.name === 'Madinah' ? 'Madinah · المدينة المنورة' : r.name === 'Tabuk' ? 'Tabuk · تبوك' : r.name, `${r.projects} projects · ${r.obs} observations`, r.reports, mx, '#0E6286')).join('');
  }
  return '';
}
function whSearch(q){                                                      // project name, PO, project number, consultant, contractor, employee names
  const W = WH_NO(); if (!W) return {projects: [], issuers: []};
  const qt = adTokens(q).filter(t => !WH_WORDS.includes(t) && !['helmet','الخوذه','هيلمت'].includes(t)); if (!qt.length) return {projects: [], issuers: []};
  const issuerHits = W.issuers.filter(x => qt.every(t => adTokOK(t, adTokens(x.name))));
  const issuerProjects = new Set(issuerHits.flatMap(x => x.projects));
  const projects = W.projects.map(p => {
    const toks = adTokens([p.name, p.po, p.pno, p.contractor, p.consultant, p.region, ...p.emps].join(' '));
    const hit = qt.every(t => adTokOK(t, toks) || (issuerProjects.has(p.idx) && issuerHits.some(x => adTokOK(t, adTokens(x.name)))));
    return hit ? p : null;
  }).filter(Boolean);
  return {projects: projects.slice(0, 15), total: projects.length, issuers: issuerHits.slice(0, 5)};
}
function whResultsHtml(q){
  const r = whSearch(q), W = WH_NO();
  const head = `<div class="adsres-h"><b dir="rtl">نتائج تقارير وايت هيلمت</b><small>White Helmet search · ${r.total || 0} project(s) for “${esc(q)}”</small></div>`;
  const emp = r.issuers.length ? `<div class="rrule">Employees: ${r.issuers.map(x => `<b>${esc(x.name)}</b> (${x.obs} obs · ${x.rep} reports)`).join(' · ')}</div>` : '';
  const rows = r.projects.length ? r.projects.map(p => `<div class="wh-row"><div class="rr-name" dir="rtl">${esc(p.name)}</div>` +
      `<div class="rr-meta"><b>PO ${esc(p.po)}</b><span>Project ${esc(p.pno)}</span><span>${esc(p.region)}</span><span>${esc(p.consultant)}</span></div>` +
      `<div class="rr-line"><b>${p.reports}</b> reports · <b>${p.obs}</b> observations · ${esc(p.contractor)}</div>${whOpenBtn(p)}</div>`).join('')
    : '<div class="rempty">No White Helmet project matches. Try a project name, the PO or project number, a consultant (FCC, Dorsch), a contractor or an employee name.</div>';
  return head + emp + `<div class="rlist">${rows}</div>` + (r.total > r.projects.length ? `<div class="rrule">Showing ${r.projects.length} of ${r.total}. Narrow the words to see the rest.</div>` : '');
}
function paintWH(card, panel, q){
  const W = WH_NO();
  const rb = card.querySelector('.rbody');
  if (!W) { rb.innerHTML = '<div class="rempty">White Helmet database not loaded yet. Drop the White Helmet file in the drop folder.</div>'; return; }
  const k = W.kpi, kpi = (v, ar, en) => `<div class="kpi"><span class="kv">${v.toLocaleString('en-US')}</span><span class="kl"><b dir="rtl">${ar}</b><small>${en}</small></span></div>`;
  const btn = (key, label, wide) => `<button type="button" class="rpill whbtn${panel === key ? ' on' : ''}${wide ? ' wide' : ''}" data-panel="${key}" aria-pressed="${panel === key}">${esc(label)}</button>`;
  rb.innerHTML =
    `<div class="rrule">Floor-plan reports and 360 observations${W.asOf ? ' · database of ' + esc(W.asOf) : ''}</div>` +
    `<div class="adkpis">${kpi(k.obs, 'الملاحظات', 'Total observations')}${kpi(k.reports, 'التقارير', 'Total reports')}${kpi(k.issuers, 'المصدرون', 'Issuers involved')}` +
      `${kpi(k.projects, 'المشاريع', 'Projects involved')}${kpi(k.contractors, 'المقاولون', 'Contractors involved')}${kpi(k.floors, 'مخططات الطوابق', 'Floor plans uploaded')}</div>` +
    `<div class="whbtns">${btn('obsProj', 'Top 5 Projects with Observations')}${btn('obsIss', 'Top 5 Observations Issuers')}${btn('repIss', 'Top 5 Reports Issuers')}${btn('contr', 'Top 5 Contractors')}${btn('cons', 'Sort by Consultant')}${btn('region', 'Sort by Region · Tabuk · Madinah', true)}</div>` +
    `<div class="whsbox"><input type="search" class="adsearch whsearch" placeholder="WH: project, PO, consultant, contractor, employee" aria-label="Search White Helmet reports"></div>` +
    `<div class="whpanel">${whPanel(panel || 'obsProj')}</div><div class="whres" hidden></div>`;
  rb.querySelectorAll('.whbtn').forEach(b => b.addEventListener('click', () => paintWH(card, b.dataset.panel)));
  const inp = rb.querySelector('.whsearch'), pan = rb.querySelector('.whpanel'), res = rb.querySelector('.whres');
  inp.addEventListener('input', () => { const v = inp.value.trim(); if (!v) { res.hidden = true; pan.hidden = false; return; } pan.hidden = true; res.hidden = false; res.innerHTML = whResultsHtml(v); wireWHRes(res); });
  if (q) { inp.value = q; inp.dispatchEvent(new Event('input')); }
  wireWHRes(card);
}
function wireWHRes(root){
  root.querySelectorAll('.openbtn').forEach(b => b.addEventListener('click', e => { e.preventDefault(); handleQuery(b.dataset.po); }));
  root.querySelectorAll('.whpick').forEach(b => b.addEventListener('click', e => { e.preventDefault(); handleQuery(b.dataset.po); }));
}
function addWHTab(startPanel){
  const card = repCard('White Helmet', 'وايت هيلمت', 'Floor-plan reports · 360 observations · issuers, contractors, consultants, regions');
  paintWH(card, startPanel || 'obsProj'); finishReport(card);
}
function addWHSearch(q){
  const card = repCard('White Helmet', 'وايت هيلمت', `<span dir="rtl">نتائج البحث</span> · search: ${esc(q)}`);
  paintWH(card, 'obsProj', q); finishReport(card);
}
function routeWH(q){                                                       // WH / White Helmet / Helmet in the sentence
  const t = nrm(q).split(/[\s,?؟!.]+/).filter(Boolean); if (!t.length) return null;
  const hasWord = t.some(w => WH_WORDS.includes(w) || (w.length >= 5 && levenshtein(w, 'helmet') <= 1) || w === 'هيلمت' || w === 'الهيلمت');
  if (!hasWord) return null;
  const rest = t.filter(w => !WH_WORDS.includes(w) && !(w.length >= 5 && levenshtein(w, 'helmet') <= 1) && !['white','helmet','هيلمت','الهيلمت','وايت','الوايت'].includes(w));
  if (!rest.length || /^(reports?|report|tab|dashboard|stats?|statistics|observations?|تقارير|لوحة)$/.test(rest.join(' '))) return {type:'report', view:'wh', arg:null};
  return {type:'report', view:'wh', arg:q};
}

/* =====================================================================
   MOM: PMO Executive Meeting minutes, Northwestern Cluster highlights (yellow), updates newest first.
   Data: const MOM (built from the minutes .docx in the drop folder).
   ===================================================================== */
const MOM_WORDS = ['mom', 'minutes', 'minute', 'محضر', 'المحضر'];
function routeMOM(q){
  const t = nrm(q).split(/[\s,?؟!.]+/).filter(Boolean);
  if (!t.some(w => MOM_WORDS.includes(w))) return null;
  return {type:'report', view:'mom'};
}
function momUpdates(ups){
  if (!ups.length) return '<div class="momnone">No dated update in the highlighted text of the minutes</div>';
  const li = u => `<li><span class="momdc">${esc(u.d)}</span><span class="momt">${esc(u.t)}</span></li>`;
  const first = ups.slice(0, 3), rest = ups.slice(3);
  return `<ol class="momlist">${first.map(li).join('')}</ol>` + (rest.length ? `<div class="momrest" hidden><ol class="momlist">${rest.map(li).join('')}</ol></div><button type="button" class="optbtn mommore" aria-expanded="false">Show ${rest.length} earlier updates ▾</button>` : '');
}
function momGroupHtml(g, i){
  const hasSubs = g.subs.length > 1 || (g.subs[0] && g.subs[0].title);
  const subs = g.subs.map((s, j) => hasSubs
    ? `<div class="momsub2"><div class="momsh"><span class="momnum">${j + 1}</span><b dir="rtl">${esc(s.title)}</b></div>${momUpdates(s.updates)}</div>`
    : `<div class="momsub2">${momUpdates(s.updates)}</div>`).join('');
  return `<div class="momcard"><div class="momah" dir="rtl">${i + 1}. ${esc(g.title)}</div>${subs}</div>`;
}
function addMOMTab(){
  if (typeof MOM === 'undefined') { const c = repCard('MOM', 'محضر', 'Minutes not loaded yet — drop the minutes .docx in the drop folder.'); finishReport(c); return; }
  const card = repCard('MOM · PMO Executive Meeting', 'محضر اجتماع · الاجتماع الدوري لقطاع المشاريع', `Northwestern Cluster highlights · meeting of ${esc(MOM.meeting)} · latest update ${esc(MOM.latest)}`);
  const rb = card.querySelector('.rbody');
  rb.innerHTML = `<div class="momhead"><b>${esc(MOM.title)}</b><b dir="rtl">${esc(MOM.titleAr)}</b></div>` +
    `<div class="momgrid">${MOM.groups.map(momGroupHtml).join('')}</div>`;
  rb.querySelectorAll('.mommore').forEach(btn => btn.addEventListener('click', () => {
    const box = btn.previousElementSibling, open = box.hidden; box.hidden = !open;
    btn.textContent = open ? 'Show less ▴' : `Show ${box.querySelectorAll('li').length} earlier updates ▾`; btn.setAttribute('aria-expanded', open);
  }));
  finishReport(card);
}

/* build: MOM minutes read by the update job (python-docx) */

/* =====================================================================
   Weekly Meeting Data: verified figures from the minutes (14 Oct 2026) and support report (25 Oct 2026),
   plus search over all the text of both files, the MOM and the White Helmet data.
   Arabic first, English beneath. More than 5 matches: ask which category.
   ===================================================================== */
const MEET_CAT_AR = {projects:'مشاريع', contractors:'مقاولون', consultants:'استشاريون', statements:'مستخلصات ختامية', withdrawn:'مشاريع مسحوبة', budget:'ميزانية', audit:'ملاحظات التدقيق', minutes_actions:'إجراءات المحضر', other:'أخرى'};
const MEET_CAT_EN = {projects:'Projects', contractors:'Contractors', consultants:'Consultants', statements:'Final statements', withdrawn:'Withdrawn projects', budget:'Budget', audit:'Audit notes', minutes_actions:'Minutes actions', other:'Other'};
const MEET_SYN = {                                                   // English / variant words -> Arabic words used in the files
  dorsh:['دورش','دورتش'], dorch:['دورش'], fcc:['فيوتشر','فيوتشير'], future:['فيوتشر','مستقبلي','مستقبلية'], consultant:['استشاري','الاستشاري','الاستشارى'], consultants:['استشاري','الاستشاري'],
  contractor:['مقاول','المقاول','شركة'], contractors:['مقاول','المقاولين','شركة'], ceiling:['أسقف','سقف','اسقف','أسقف'], ceilings:['أسقف','سقف'], cap:['سقف','أسقف'],
  supervision:['إشراف','اشراف','الإشراف','الاشراف'], audit:['تدقيق','التدقيق'], notes:['ملاحظات','ملاحظة','ملاحظات'], note:['ملاحظة','ملاحظات'],
  statement:['مستخلص','المستخلص','مستخلصات'], statements:['مستخلص','مستخلصات','المستخلصات'], final:['ختامي','الختامي','نهائي','نهائياً'], closing:['إغلاق','اغلاق'], close:['إغلاق','اغلاق'],
  withdrawn:['مسحوبة','المسحوبة','منهاة','المنهاة','مسحوب'], withdraw:['مسحوبة','مسحوب'], retender:['طرح','اعادة','إعادة'], tender:['طرح','الطرح'], reaward:['ترسية','ترسيتها','الترسية'],
  meeting:['اجتماع','الاجتماع','محضر','المحضر'], minutes:['محضر','المحضر','اجتماع'], budget:['ميزانية','الميزانية'], project:['مشروع','مشاريع','المشروع'], projects:['مشروع','مشاريع','المشاريع'],
  audit:['تدقيق','التدقيق','تدقيق'], internal:['داخلي','الداخلي'], delivered:['مسلم','مسلّمة','مسلمة'], handover:['استلام','الاستلام'], operation:['تشغيل','التشغيل'], saving:['وفورات','الوفورات'], savings:['وفورات','الوفورات'],
  northwest:['الشمالي','الغربي','شمالي','غربي'], madinah:['المدينة','المدينة المنورة'], tabuk:['تبوك'], riyadh:['الرياض'], paid:['صرف','المصروف'], unpaid:['صرف'],
};
const MEET_FILLER = new Set(['في','من','الى','إلى','على','عن','مع','و','او','أو','the','of','in','for','and','or','a','an','is','what','which','show','me','ما','هي','هو','كم','لدي','عرض']);
function meetIndex(){                                                    // every searchable text: both presentations, MOM updates, White Helmet names
  if (meetIndex._d) return meetIndex._d;
  const out = [];
  if (typeof MEET !== 'undefined') MEET.items.forEach(it => out.push({ar: it.ar, title: it.title, en: `${MEET_CAT_EN[it.cat] || 'Other'} · ${it.file === 'minutes' ? 'Minutes 14 Oct 2026' : 'Support report 25 Oct 2026'} · slide ${it.slide}`, cat: it.cat, src: it.src}));
  if (typeof MOM !== 'undefined') MOM.groups.forEach(g => g.subs.forEach(s => s.updates.forEach(u => out.push({ar: u.t, en: `Minutes update · ${u.d}`, cat: 'minutes_actions', src: 'محضر الاجتماع'}))));
  if (typeof WH !== 'undefined') WH.projects.forEach(p => out.push({ar: p.name, en: `White Helmet · PO ${p.po} · ${p.pno} · ${p.consultant}`, cat: 'projects', src: 'White Helmet', po: p.po}));
  meetIndex._d = out; return out;
}
const meetNorm = w => (w.length > 4 && w.startsWith('ال') ? w.slice(2) : w);     // ignore the Arabic article ال
const meetToks = s => adTokens(s).map(meetNorm);
function meetSearch(q, cat){
  const qt = meetToks(q).filter(t => !MEET_FILLER.has(t)); if (!qt.length) return [];
  const forms = qt.map(t => [t, ...(MEET_SYN[t] || []).flatMap(x => meetToks(x))]);
  const need = qt.length === 1 ? 1 : Math.max(1, Math.ceil(qt.length * 0.6));
  const hits = [];
  meetIndex().forEach(it => {
    if (cat && it.cat !== cat) return;
    const ws = meetToks(it.ar + ' ' + (it.title || ''));
    let m = 0;
    forms.forEach(fs => { if (fs.some(f => adTokOK(f, ws))) m++; });
    if (m >= need) hits.push({it, score: m / qt.length});
  });
  return hits.sort((a, b) => b.score - a.score).map(h => h.it);
}
function meetResultsHtml(q, cat){
  const hits = meetSearch(q, cat), head = `<div class="adsres-h"><b dir="rtl">نتائج البحث</b><small>Search results · ${hits.length} for “${esc(q)}”${cat ? ' · ' + (MEET_CAT_EN[cat] || cat) : ''}</small></div>`;
  if (!hits.length) return head + `<div class="rempty"><span dir="rtl">لا توجد نتائج مطابقة — جرّب كلمات أخرى أو اسم المشروع أو المقاول</span><br><small>No match. Try other words, a project name or a contractor.</small></div>`;
  if (hits.length > 5 && !cat) {
    const counts = {}; hits.forEach(h => counts[h.cat] = (counts[h.cat] || 0) + 1);
    const chips = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).map(c => `<button type="button" class="optbtn meetcat" data-cat="${c}" data-q="${esc(q)}"><span dir="rtl">${MEET_CAT_AR[c] || c}</span><small>${MEET_CAT_EN[c] || c} · ${counts[c]}</small></button>`).join('');
    return head + `<div class="momq" dir="rtl"><b>وجدنا ${hits.length} نتيجة. أي فئة تقصد؟</b><br><small>${hits.length} matches. Which category do you mean?</small></div><div class="meetcats">${chips}</div>`;
  }
  return head + `<div class="meetres">` + hits.slice(0, cat ? 50 : 5).map(h => `<div class="meetrow"><div class="mt" dir="rtl">${esc(h.ar.slice(0, 320))}</div><div class="me">${esc(h.en)}</div></div>`).join('') + `</div>`;
}
function wireMeet(root, q){
  root.querySelectorAll('.meetcat').forEach(b => b.addEventListener('click', e => { e.preventDefault(); root.innerHTML = meetResultsHtml(b.dataset.q, b.dataset.cat); wireMeet(root, b.dataset.q); }));
}
function meetFigures(){
  const F = MEET.figures, K = [
    [F.to_close, 'مشروع للإغلاق', 'projects to close', F.to_close_val ? F.to_close_val + ' مليون ريال' : ''],
    [F.closed, 'مغلق نهائياً', 'closed finally', F.closed_val + ' مليون ريال · ' + F.closed_pct + '%'],
    [F.no_statement, 'بانتظار المستخلص الختامي', 'awaiting final statement', F.no_statement_val + ' مليون ريال · ' + F.no_statement_pct + '%'],
    [F.not_meeting_criteria, 'غير مستوفية لشروط الإغلاق', 'not meeting closing criteria', ''],
    [F.not_settled, 'لم تتم التسوية مع المقاول', 'not settled with contractor', ''],
    [F.audit_notes, 'ملاحظة تدقيق داخلي', 'internal audit notes', ''],
    [F.nw_under_procedure, 'مشروع تحت الإجراء · القطاع الشمالي الغربي', 'NW projects under procedure', ''],
    [F.linked_delivered, 'مليون ريال · مشاريع مسلمة مرتبطة', 'M SAR · linked delivered projects', ''],
    [F.supervision_cost_end, 'مليون ريال · تكلفة الإشراف طبقا للنهاية التعاقدية', 'M SAR · supervision cost (contract end)', ''],
  ];
  return K.filter(k => k[0] !== undefined && k[0] !== null);
}
function kmBlock(){
  const F = MEET.figures; if (F.km_water === undefined || F.km_sewer === undefined) return '';
  const w = F.km_water, s = F.km_sewer, t = w + s;
  const panel = (key) => {
    const n = key === 'water' ? w : key === 'sewer' ? s : t;
    const label = key === 'water' ? ['خطوط وشبكات المياه', 'Water lines & networks'] : key === 'sewer' ? ['خطوط وشبكات الصرف الصحي', 'Waste water lines & networks'] : ['إجمالي الكيلومترات', 'Total kilometres'];
    const pw = key === 'all' ? 100 : Math.round(n / t * 100);
    return `<div class="kmbig"><span class="kmn">${n}</span><span class="kmu">كم · km</span></div><div class="kml"><b dir="rtl">${label[0]}</b><small>${label[1]}</small></div>` +
      `<div class="kmbar"><i style="width:${key === 'all' ? 100 : pw}%"></i></div>` +
      `<div class="kmsplit"><span>مياه · Water <b>${w} كم</b> (${Math.round(w / t * 100)}%)</span><span>صرف · Waste water <b>${s} كم</b> (${Math.round(s / t * 100)}%)</span></div>`;
  };
  return `<div class="kmcard" data-km="all"><div class="kmtitle"><b dir="rtl">الكيلومترات المنجزة</b><small>Kilometres completed · 2026 حتى 25 أكتوبر 2026</small></div>` +
    `<div class="kmbtns"><button type="button" class="rpill kmb on" data-k="all"><span dir="rtl">الكل</span> · All</button><button type="button" class="rpill kmb" data-k="water"><span dir="rtl">مياه</span> · Water</button><button type="button" class="rpill kmb" data-k="sewer"><span dir="rtl">صرف صحي</span> · Waste water</button></div>` +
    `<div class="kmbody">${panel('all')}</div></div>`;
}
function wireKm(root){
  root.querySelectorAll('.kmb').forEach(b => b.addEventListener('click', () => {
    const card = b.closest('.kmcard'), k = b.dataset.k, F = MEET.figures, w = F.km_water, s = F.km_sewer, t = w + s;
    card.querySelectorAll('.kmb').forEach(x => x.classList.toggle('on', x === b));
    const n = k === 'water' ? w : k === 'sewer' ? s : t;
    const label = k === 'water' ? ['خطوط وشبكات المياه', 'Water lines & networks'] : k === 'sewer' ? ['خطوط وشبكات الصرف الصحي', 'Waste water lines & networks'] : ['إجمالي الكيلومترات', 'Total kilometres'];
    card.querySelector('.kmn').textContent = n; card.querySelector('.kml').innerHTML = `<b dir="rtl">${label[0]}</b><small>${label[1]}</small>`;
    card.querySelector('.kmbar i').style.width = (k === 'all' ? 100 : Math.round(n / t * 100)) + '%';
  }));
}
function paintMeet(card, q){
  const rb = card.querySelector('.rbody');
  if (typeof MEET === 'undefined') { rb.innerHTML = '<div class="rempty">Weekly meeting files not loaded yet. Drop the minutes and support report .pptx files in the drop folder.</div>'; return; }
  const F = MEET.figures, pct = (n, t) => t ? Math.round(n / t * 100) : 0;
  const kpis = meetFigures().map(k => `<div class="kpi"><span class="kv">${typeof k[0] === 'number' ? k[0].toLocaleString('en-US') : k[0]}</span><span class="kl"><b dir="rtl">${k[1]}</b><small>${k[2]}${k[3] ? ' · ' + k[3] : ''}</small></span></div>`).join('');
  rb.innerHTML = kmBlock() + `<div class="rrule">Verified figures only · محضر ${esc(MEET.sources[0].date)} · تقرير داعم ${esc(MEET.sources[1].date)}</div>` +
    `<div class="adkpis">${kpis}</div>` +
    `<div class="momsub2"><div class="momsh"><b dir="rtl">حالة إغلاق أوامر الشراء</b></div><div class="brow"><div class="btop"><span class="bl"><b dir="rtl">مغلق نهائياً</b><small>Closed finally</small></span><span class="bn"><b>${F.closed_pct}%</b></span></div><div class="btrack"><i style="width:${F.closed_pct}%;background:#2E8B57"></i></div></div>` +
    `<div class="brow"><div class="btop"><span class="bl"><b dir="rtl">بانتظار المستخلص الختامي</b><small>Awaiting final statement</small></span><span class="bn"><b>${F.no_statement_pct}%</b></span></div><div class="btrack"><i style="width:${F.no_statement_pct}%;background:#E5484D"></i></div></div></div>` +
    `<div class="whsbox"><input type="search" class="adsearch meetsearch" placeholder="ابحث: مشروع، مقاول، استشاري، ملاحظة · Search" aria-label="Search the weekly meeting data"></div>` +
    `<div class="meetout"></div>`;
  wireKm(rb);
  const inp = rb.querySelector('.meetsearch'), out = rb.querySelector('.meetout');
  inp.addEventListener('input', () => { const v = inp.value.trim(); out.innerHTML = v ? meetResultsHtml(v) : ''; wireMeet(out, v); });
  if (q) { inp.value = q; inp.dispatchEvent(new Event('input')); }
}
function addMeetingTab(q){
  const card = repCard('Weekly Meeting Data', 'بيانات الاجتماع الأسبوعي', 'Minutes 14 Oct 2026 · Support report 25 Oct 2026');
  paintMeet(card, q || ''); finishReport(card);
}
function routeMeet(q){
  const t = nrm(q).split(/[\s,?؟!.]+/).filter(Boolean);
  if (t.some(w => ['meeting','meetings','minutes','اجتماع','الاجتماع','محضر','المحضر'].includes(w)) && t.length <= 4 && !t.some(w => /^\d{9}$/.test(w))) return {type:'report', view:'meet', arg:null};
  return null;
}

/* =====================================================================
   Operating Status (from the minutes, slides 23-29). Three groups with totals; rows show their details.
   A project opens its weekly control card only when its name matches one weekly project clearly.
   ===================================================================== */
function opsWeeklyLink(name){
  const nt = meetToks(name).filter(t => t.length >= 3); if (nt.length < 2) return null;
  let best = null, second = 0;
  PROJECTS.forEach(p => {
    const pt = meetToks(p.name); const m = nt.filter(t => pt.some(w => adTokOK(t, [w]))).length;
    const sc = m / Math.max(nt.length, 1);
    if (!best || sc > best.sc) { second = best ? best.sc : second; best = {p, sc}; } else if (sc > second) second = sc;
  });
  return best && best.sc >= 0.85 && best.sc > second ? best.p : null;
}
function opsRowHtml(r, gi){
  const link = opsWeeklyLink(r.name);
  const chips = [
    r.cls ? `<span class="opc c-blue">${esc(r.cls)}</span>` : '',
    r.area ? `<span class="opc">${esc(r.area)}</span>` : '',
    r.val ? `<span class="opc">${esc(r.val)} M SAR</span>` : '',
    r.rcat ? `<span class="opc c-gold">${esc(r.rcat)}</span>` : '',
    r.dup ? `<span class="opc c-red">مكرر · duplicate</span>` : '',
    r.transferred ? `<span class="opc c-purple">نُقل لجهة أخرى · transferred</span>` : '',
    r.pct ? `<span class="opc">${esc(r.pct)}% تشغيل · in service</span>` : '',
  ].join('');
  const details = [
    r.reason ? `<div><dt>السبب / الدعم المطلوب · Reason</dt><dd dir="rtl">${esc(r.reason)}</dd></div>` : '',
    r.impact ? `<div><dt>الأثر · Impact</dt><dd dir="rtl">${esc(r.impact)}</dd></div>` : '',
    r.end ? `<div><dt>تاريخ نهاية الارتباط · Linked end</dt><dd>${esc(r.end)}</dd></div>` : '',
    r.liq ? `<div><dt>السيولة المطلوبة · Liquidity (M)</dt><dd>${esc(r.liq)}</dd></div>` : '',
    r.linked ? `<div><dt>حالة المشروع المرتبط · Linked status</dt><dd dir="rtl">${esc(r.linked)}</dd></div>` : '',
    r.status ? `<div><dt>وضع المشروع · Status</dt><dd dir="rtl">${esc(r.status)}</dd></div>` : '',
    r.op ? `<div><dt>التشغيل فور الانتهاء · Operate on completion</dt><dd dir="rtl">${esc(r.op)}</dd></div>` : '',
  ].join('');
  return `<div class="opsrow"><div class="opsn">${r.no}</div><div class="opsbody"><b dir="rtl">${esc(r.name)}</b><div class="opschips">${chips}</div>` +
    `<details class="opsmore"><summary>التفاصيل · Details</summary><dl class="addl">${details}</dl></details>` +
    (link ? `<button type="button" class="optbtn openbtn opsopen" data-po="${esc(link.po)}">فتح بطاقة المشروع · Open the control card</button>` : '') + `</div></div>`;
}
function addOpsTab(){
  if (typeof OPS === 'undefined') return addAdhocTab();
  const tot = OPS.groups.reduce((a, g) => a + g.rows.length, 0), totVal = OPS.groups.reduce((a, g) => a + (g.totalValue || 0), 0);
  const card = repCard('حالة تشغيل المشاريع', 'Operating Status', `Minutes slides 23–29 · ${tot} projects · ${totVal.toFixed(1)} M SAR`);
  const groups = OPS.groups.map((g, gi) => `<details class="opsgrp"${gi === 0 ? ' open' : ''}><summary><span class="opsh"><b dir="rtl">${esc(g.title)}</b><small>${esc(g.titleEn)}</small></span><span class="opsc"><b>${g.totalCount}</b><small>${g.totalValue} M SAR</small></span></summary>` +
    `<div class="opslist">${g.rows.map((r) => opsRowHtml(r, gi)).join('')}</div></details>`).join('');
  card.querySelector('.rbody').innerHTML = `<div class="opstot"><div><b>${tot}</b><small>projects not fully benefited from</small></div><div><b>${totVal.toFixed(1)}</b><small>M SAR in total</small></div></div>` + groups +
    `<div class="rrule">Source: minutes presentation, slides 23–29. Totals agree with slide 22. A project opens its card only when its name matches the weekly report clearly.</div>`;
  card.querySelectorAll('.opsopen').forEach(b => b.addEventListener('click', e => { e.preventDefault(); handleQuery(b.dataset.po); }));
  finishReport(card);
}
