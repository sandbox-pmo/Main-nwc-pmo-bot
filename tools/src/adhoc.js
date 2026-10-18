
/* =====================================================================
   Operating Status dashboard - "projects not (fully) benefited from"
   Source: the Ad-Hoc deck of 18 Oct 2026 (slides 12-19).  Same design as the Portfolio tab; every project that is in the weekly list links to its control card.
   ===================================================================== */
const AD_GROUPS = {
  A: {en:'Delivered projects waiting for linked projects', ar:'مشاريع مسلّمة مرتبطة بمشاريع (تحت التنفيذ – مستقبلية)', cls:'c-k1'},
  B: {en:'Under-implementation projects linked to future projects', ar:'مشاريع تحت التنفيذ مرتبطة بمشاريع مستقبلية', cls:'c-k2'},
  C: {en:'From Operations, not in the sector list', ar:'مشاريع وردت من إدارة التشغيل وغير مضمنة بقائمة قطاع المشاريع', cls:'c-k3'},
};
const AD_CATS = [['ongoing', 'Linked to ongoing projects', 'مرتبط بمشاريع تحت التنفيذ', 'c-k2'], ['tendered', 'Linked to a tendered project (cost cap)', 'مرتبط بمشروع تم طرحه – خفض أسقف التكاليف', 'c-k1'], ['future', 'Linked to future projects', 'مرتبط بمشاريع مستقبلية', 'c-k4'],
                 ['transferred', 'Transferred to another entity', 'نُقل لجهة أخرى', 'c-k3'], ['permits', 'Permits / external parties', 'التصاريح / جهات خارجية', 'c-k5'], ['other', 'Not categorised in the deck', 'غير مصنّف في العرض', 'c-k6']];
