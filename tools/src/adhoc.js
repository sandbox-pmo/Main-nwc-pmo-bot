
/* =====================================================================
   Operating Status - linkage register (new breakdown). Source: the "ارتباطات المشاريع" workbook (28 linked projects).
   Every bar and number drills down to its project list; each project with a control card links to it.
   ===================================================================== */
const AD_CAT_ORDER = ['tender', 'construction', 'future', 'strategic', 'external', 'transferred'];
const AD_CAT = {
  tender: ['مرتبط بمشروع تحت الطرح', 'Linked to a project under tender', 'c-k1'],
  construction: ['مرتبط بمشروع تحت التنفيذ', 'Linked to a project under construction', 'c-k2'],
  future: ['مرتبط بمشروع مستقبلي', 'Linked to a future project', 'c-k4'],
  strategic: ['مرتبط بمشروع مستقبلي مدرج ضمن الاستراتيجية', 'Linked to a future project included in the strategy', 'c-k2'],
  external: ['مرتبط بمشروع مستقبلي لدى جهة خارجية', 'Linked to a future project of an external party', 'c-k5'],
  transferred: ['نُقل إلى جهة أخرى', 'Transferred to another entity', 'c-k3'],
};
const AD_REL = {Downstream: ['تابع (Downstream)', 'Downstream'], Upstream: ['مغذٍّ (Upstream)', 'Upstream'], Both: ['في الاتجاهين', 'Upstream and downstream'], None: ['بدون ارتباط محدد', 'No link stated']};
const AD_PRED = {
  cat: (k, r) => r.cat === k, rel: (k, r) => r.relation === k, type: (k, r) => !!(r.type || r.impact), card: (k, r) => (k === 'yes' ? !!(r.po || r.relPo) : !(r.po || r.relPo)),
};
const AD_DRILL_LABEL = (key) => {
  const [g, k] = key.split('|');
  if (key === 'ALL|all') return ['جميع المشاريع المرتبطة', 'All linked projects'];
  if (g === 'cat') return AD_CAT[k].slice(0, 2);
  if (g === 'rel') return AD_REL[k];
  if (g === 'type') return ['تعذر التشغيل أو الاستفادة بسبب غياب المشروع المرتبط', 'Use or commissioning blocked by a missing linked project'];
  if (g === 'hub') return [`يعيق مشاريع أخرى · ${k === 'NONE' ? 'بدون رمز محدد' : k}`, `Blocks other projects · ${k === 'NONE' ? 'no coded blocker' : k}`];
  if (g === 'card') return k === 'yes' ? ['لها بطاقة تحكم في التقرير الأسبوعي', 'Has a control card in the weekly report'] : ['ليس لها بطاقة في التقرير الأسبوعي', 'Not in the weekly report (no control card)'];
  return [key, key];
};
const adRowsAll = () => ADHOC.rows;
const adCodesOf = r => { const c = String(r.rel || '').split(/[\s\/]+/).map(x => x.trim()).filter(x => x && x.toUpperCase() !== 'NA' && x !== '-'); return c.length ? c.map(x => x.toUpperCase()) : ['NONE']; };
const adHubs = () => { const m = {}; ADHOC.rows.forEach(r => adCodesOf(r).forEach(c => { (m[c] = m[c] || {code: c, rows: [], title: ''}).rows.push(r); if (!m[c].title && r.relTitle) m[c].title = r.relTitle; })); return Object.values(m).sort((x, y) => y.rows.length - x.rows.length || x.code.localeCompare(y.code)); };
const adValue = rs => rs.reduce((s, r) => s + (r.value || 0), 0);
const adValued = rs => rs.filter(r => r.value != null).length;
const nfM = v => (v == null ? '—' : nf(v) + ' M SAR');
function adPredicate(key){ const [g, k] = key.split('|'); if (key === 'ALL|all') return () => true; if (g === 'hub') return r => adCodesOf(r).includes(k); return r => AD_PRED[g](k, r); }
const adLiveP = po => PROJECTS.find(p => p.po === po);
function adChip(po){                                          // a linked project in the weekly report -> opens its control card
  const p = adLiveP(po); if (!p) return '';
  return `<button class="pochip" data-po="${po}" type="button"><span class="pcd">${ST[p.sk].dot}</span><span class="pct"><b dir="rtl">${esc(adShort(p.name, 70))}</b><small>PO ${po} · ${ST[p.sk].en} · ${fmtPct(p.actual)} of ${fmtPct(p.planned)} planned</small></span><span class="pcgo" aria-hidden="true">›</span></button>`;
}
function adShort(s, n){ return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }
function adRow(r){
  const chips = (r.po ? adChip(r.po) : '') + (r.relPo && r.relPo !== r.po ? adChip(r.relPo) : '');
  const noCard = !(r.po || r.relPo) ? '<span class="codetag">ليس لها بطاقة في التقرير الأسبوعي · no control card</span>' : '';
  const dl = (t, v) => v ? `<div><dt>${t}</dt><dd dir="rtl">${esc(v)}</dd></div>` : '';
  return `<div class="adwrap"><details class="adrow"><summary><span class="adn">${r.no}</span><span class="adt"><b dir="rtl" lang="ar">${esc(r.title) || esc(r.pno) || '—'}</b><small dir="rtl">${esc(r.contractor)}${r.pno ? ' · ' + esc(r.pno) : ''}</small></span></summary>` +
    `<div class="admeta"><span class="adpill ${AD_CAT[r.cat] ? AD_CAT[r.cat][2] : ''}">${AD_CAT[r.cat] ? AD_CAT[r.cat][0] : '—'}</span><span>${AD_REL[r.relation] ? AD_REL[r.relation][1] : r.relation}</span>${r.type ? `<span>${esc(r.type)}</span>` : ''}</div>` +
    `<dl class="addl">${dl('Linked project', (r.rel ? r.rel + ' · ' : '') + (r.relTitle || ''))}${dl('Linked project status', r.relStatus)}${dl('Project status', r.status)}${dl('Impact', r.impact)}${dl('Link description', r.desc)}${dl('Proposed action', r.sol)}${dl('Notes', r.notes)}</dl>` +
    `${noCard}</details>${chips ? `<div class="adlinks">${chips}</div>` : ''}</div>`;
}
function adBar2(cls, ar, en, n, max, key){
  const w = n ? Math.max(4, Math.round(n / max * 100)) : 0;
  return `<button type="button" class="brow ${cls}" data-drill="${key}" aria-label="${en}: ${n}"><div class="btop"><span class="bl"><b dir="rtl">${ar}</b><small>${en}</small></span><span class="bn"><b>${n}</b></span></div><div class="btrack"><i style="width:${w}%"></i></div></button>`;
}
const adDrillBtn = (key, inner) => `<button type="button" class="adtb" data-drill="${key}" aria-label="${AD_DRILL_LABEL(key)[1]}">${inner}</button>`;
function adDrillHtml(key){
  const L = AD_DRILL_LABEL(key), items = adRowsAll().filter(adPredicate(key));
  const head = `<div class="addrill"><button type="button" class="adback" data-back="1"><span dir="rtl">‹ رجوع</span><small>Back to overview</small></button><div class="adtitle"><b dir="rtl">${L[0]}</b><small>${L[1]} · ${items.length} projects</small></div></div>`;
  const list = items.length ? `<div class="adlist">${items.map(adRow).join('')}</div>` : `<div class="rempty"><span dir="rtl">لا توجد مشاريع في هذه الفئة</span><br><small>No projects in this group.</small></div>`;
  return head + list + `<div class="rrule">Tap a project to see its link details. Projects with a control card open it from the button under the project.</div>`;
}
function adOverviewHtml(){
  const R = ADHOC.rows, n = R.length, cnt = pred => R.filter(pred).length, mx = Math.max(...AD_CAT_ORDER.map(k => cnt(r => r.cat === k)));
  const hubs = adHubs(), coded = hubs.filter(h => h.code !== 'NONE'), top = coded.slice(0, 6), none = hubs.find(h => h.code === 'NONE');
  const totalVal = adValue(R), valued = adValued(R), withCard = cnt(r => r.po || r.relPo);
  const sec = (en, ar, inner) => `<div class="pfsec"><div class="sh"><b dir="rtl">${ar}</b><small>${en}</small></div>${inner}</div>`;
  const kpi = (key, big, ar, en, sub, cls) => `<button type="button" class="adtb kpi ${cls || ''}" data-drill="${key}" aria-label="${en}: ${big}"><span class="kv">${big}</span><span class="kl"><b dir="rtl">${ar}</b><small>${en}</small>${sub ? `<small class="ks">${sub}</small>` : ''}</span></button>`;
  const hubRow = (h, i) => {
    const cats = [...new Set(h.rows.map(r => r.cat))].map(k => `<span class="adpill ${AD_CAT[k][2]}">${AD_CAT[k][0]}</span>`).join('');
    const card = (() => { const r = h.rows.find(x => x.relPo); return r ? adChip(r.relPo) : ''; })();
    const val = adValue(h.rows);
    return `<div class="hubrow"><button type="button" class="adtb hubhead" data-drill="hub|${h.code}"><span class="hubn">${i + 1}</span><span class="hubt"><b>${h.code}</b><small dir="rtl">${esc(adShort(h.title || '', 60))}</small><span class="hubm">${cats}</span></span><span class="hubc"><b>${h.rows.length}</b><small>${h.rows.length > 1 ? 'projects' : 'project'}</small>${val ? `<small class="bv">${nf(val)} M SAR</small>` : ''}</span></button>${card ? `<div class="adlinks">${card}</div>` : ''}</div>`;
  };
  return `<div class="adkpis">` +
      kpi('ALL|all', n, 'مشاريع لم يُستفد منها', 'Not benefited from', `${valued} of ${n} valued`, 'k1') +
      kpi('ALL|all', nfM(totalVal), 'القيمة المعروفة', 'Known value at stake', 'from deck tables', 'k2') +
      kpi('cat|tender', cnt(r => r.cat === 'tender'), 'مرتبطة بمشاريع تحت الطرح', 'Waiting on a project under tender', `${Math.round(cnt(r => r.cat === 'tender') / n * 100)}% of the total`, 'k3') +
      kpi('card|yes', withCard, 'لها بطاقة في التقرير', 'With a control card', `${n - withCard} not in the weekly report`, 'k4') + `</div>` +
    sec('Projects that hold up the most others', 'أكثر المشاريع التي تعيق غيرها', `<div class="hubs">${top.map(hubRow).join('')}</div>` +
      `<div class="rrule">${coded.length} blocking projects in total. Tap a project to see the projects it holds up. ${none ? `${none.rows.length} projects have no coded blocker in the register, so their link is described in text only.` : ''}</div>`) +
    sec('Status of the blocking projects', 'حالة المشاريع المُعيقة', AD_CAT_ORDER.map(k => adBar2(AD_CAT[k][2], AD_CAT[k][0], AD_CAT[k][1], cnt(r => r.cat === k), mx, 'cat|' + k)).join('')) +
    sec('Direction and impact', 'اتجاه الارتباط والأثر', '<div class="grid g2">' +
      ['Downstream', 'Upstream', 'Both', 'None'].map(k => adDrillBtn('rel|' + k, tile({v: cnt(r => r.relation === k), big: true, cls: k === 'None' ? '' : 'v-blue', l: [AD_REL[k][0], AD_REL[k][1]]}))).join('') +
      adDrillBtn('type|impact', tile({v: cnt(r => r.type || r.impact), big: true, cls: 'bad', l: ['تعذر التشغيل أو الاستفادة', 'Use or commissioning blocked']})) + '</div>') +
    `<div class="rrule">Source: linkage register (28 projects) with values from the Ad-Hoc deck where the project appears there. Values are a minimum, not a total.</div>`;
}
function paintAdhoc(card, key){
  card.querySelector('.rbody').innerHTML = key ? adDrillHtml(key) : adOverviewHtml();
  card.querySelectorAll('[data-drill]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); paintAdhoc(card, b.dataset.drill); card.scrollIntoView({block: 'start', behavior: 'smooth'}); }));
  card.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); paintAdhoc(card, null); card.scrollIntoView({block: 'start', behavior: 'smooth'}); }));
  card.querySelectorAll('.pochip').forEach(b => b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); handleQuery(b.dataset.po); }));
}
function addAdhocTab(startKey){
  const card = repCard('حالة تشغيل المشاريع', 'Operating Status', `<span dir="rtl">المشاريع المرتبطة بمشاريع أخرى · حسب آخر تحديث للارتباطات</span><br><small>Linked projects · linkage register, latest update</small>`);
  paintAdhoc(card, startKey || null); finishReport(card);
}