const adLive = po => PROJECTS.find(p => p.po === po);
const adShort = (s, n) => s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
function adBar(cls, en, ar, n, max, val, extra){
  const w = n ? Math.max(4, Math.round(n / max * 100)) : 0;
  return `<div class="brow static ${cls}" role="img" aria-label="${en}: ${n}${val != null ? ', ' + nf(val) + ' million SAR' : ''}"><div class="btop"><span class="bl"><b>${en}</b><small>${ar}</small>${val != null ? `<small class="bv">${nf(val)} M SAR</small>` : ''}</span><span class="bn"><b>${n}</b></span></div><div class="btrack"><i style="width:${w}%"></i></div></div>`;
}
function adChip(po){                                                       // a linked project that IS in the weekly report -> opens its control card
  const p = adLive(po); if(!p) return '';
  return `<button class="pochip" data-po="${po}" type="button"><span class="pcd">${ST[p.sk].dot}</span><span class="pct"><b dir="rtl">${esc(adShort(p.name, 70))}</b><small>PO ${po} · ${ST[p.sk].en} · ${fmtPct(p.actual)} of ${fmtPct(p.planned)} planned</small></span><span class="pcgo" aria-hidden="true">›</span></button>`;
}
const adCodes = r => (r.codes || []).map(c => `<span class="codetag" title="Not in the weekly report, so it has no control card">${c} · future / tender stage</span>`).join('');
const adBenefit = r => r.benefit == null ? '<span class="adpill n">In service: not stated</span>' : r.benefit === 0 ? '<span class="adpill bad">Not in service</span>' : `<span class="adpill part">${r.benefit}% in service</span>`;
function adRow(g, r){
  const links = (r.links || []).map(adChip).join('') + (r.po ? adChip(r.po) : '') + adCodes(r);
  let head, body;
  if(g === 'A'){
    head = `<span class="adn">${r.no}</span><span class="adt"><b dir="rtl" lang="ar">${esc(r.name)}</b><small dir="rtl">${esc(r.contractor)}</small></span>`;
    body = `<div class="admeta"><span>${r.areaEn}</span><span>${r.cls === 'water' ? '💧 Water' : '🚰 Sewer'}</span><span>Delivered ${r.year}</span>${adBenefit(r)}</div>` +
           `<div class="adtxt" dir="rtl" lang="ar">${esc(r.reason) || '—'}</div>` +
           `<dl class="addl"><div><dt>Operation date</dt><dd dir="rtl">${esc(r.opDate) || '—'}</dd></div><div><dt>Reason category</dt><dd dir="rtl">${esc(r.category) || '—'}</dd></div>` +
           `<div><dt>Linked projects end</dt><dd>${esc(r.linkEnd) || '—'}</dd></div><div><dt>Liquidity needed (M SAR)</dt><dd>${r.liquidity == null ? '—' : nf(r.liquidity)}</dd></div>` +
           `<div><dt>Future projects (M SAR)</dt><dd>${esc(r.future) || '—'}</dd></div><div><dt>Cost boost (M SAR)</dt><dd>${esc(r.boost) || '—'}</dd></div></dl>`;
  } else if(g === 'B'){
    const p = adLive(r.po);
    head = `<span class="adn">${r.no}</span><span class="adt"><b dir="rtl" lang="ar">${esc(r.name)}</b><small>${esc(r.province)} · ${nf(r.value)} M SAR</small></span>`;
    body = `<div class="admeta"><span>${r.areaEn}</span><span>Planned finish ${r.planned}</span><span class="adpill ${r.opOnFinish === 'لا' ? 'bad' : 'part'}">${r.opOnFinish === 'لا' ? 'Cannot operate on completion' : 'Partly operates on completion ' + esc(r.opOnFinish.replace(/[^\d%()]/g, ''))}</span></div>` +
           `<div class="adtxt" dir="rtl" lang="ar">${esc(r.reason)}</div>` +
           `<dl class="addl"><div><dt>Deck status</dt><dd dir="rtl">${esc(r.deckStatus)}</dd></div><div><dt>Live status (weekly file)</dt><dd>${ST[p.sk].dot} ${ST[p.sk].en} · ${fmtPct(p.actual)} of ${fmtPct(p.planned)}</dd></div>` +
           `<div><dt>Expected operation</dt><dd>${esc(r.expOp) || '—'}</dd></div><div><dt>Linked project</dt><dd dir="rtl">${esc(r.linkedState)}</dd></div><div><dt>Future projects (M SAR)</dt><dd>${esc(r.future) || '—'}</dd></div></dl>`;
  } else {
    head = `<span class="adn">${r.no}</span><span class="adt"><b dir="rtl" lang="ar">${esc(r.name)}</b><small>Delivered ${r.year} · ${nf(r.value)} M SAR</small></span>`;
    body = `<div class="admeta"><span>${r.areaEn}</span><span>${r.cls === 'water' ? '💧 Water' : '🚰 Sewer'}</span></div><div class="adtxt" dir="rtl" lang="ar">${esc(r.reason)}</div>` +
           `<dl class="addl"><div class="wide"><dt>Projects sector's reply</dt><dd dir="rtl">${esc(r.sectorReply) || '—'}</dd></div></dl>`;
  }
  const quick = g === 'B' ? adChip(r.po) : links;                           // the links stay visible under the project, expanded or not
  return `<div class="adwrap"><details class="adrow"><summary>${head}</summary>${body}</details>${quick ? `<div class="adlinks">${quick}</div>` : ''}</div>`;
}
function addAdhocTab(){
  const A = ADHOC.A, B = ADHOC.B, C = ADHOC.C, S = ADHOC.summary, total = A.length + B.length + C.length, totalVal = S.delivered.value + S.underImpl.value + S.ops.value;
  const card = repCard('Operating Status', 'حالة تشغيل المشاريع', `Projects not fully benefited from · ad-hoc report of ${fmtDate(ADHOC.date)} (deck slides 12–19) · linked projects open their control cards`);
  const cat = k => A.filter(r => k === 'ongoing' ? (r.cat === 'ongoing' || r.cat === 'ongoing_future') : r.cat === k).length, mx = Math.max(...AD_CATS.map(c => cat(c[0])));
  const sec = (en, ar, inner) => `<div class="pfsec"><div class="sh"><b>${en}</b><small>${ar}</small></div>${inner}</div>`;
  const tiles = arr => `<div class="grid g2">${arr.map(t => tile({v: t.v, big: true, cls: t.cls || '', l: [t.en, t.ar]})).join('')}</div>`;
  const u = (n, val) => `${n}<span class="u">${val == null ? '' : nf(val) + ' M SAR'}</span>`;
  const list = g => `<details class="adgrp" id="adg-${g}" open><summary><span class="sh"><b>${AD_GROUPS[g].en}</b><small>${AD_GROUPS[g].ar}</small></span><span class="adcount">${{A: A, B: B, C: C}[g].length}</span></summary>${{A: A, B: B, C: C}[g].map(r => adRow(g, r)).join('')}</details>`;
  card.querySelector('.rbody').innerHTML =
    `<div class="totalbox"><span class="tn">${total}</span><span class="tt"><b>Projects not fully benefited from</b><small>مشاريع غير مستفاد منها بالكامل</small><small class="bv">${nf(totalVal)} M SAR in total</small></span></div>` +
    ['A', 'B', 'C'].map(g => { const n = {A: A, B: B, C: C}[g].length, v = {A: S.delivered.value, B: S.underImpl.value, C: S.ops.value}[g];
      return `<button class="brow ${AD_GROUPS[g].cls}" data-grp="${g}" type="button" aria-label="${AD_GROUPS[g].en}: ${n} projects"><div class="btop"><span class="bl"><b>${AD_GROUPS[g].en}</b><small>${AD_GROUPS[g].ar}</small><small class="bv">${nf(v)} M SAR</small></span><span class="bn"><b>${n}</b></span></div><div class="btrack"><i style="width:${Math.max(4, Math.round(n / 16 * 100))}%"></i></div></button>`; }).join('') +
    `<div class="bhint">Tap a bar to jump to its project list.</div>` +
    sec('Delivered projects — ' + A.length, 'المشاريع المسلّمة', tiles([{v: u(S.delivered.notOp[0], S.delivered.notOp[1]), cls: 'bad', en: 'Not in service', ar: 'غير مشغّلة'}, {v: u(S.delivered.partOp[0], S.delivered.partOp[1]), cls: 'warn', en: 'Partly in service', ar: 'مشغّلة جزئياً'},
      {v: u(S.delivered.sewer[0], S.delivered.sewer[1]), cls: 'v-blue', en: 'Sewer', ar: 'صرف صحي'}, {v: u(S.delivered.water[0], S.delivered.water[1]), cls: 'v-blue', en: 'Water', ar: 'مياه'}]) +
      adBar('c-k3', 'Madinah', 'المدينة المنورة', S.delivered.madinah[0], 9, S.delivered.madinah[1]) + adBar('c-k1', 'Tabuk', 'تبوك', S.delivered.tabuk[0], 9, S.delivered.tabuk[1]) +
      `<div class="adsub">Why they cannot be used yet</div>` + AD_CATS.filter(c => cat(c[0])).map(c => adBar(c[3], c[1], c[2], cat(c[0]), mx)).join('')) +
    sec('Under implementation — ' + B.length, 'تحت التنفيذ', tiles([{v: u(S.underImpl.noOpOnFinish[0], S.underImpl.noOpOnFinish[1]), cls: 'bad', en: 'Cannot operate on completion', ar: 'لن تُشغّل فور الانتهاء'}, {v: u(S.underImpl.partOnFinish[0], S.underImpl.partOnFinish[1]), cls: 'warn', en: 'Partly operates on completion', ar: 'تُشغّل جزئياً'},
      {v: u(S.underImpl.madinah[0], S.underImpl.madinah[1]), cls: 'v-blue', en: 'Madinah', ar: 'المدينة المنورة'}, {v: u(S.underImpl.tabuk[0], S.underImpl.tabuk[1]), cls: 'v-blue', en: 'Tabuk', ar: 'تبوك'}]) +
      `<div class="adsub">Live status of these projects (weekly file)</div>` + ['ahead', 'ontrack', 'delay', 'trouble'].map(k => ({k, n: B.filter(r => adLive(r.po).sk === k).length})).filter(x => x.n).map(x => adBar('c-' + x.k, ST[x.k].en, ST[x.k].ar, x.n, 2)).join('')) +
    sec('From Operations — ' + C.length, 'من إدارة التشغيل', tiles([{v: u(S.ops.water[0], S.ops.water[1]), cls: 'v-blue', en: 'Water', ar: 'مياه'}, {v: u(S.ops.sewer[0], S.ops.sewer[1]), cls: 'v-blue', en: 'Sewer', ar: 'صرف صحي'}, {v: u(S.ops.madinah[0], S.ops.madinah[1]), en: 'Madinah', ar: 'المدينة المنورة'}, {v: u(S.ops.tabuk[0], null), en: 'Tabuk', ar: 'تبوك'}])) +
    `<div class="adlist">${list('A')}${list('B')}${list('C')}</div>` +
    `<div class="rrule">Figures are those of the deck (slide 12), cross-checked against its tables. Linked projects that appear in the weekly report show their live status; projects marked “future / tender stage” are not in the weekly report and have no control card.</div>`;
  card.querySelectorAll('.pochip').forEach(b => b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); handleQuery(b.dataset.po); }));
  card.querySelectorAll('.brow[data-grp]').forEach(b => b.addEventListener('click', () => { const d = card.querySelector('#adg-' + b.dataset.grp); d.open = true; d.scrollIntoView({block: 'start', behavior: 'smooth'}); }));
  finishReport(card);
}
