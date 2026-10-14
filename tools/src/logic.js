/* =====================================================================
   Helpers
   ===================================================================== */
const $ = id => document.getElementById(id);
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(iso){ if(!iso) return '—'; const a=iso.split('-'); return `${a[2]} ${MONTHS[+a[1]-1]} ${a[0]}`; }
function fmtPct(v){ return v==null ? '—' : v+'%'; }
function fmtSigned(v){ return (v>0?'+':'')+v+'%'; }
function fmtMsg(t){ return esc(t).replace(/\*(.+?)\*/g,'<b>$1</b>').replace(/\n/g,'<br>'); }
function timeNow(){ return new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }

const ST = {
  susp:    {ar:'ايقاف كلي', en:'Fully Suspended',   dot:'🟣'},
  trouble: {ar:'متعثر',     en:'Troubled',          dot:'🔴'},
  delay:   {ar:'متأخر',     en:'Delayed',           dot:'🟠'},
  ontrack: {ar:'منتظم',     en:'On Schedule',       dot:'🔵'},
  ahead:   {ar:'متقدم',     en:'Ahead of Schedule', dot:'🟢'},
  handover:{ar:'استلام ابتدائي', en:'Initial Handover',     dot:'🟦'},
  terminated:{ar:'انهاء تعاقد',  en:'Contract Termination', dot:'🟤'},
  completed:{ar:'مكتمل التنفيذ', en:'Completed',     dot:'⚪'},
};
const ST_ORDER = ['susp','trouble','delay','ontrack','ahead','handover','terminated','completed'];

/* Field labels exactly as requested by the client (English / Arabic) */
const LBL = {
  po:         ['PO', 'أمر الشراء'],
  project:    ['Project', 'المشروع'],
  contractor: ['Contractor', 'المقاول'],
  consultant: ['Consultant', 'الإستشاري'],
  start:      ['Project Start Date', 'بداية المشروع التعاقدية'],
  end:        ['Completion Date', 'نهاية المشروع المعدلة PMO LIVE'],
  zero:       ['Zero Progress Projects (Month)', 'المشاريع المتوقفة عن العمل بالشهور'],
  planned:    ['Planned %', 'المخطط % التراكمي'],
  actual:     ['Performance %', 'المنفذ % التراكمي'],
  variance:   ['Variance', 'التباين'],
  elapsed:    ['Elapsed Time %', 'نسبة المدة المنقضية %'],
  plannedOct: ['Planned % till 31 Oct 2026', 'نسبة المخطط التراكمي حتى 31 أكتوبر 2026'],
  susp:       ['Suspension %', 'نسبة الإيقاف %'],
  expDelay:   ['Expected Delay', 'التاريخ المتوقع للتأخر - متوسط نسب انجاز'],
  expTroubled:['Expected Troubled', 'التاريخ المتوقع للتعثر- متوسط نسب انجاز'],
  mgmt:       ['Management Action / Treatment Plan', 'الإجراءات الإدارية للمشاريع'],
  upd:        ['Last Updated Details of Management Action', 'تفاصيل آخر تحديث للإجراءات الإدارية'],
  tech:       ['Current Technical Action', 'الإجراء الفني الحالي'],
  pfStatus:   ['Portfolio Updated Status', 'الموقف المحدث للمحفظة'],
  pfTotal:    ['Total Projects', 'عدد المشاريع'],
  pfDash:     ['Portfolio Dashboard', 'لوحة المحفظة'],
  pfBudget:   ['Portfolio Budget with Taxes', 'قيمة العقود المعدلة مع الضريبة'],
  pfPlanned:  ['Planned %', 'النسبة المخططة %'],
  pfActual:   ['Performance %', 'النسبة الفعلية %'],
  pfVariance: ['Variance %', 'التباين %'],
  pfInv:      ['Invoices', 'المستخلصات'],
  invApprNo:  ['No. of Approved Invoices', 'عدد المستخلصات المرفوعة'],
  invApprAmt: ['Approved Invoices Amount', 'قيمة المستخلصات المرفوعة'],
  invPaidNo:  ['No. of Paid Invoices', 'عدد المستخلصات المصروفة'],
  invPaidAmt: ['Paid Invoices Amount', 'قيمة المستخلصات المصروفة'],
};

/* =====================================================================
   Search: Arabic/English normalisation, filters, aliases, typo tolerance
   ===================================================================== */
function nrm(s){
  s = (s==null ? '' : String(s)).toLowerCase();
  s = s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  s = s.replace(/[\u064B-\u065F\u0670\u0640]/g, '');                       // diacritics + tatweel
  s = s.replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ؤ/g,'و').replace(/ئ/g,'ي');
  s = s.replace(/[“”"'`’‘()\[\]{}.,;:!?\/\\|،؛؟_+*=<>~^]/g, ' ');
  return s.replace(/\s+/g,' ').trim();
}
PROJECTS.forEach(p => { p._s = nrm([p.po, p.pno, p.name, p.contractor, p.consultant].join(' ')); });

const VOCAB = (() => {
  const m = new Set();
  PROJECTS.forEach(p => nrm([p.name, p.contractor, p.consultant].join(' ')).split(' ').forEach(w => { if(w.length>=3 && !/^\d+$/.test(w)) m.add(w); }));
  return [...m];
})();

function reEsc(x){ return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function trigRe(phrase, g){
  const ar = /[\u0600-\u06FF]/.test(phrase);
  const pre = ar ? '(?:وال|بال|لل|ال|و|ب|ل|ف|ك)?' : '';
  return new RegExp('(^|\\s)' + pre + reEsc(phrase) + '(?=\\s|$)', g ? 'g' : '');
}

/* trigger words -> filters (English + Arabic) */
const TRIG_DEF = [
  ['status','susp',    ['fully suspended','full suspension','totally suspended','ايقاف كلي','الايقاف الكلي','موقوف كليا']],
  ['status','trouble', ['troubled','trouble','troubles','distressed','in trouble','متعثر','متعثره','متعثرين','تعثر']],
  ['status','delay',   ['delayed','delay','delays','behind schedule','late','متاخر','متاخره','متاخرين','تاخر']],
  ['status','ontrack', ['on schedule','on track','on-track','regular','normal','منتظم','منتظمه']],
  ['status','ahead',   ['ahead of schedule','ahead','early','متقدم','متقدمه']],
  ['status','completed',['completed','finished','done','مكتمل','مكتمله']],
  ['status','handover',['initial handover','handover','handovers','handed over','استلام ابتدائي','الاستلام الابتدائي']],
  ['status','terminated',['contract termination','contract terminated','terminated','termination','انهاء تعاقد','انهاء التعاقد']],
  ['status','critical',['critical','priority','high risk','at risk','حرج','حرجه','اولويه']],
  ['flag','hopartial', ['partial initial handover','partial handover','partially handed over','استلام ابتدائي جزئي','الاستلام الابتدائي الجزئي']],
  ['flag','partial',   ['partially suspended','partial suspension','partial','ايقاف جزئي','جزئي']],
  ['flag','suspended', ['suspended','suspend','suspension','halted','paused','on hold','ايقاف','موقوف','موقوفه']],
  ['flag','zero',      ['zero progress','no progress','stalled','stall','stopped','not progressing','متوقف','متوقفه']],
  ['area','Madinah',   ['al madinah','madinah','medina','madina','al-madinah','المدينه المنوره','المدينه','المنوره']],
  ['area','Tabuk',     ['tabuk','tabouk','تبوك']],
  ['cls','WW',         ['ww','waste water']],
  ['cls','Coastal',    ['coastal','coast']],
  ['cls','Water 1',    ['water 1','water1']],
  ['cls','Water 2',    ['water 2','water2']],
];
const TRIGS = [];
TRIG_DEF.forEach(([kind,val,phrases]) => phrases.forEach(ph => { const n = nrm(ph); TRIGS.push({kind, val, n, re:trigRe(n,false), reg:trigRe(n,true)}); }));
TRIGS.sort((a,b) => b.n.length - a.n.length);

const STATUS_TEST = {
  susp:      p => p.sk==='susp',
  trouble:   p => p.sk==='trouble',
  delay:     p => p.sk==='delay',
  ontrack:   p => p.sk==='ontrack',
  ahead:     p => p.sk==='ahead',
  completed: p => p.sk==='completed',
  handover:  p => p.sk==='handover',
  terminated:p => p.sk==='terminated',
  critical:  p => p.sk==='susp' || p.sk==='trouble' || p.sk==='delay',
};
const FLAG_TEST = {
  partial:   p => p.susp>0 && p.sk!=='susp',
  suspended: p => p.sk==='susp' || p.susp>0,
  zero:      p => p.zero>0,
  hopartial: p => !!p.hoPartial,
};
const FLAG_NAME   = {partial:'partially suspended', suspended:'suspended', zero:'zero progress', hopartial:'partial initial handover'};
const STATUS_NAME = {susp:'Fully Suspended', trouble:'Troubled', delay:'Delayed', ontrack:'On Schedule', ahead:'Ahead of Schedule', completed:'Completed', handover:'Initial Handover', terminated:'Contract Termination', critical:'Critical (delayed, troubled, suspended)'};

/* English words/places -> the Arabic stem used in the project names */
const ALIAS_DEF = [
  ['yanbu','ينبع'],['yanbo','ينبع'],['yunbu','ينبع'],['yenbu','ينبع'],['badr','بدر'],['hanakiyah','الحناكية'],['hanakiya','الحناكية'],['hinakiya','الحناكية'],
  ['al mahd','المهد'],['almahd','المهد'],['mahd','المهد'],['al ais','العيص'],['al ees','العيص'],['ais','العيص'],['ees','العيص'],
  ['wadi al fara','الفرع'],['wadi alfara','الفرع'],['wadi fara','الفرع'],['fara','الفرع'],
  ['tayma','تيما'],['taima','تيما'],['tema','تيما'],['haql','حقل'],['hakl','حقل'],['duba','ضبا'],['dhuba','ضبا'],
  ['shuran','شوران'],['shouran','شوران'],['rannuna','رانون'],['ranuna','رانون'],['ranouna','رانون'],['rannona','رانون'],
  ['jurf','الجرف'],['al jurf','الجرف'],['asifrin','الاصيفرين'],['usayfirin','الاصيفرين'],
  ['muhamid','المحاميد'],['mahamid','المحاميد'],['suwaydirah','الصويدرة'],['sowaydira','الصويدرة'],
  ['uwaynah','العوينة'],['awayna','العوينة'],['aqool','العاقول'],['uqul','العاقول'],['aqul','العاقول'],
  ['barmawiyah','البرماوية'],['barmawia','البرماوية'],['rahmaniyah','الرحمانية'],['rahmaniya','الرحمانية'],
  ['rayes','الرايس'],['raees','الرايس'],['rais','الرايس'],['hamra al asad','حمرا'],['hamra','حمرا'],
  ['mutadil','المعتدل'],['moatadil','المعتدل'],['ammar','عمار'],['amar','عمار'],['durra','الدرة'],['al durra','الدرة'],
  ['fajr','فجر'],['qulaybah','القليبة'],['qaliba','القليبة'],
  ['airport','المطار'],['asbestos','الاسبستوس'],['sludge','الحماة'],['mosque','المسجد'],['nabawi','النبوي'],
  ['hospital','مستشفى'],['specialist hospital','مستشفى'],['border crossing','منفذ'],['border','منفذ'],['crossing','منفذ'],['housing','الاسكان'],
  ['sewer','الصرف'],['sewage','الصرف'],['sewerage','الصرف'],['wastewater','الصرف'],['sanitary','الصرف'],
  ['water','مياه'],['network','شبك'],['networks','شبك'],['tank','خزان'],['tanks','خزان'],['reservoir','خزان'],['reservoirs','خزان'],
  ['pumping','ضخ'],['pump','ضخ'],['treatment','معالجة'],['purification','تنقية'],['plant','محطة'],['station','محطة'],
  ['replacement','احلال'],['replace','احلال'],['renewal','احلال'],['rehabilitation','تاهيل'],['rehab','تاهيل'],
  ['phase','المرحلة'],['main line','الرئيسي'],['transmission','الرئيسي'],
  ['future','فيوتشر'],['dorsch','دورش'],
];
const ALIASES = ALIAS_DEF.map(([en,ar]) => ({key:nrm(en), ar:nrm(ar), re:trigRe(nrm(en), true)})).sort((a,b) => b.key.length - a.key.length);

const FILLERS = ['can you show me','could you show me','show me','give me','tell me about','find me','search for','look up','lookup',
  'what is the status of','what is','what are','status of','list all','pull up','get me','i want to know','i want','i need',
  'do you have','how many','please'].map(nrm).sort((a,b)=>b.length-a.length);
const STOP = new Set(['project','projects','in','at','for','of','the','near','with','a','an','me','show','status','all','are','is','that',
  'and','or','to','by','on','po','no','number','list','any','which','المشاريع','مشاريع','المشروع','مشروع','في','حاله','موقف','كم','عدد','ما','هي','هو'].map(nrm));

function levenshtein(a,b){
  const m=a.length, n=b.length;
  if(!m) return n; if(!n) return m;
  let prev = Array.from({length:n+1}, (_,j)=>j);
  for(let i=1;i<=m;i++){
    const cur=[i];
    for(let j=1;j<=n;j++){
      cur[j] = a[i-1]===b[j-1] ? prev[j-1] : 1+Math.min(prev[j-1], prev[j], cur[j-1]);
    }
    prev = cur;
  }
  return prev[n];
}
function fixToken(t){
  if(PROJECTS.some(p => p._s.includes(t))) return t;       // already valid somewhere in the dataset
  if(t.length < 3) return t;
  const thr = t.length<=4 ? 1 : t.length<=7 ? 2 : 3;
  let best=null, bd=1e9;
  VOCAB.forEach(w => { const d=levenshtein(t,w); if(d<bd){bd=d; best=w;} });
  ALIASES.forEach(a => { if(a.key.indexOf(' ')<0){ const d=levenshtein(t,a.key); if(d<bd){bd=d; best=a.ar;} } });
  return bd<=thr ? best : t;
}

function parseQuery(q){
  let s = ' ' + q + ' ';
  FILLERS.forEach(f => { s = s.split(' '+f+' ').join('  '); });
  const F = {status:new Set(), flag:new Set(), area:new Set(), cls:new Set()};
  TRIGS.forEach(t => { if(t.re.test(s)){ F[t.kind].add(t.val); s = s.replace(t.reg, ' '); } });
  ALIASES.forEach(a => { s = s.replace(a.re, '$1' + a.ar); });
  const tokens = s.split(' ').filter(w => w && !STOP.has(w) && /[\p{L}\p{N}]/u.test(w));
  return {F, tokens};
}

function describe(F, tokens){
  const parts = [];
  if(F.status.size) parts.push([...F.status].map(k=>STATUS_NAME[k]).join(' / '));
  if(F.flag.size)   parts.push([...F.flag].map(k=>FLAG_NAME[k]).join(' + '));
  if(F.area.size)   parts.push('in ' + [...F.area].join(' / '));
  if(F.cls.size)    parts.push('class ' + [...F.cls].join(' / '));
  if(tokens.length) parts.push('matching “' + tokens.join(' ') + '”');
  return parts.join(' · ');
}

const PF_CORE = new Set(['portfolio','dashboard','summary','overview','overall','kpi','kpis','stats','statistics','invoice','invoices','budget','total','distribution','chart','charts','المحفظه','لوحه','ملخص','المستخلصات','الميزانيه'].map(nrm));
const PF_EXTRA = new Set(['update','updates','updated','latest','current','weekly','control','report','the','of'].map(nrm));
function isPortfolioQuery(q){
  const toks = q.split(' ').filter(w => w && !STOP.has(w));
  return toks.length > 0 && toks.every(w => PF_CORE.has(w) || PF_EXTRA.has(w)) && toks.some(w => PF_CORE.has(w));
}
/* "Portfolio Madinah" / "Portfolio Yanbu" / "Tabuk dashboard": the same dashboard for one area or city */
const SCOPE_PHRASES = {
  madinah: ['al madinah','madinah','medina','madina','al-madinah','المدينه المنوره','المدينه','المنوره'],
  tabuk:   ['tabuk','tabouk','تبوك'],
};
const SCOPE_RES = Object.entries(SCOPE_PHRASES).flatMap(([key, ph]) => ph.map(p => { const n = nrm(p); return {key, n, re:trigRe(n,false), reg:trigRe(n,true)}; })).sort((a,b) => b.n.length - a.n.length);
function portfolioScope(q){
  let s = ' ' + q + ' ', found = null;
  SCOPE_RES.forEach(t => { if(t.re.test(s)){ found = found || t.key; s = s.replace(t.reg, ' '); } });
  return found && isPortfolioQuery(s.replace(/\s+/g, ' ').trim()) ? found : null;       // the rest of the sentence must be a portfolio request
}


/* =====================================================================
   Typing mistakes and "Do you mean"
   - every word the person types is checked against everything the bot knows (instructions, areas, statuses,
     place names, project / contractor words, PO numbers);
   - a mistake with ONE obvious repair is repaired and the answer says so;
   - a mistake with SEVERAL possible repairs is never guessed: the bot asks "Do you mean ...?" and waits for a tap.
   ===================================================================== */
function dlev(a, b){                                   // number of mistakes between two words; swapping two neighbouring letters counts as ONE
  const m = a.length, n = b.length; if(!m) return n; if(!n) return m;
  const d = []; for(let i = 0; i <= m; i++){ d.push(new Array(n+1).fill(0)); d[i][0] = i; } for(let j = 0; j <= n; j++) d[0][j] = j;
  for(let i = 1; i <= m; i++) for(let j = 1; j <= n; j++){
    d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    if(i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) d[i][j] = Math.min(d[i][j], d[i-2][j-2] + 1);
  }
  return d[m][n];
}

FILLERS.forEach(f => f.split(' ').forEach(w => STOP.add(w)));      // "how", "tell", "pull" ... never count as a search word
const LEX = new Map();                                 // known word -> meaning group (words with the same meaning share a group)
(function(){
  const add = (w, g) => { w = nrm(w); if(w && w.indexOf(' ') < 0 && !LEX.has(w)) LEX.set(w, g); };
  TRIG_DEF.forEach(([kind, val, ph]) => ph.forEach(p => { if(nrm(p).indexOf(' ') < 0) add(p, kind + ':' + val); }));        // single-word instructions first
  TRIG_DEF.forEach(([kind, val, ph]) => ph.forEach(p => nrm(p).split(' ').forEach(w => add(w, 'w:' + w))));                // words that only exist inside a longer instruction
  Object.entries(SCOPE_PHRASES).forEach(([k, ph]) => ph.forEach(p => nrm(p).split(' ').forEach(w => add(w, 'scope:' + k))));
  [...PF_CORE, ...PF_EXTRA].forEach(w => add(w, 'pf:' + w));
  ['help','menu','مساعده','عون','hi','hello','hey','salam','salaam','مرحبا','اهلا','سلام'].forEach(w => add(w, 'help'));
  ['red','amber','green'].forEach(w => add(w, 'rag:' + w));
  ['المتوقع','متوقع','المتوقعه','متوقعه','تعثرها','تاخرها','استلام','الاستلام','تسليم','التسليم','ابتدايي','الابتدايي','جزيي','الجزيي','مراجعه','المراجعه','بوابات','بوابه','البوابات','المراحل','مراحل','المرحله','تحديث','التحديث','بيانات','البيانات','رفع','الملفات','ملفات','الملف','الاختبار','اختبار','التشغيل','تشغيل','التجريبي','تجريبي'].forEach(w => add(w, 'rep:' + w));
  ['sgr','gate','gates','stage','review','soon','upcoming','expected','commissioning','testing','tnc','upload','revision','refresh','dropbox','folder','yellow','overdue','blinking','predicted','coming','going','sync','submit'].forEach(w => add(w, 'rep:' + w));
  ALIAS_DEF.forEach(([en, ar]) => nrm(en).split(' ').forEach(w => add(w, 'alias:' + nrm(ar))));
  FILLERS.forEach(f => f.split(' ').forEach(w => add(w, 'stop:' + w)));
  STOP.forEach(w => add(w, 'stop:' + w));
})();
const AR_P = ['وال','بال','لل','ال','و','ب','ل','ف','ك'];
const wordForms = w => {                                // a project word as written ("والعاقول") and as a person types it ("العاقول", "عاقول")
  const out = new Set([w]); let frontier = [w];
  for(let k = 0; k < 2; k++){ const nxt = []; frontier.forEach(x => AR_P.forEach(p => { if(x.startsWith(p) && x.length - p.length >= 4){ const r = x.slice(p.length); if(!out.has(r)){ out.add(r); nxt.push(r); } } })); frontier = nxt; }
  return [...out];
};
const POOL = (() => { const m = new Map(); LEX.forEach((g, w) => m.set(w, {g, src:'lex'})); VOCAB.forEach(w => wordForms(w).forEach(x => { if(!m.has(x)) m.set(x, {g:'v:' + x, src:'vocab'}); })); return [...m].filter(([w]) => w.length >= 3); })();

const AR_PRE = /^(وال|بال|لل|ال|و|ب|ل|ف|ك)/;
function arStem(t){ const m = t.match(AR_PRE); return m && t.length - m[1].length >= 3 ? [m[1], t.slice(m[1].length)] : null; }
function isValid(t){                                    // a word the bot already understands (so it is left alone)
  if(t.length <= 2 || LEX.has(t) || STOP.has(t)) return true;
  if(/\d/.test(t)) return t.length < 5 || PROJECTS.some(p => p._s.includes(t));
  if(PROJECTS.some(p => p._s.includes(t))) return true;
  const st = /[\u0600-\u06FF]/.test(t) ? arStem(t) : null;
  return !!(st && (LEX.has(st[1]) || PROJECTS.some(p => p._s.includes(st[1]))));
}
const maxMistakes = n => n <= 2 ? 0 : n <= 5 ? 1 : n <= 8 ? 2 : 3;
function candidates(t){                                 // words the person may have meant, best first (one entry per meaning)
  const n = t.length, md = maxMistakes(n); if(!md) return [];
  const best = new Map();
  for(const [w, info] of POOL){
    const pre = n >= (info.src === 'lex' && !info.g.startsWith('alias:') ? 3 : 5) && w.length > n && w.startsWith(t) && w.length - n <= 6;      // only the beginning of a word was typed
    if(!pre && Math.abs(w.length - n) > md) continue;
    let d = dlev(t, w); if(pre) d = Math.min(d, 0.5);
    if(d > md) continue;
    const score = d + (t[0] !== w[0] ? 0.35 : 0);                                    // mistakes rarely change the first letter
    const cur = best.get(info.g);
    if(!cur || score < cur.score) best.set(info.g, {word:w, g:info.g, score, d, src:info.src});
  }
  return [...best.values()].sort((a, b) => a.score - b.score);
}
function resolveToken(t){
  let pre = '', core = t, c = candidates(core);
  if(!c.length && /[\u0600-\u06FF]/.test(t)){ const st = arStem(t); if(st){ pre = st[0]; core = st[1]; c = candidates(core); } }
  if(!c.length) return {kind:'none'};
  const real = c.filter(x => !x.g.startsWith('stop:'));
  if(c[0].g.startsWith('stop:') && (!real.length || real[0].score - c[0].score >= 0.9)) return {kind:'fix', to: pre + c[0].word};   // clearly a mistyped filler word ("shwo", "projcts"): repaired
  c = real;
  const lead = c.filter(x => x.score - c[0].score < 0.9);                           // alternatives that are about as likely as the best one
  if(lead.length === 1 && lead[0].src === 'vocab' && lead[0].d >= 2) return {kind:'ask', one:true, cands:[{...lead[0], word: pre + lead[0].word}]};   // two corrections to a project word: confirm, do not guess
  if(lead.length === 1) return {kind:'fix', to: pre + lead[0].word};
  return {kind:'ask', cands: lead.slice(0, 4).map(x => ({...x, word: pre + x.word}))};
}
function codeCandidates(t){                             // a mistyped PO / project number: one wrong, missing or extra digit, or two swapped
  if(t.length < 5) return [];
  const out = [];
  PROJECTS.forEach(p => [p.po, nrm(p.pno).replace(/\s+/g, '')].forEach(code => {
    if(code.length >= 5 && Math.abs(code.length - t.length) <= 1 && dlev(t, code) <= 1 && !out.includes(code)) out.push(code);
  }));
  return out;
}
function autocorrect(q){
  const toks = q.split(' ').filter(Boolean), out = [], fixes = []; let ask = null;
  toks.forEach(t => {
    if(isValid(t)){ out.push(t); return; }
    if(/\d/.test(t)){
      const r = codeCandidates(t);
      if(r.length === 1){ out.push(r[0]); fixes.push({from:t, to:r[0]}); return; }
      if(r.length > 1 && !ask) ask = {index: out.length, token: t, cands: r.slice(0, 4).map(w => ({word:w}))};
      out.push(t); return;
    }
    const r = resolveToken(t);
    if(r.kind === 'fix'){ out.push(r.to); fixes.push({from:t, to:r.to}); }
    else if(r.kind === 'ask' && !ask){ ask = {index: out.length, token: t, cands: r.cands, one: !!r.one}; out.push(t); }
    else out.push(t);
  });
  return {tokens: out, fixes, ask};
}

/* words that only make sense inside a longer instruction: "schedule" -> On schedule / Ahead of schedule / Behind schedule */
const PHRASE_OF = new Map();
(function(){
  TRIG_DEF.forEach(([kind, val, ph]) => ph.forEach(p => {
    const n = nrm(p), ws = n.split(' '); if(ws.length < 2 || !/[a-z]/.test(n)) return;
    ws.forEach(w => {
      if(w.length < 3 || STOP.has(w) || (LEX.get(w) && !LEX.get(w).startsWith('w:'))) return;
      const arr = PHRASE_OF.get(w) || []; if(!arr.some(x => x.g === kind + ':' + val)) arr.push({phrase:n, g:kind + ':' + val}); PHRASE_OF.set(w, arr);
    });
  }));
})();
const niceLabel = l => cap(String(l || '').replace(/^in /, ''));
const shortName = n => n.length > 46 ? n.slice(0, 44) + '…' : n;
function optionText(r, q){
  if(r.type === 'list'){
    const lab = /^matching/.test(r.label || '') && q ? `Projects matching “${q}”` : niceLabel(r.label);
    return `${lab} — ${r.list.length} projects`;
  }
  if(r.type === 'one')       return `PO ${r.project.po} · ${shortName(r.project.name)}`;
  if(r.type === 'portfolio') return r.scope ? `${PORTFOLIOS[r.scope].en} portfolio dashboard` : 'Portfolio dashboard (all projects)';
  if(r.type === 'help')      return 'Help';
  if(r.type === 'report')    return REPORT_LABEL[r.view];
  return null;
}
const optionSig = r => r.type + ':' + (r.list ? r.list.map(p => p.po).join(',') : r.project ? r.project.po : r.scope || r.view || '');
function hintOptions(q2){                               // the instructions the person probably started to type
  const toks = q2.split(' ').filter(w => w.length >= 3 && !STOP.has(w)), cand = [];
  toks.forEach(t => (PHRASE_OF.get(t) || []).forEach(x => cand.push(x.phrase)));
  if(toks.some(t => PF_CORE.has(t))){
    const rest = toks.filter(t => !PF_CORE.has(t) && !PF_EXTRA.has(t)).join(' ');
    if(rest) cand.push(rest);
    cand.push('portfolio', 'portfolio madinah', 'portfolio tabuk');
  }
  const opts = [], seen = new Set();
  cand.forEach(c => { const r = searchExact(c), txt = optionText(r, c); if(!txt) return; const sig = optionSig(r); if(seen.has(sig)) return; seen.add(sig); opts.push({query:c, label:txt, r}); });
  return opts;
}
function askConfirm(raw, ac){
  const opts = [], seen = new Set();
  ac.ask.cands.forEach(c => {
    const toks = ac.tokens.slice(); toks[ac.ask.index] = c.word; const q2 = toks.join(' ');
    let r = searchExact(q2), qq = q2;
    if(r.type === 'none' && !r.hasFilter){ const h = hintOptions(q2); if(h.length === 1){ r = h[0].r; qq = h[0].query; } }
    const txt = optionText(r, qq); if(!txt) return;
    const sig = optionSig(r); if(seen.has(sig)) return; seen.add(sig);
    opts.push({query:qq, label:txt, r});
  });
  if(opts.length === 0) return searchExact(ac.tokens.join(' '));
  if(opts.length === 1 && !ac.ask.one) return {...opts[0].r, corrected:{from:raw, to:opts[0].query}};
  return {type:'confirm', raw, options:opts};
}
function search(qRaw){
  const raw = String(qRaw || '').trim(), q = nrm(raw);
  if(!q) return {type:'none'};
  const ac = autocorrect(q);
  if(ac.ask) return askConfirm(raw, ac);
  const q2 = ac.fixes.length ? ac.tokens.join(' ') : q;
  let r = searchExact(q2), hinted = null;
  if(r.type === 'none' && !r.hasFilter){
    const opts = hintOptions(q2);
    if(opts.length === 1){ r = opts[0].r; hinted = opts[0].query; }
    else if(opts.length > 1) return {type:'confirm', raw, options:opts.slice(0, 4)};
  }
  if((r.type !== 'none' || r.hasFilter) && (ac.fixes.length || hinted)) r = {...r, corrected:{from:raw, to:hinted || q2}};
  return r;
}

function searchExact(qRaw){
  const raw = String(qRaw||'').trim();
  const q = nrm(raw);
  if(!q) return {type:'none'};
  if(/^(help|مساعده|عون)$/.test(q) || raw === '?' || raw === '؟') return {type:'help'};
  if(/^(hi|hello|hey|salam|salaam|مرحبا|اهلا|السلام عليكم|سلام)$/.test(q)) return {type:'help', greeting:true};
  if(/^(red|amber|green)( projects?)?$/.test(q)) return {type:'raghint'};
  const pfScope = portfolioScope(q); if(pfScope) return {type:'portfolio', scope:pfScope};
  if(isPortfolioQuery(q)) return {type:'portfolio'};
  const rr = routeReport(q); if(rr) return rr;

  // 1) exact PO or project number
  const compact = q.replace(/\s+/g,'');
  let hit = PROJECTS.find(p => p.po === compact || nrm(p.pno).replace(/\s+/g,'') === compact);
  if(!hit){ const m = q.match(/(?:^|\s)(\d{9})(?=\s|$)/); if(m) hit = PROJECTS.find(p => p.po === m[1]); }
  if(hit) return {type:'one', project:hit, how:'po'};

  // 2) filters + free-text tokens
  const {F, tokens: tk0} = parseQuery(q);
  let tokens = tk0.slice();
  let list = PROJECTS.slice();
  if(F.status.size) list = list.filter(p => [...F.status].some(k => STATUS_TEST[k](p)));
  if(F.area.size)   list = list.filter(p => F.area.has(p.areaEn));
  if(F.cls.size)    list = list.filter(p => F.cls.has(p.cls));
  if(F.flag.size)   list = list.filter(p => [...F.flag].every(k => FLAG_TEST[k](p)));
  const hasFilter = F.status.size || F.flag.size || F.area.size || F.cls.size;

  let fuzzy = false;
  if(tokens.length){
    let r = list.filter(p => tokens.every(t => p._s.includes(t)));
    if(!r.length){
      const fixed = tokens.map(fixToken);
      if(fixed.some((x,i) => x !== tokens[i])){
        tokens = fixed; fuzzy = true;
        r = list.filter(p => tokens.every(t => p._s.includes(t)));
      }
    }
    list = r;
  }
  if(!hasFilter && !tokens.length) return {type:'none'};

  const label = describe(F, tokens);
  if(F.flag.has('zero')) list.sort((a,b) => (b.zero-a.zero) || (a.ord-b.ord)); else list.sort((a,b) => a.ord-b.ord);
  if(list.length === 1) return {type:'one', project:list[0], how: fuzzy ? 'fuzzy' : 'filter', label};
  if(list.length === 0) return {type:'none', label, hasFilter:!!hasFilter};
  return {type:'list', list, label, fuzzy};
}

/* =====================================================================
   Rendering
   ===================================================================== */
function scrollBottom(){ const t=$('thread'); t.scrollTop = t.scrollHeight; }
function scrollToTop(el){ const t=$('thread'); t.scrollTop = Math.max(0, el.offsetTop - 8); }

/* the character shows a pose that fits what the bot is doing / answering (poses come from the designer's board) */
let curPose = 'welcome', poseTimer = null;
const GOOD_NEWS = new Set(['ahead', 'ontrack', 'handover']);
function poseFor(r){
  switch(r.type){
    case 'help': return 'welcome';
    case 'confirm': case 'none': case 'raghint': return 'guiding';            // "Here's the recommended approach"
    case 'report': case 'portfolio': return 'planning';                        // dashboards and the planning / control screens
    case 'one': return GOOD_NEWS.has(r.project.sk) ? 'success' : 'analyzing';
    case 'list': return r.list.length && r.list.every(p => GOOD_NEWS.has(p.sk)) ? 'success' : 'analyzing';
  }
  return 'welcome';
}
function setHeaderPose(p){                                                  // the header character crossfades to the new pose and gives a small pop
  const slot = $('headerAvatarSlot'), frame = slot && slot.querySelector('.avf');
  if(!frame || frame.dataset.pose === p) return;
  const mv = frame.querySelector('.avmove'), img = document.createElement('img');
  img.className = 'avimg fade'; img.src = AVATAR_POSES[p]; img.dataset.pose = p; img.alt = ''; img.draggable = false; mv.appendChild(img);
  requestAnimationFrame(() => requestAnimationFrame(() => img.classList.add('in')));
  setTimeout(() => { const all = [...mv.querySelectorAll('.avimg')]; all.slice(0, -1).forEach(i => i.remove()); }, 450);     // keep only the newest picture
  frame.dataset.pose = p; slot.dataset.pose = p;
  frame.classList.remove('pop'); void frame.offsetWidth; frame.classList.add('pop');
}
function settleHeaderPose(){                                                  // after a few seconds the header goes back to the friendly Welcome pose
  clearTimeout(poseTimer); poseTimer = setTimeout(() => { if(!isListening) setHeaderPose('welcome'); }, 6000);
}
function botRow(inner, wide, pose){
  const row = document.createElement('div');
  row.className = 'msgrow' + (wide ? ' wide' : '');
  document.querySelectorAll('.msgavatar.live').forEach(e => e.classList.remove('live'));          // only the newest reply's character keeps moving
  row.innerHTML = `<span class="msgavatar live">${avatarHtml(pose || curPose)}</span>`;
  row.appendChild(inner);
  $('thread').appendChild(row);
  return row;
}

function addText(text, who){
  const bubble = document.createElement('div');
  bubble.className = 'msg ' + who;
  bubble.innerHTML = (who==='in' ? fmtMsg(text) : esc(text)) + `<span class="time">${timeNow()}</span>`;
  if(who==='in') botRow(bubble); else $('thread').appendChild(bubble);
  scrollBottom();
}

function showTyping(){
  const el = document.createElement('div');
  el.className = 'typing'; el.setAttribute('aria-label','PMO Bot is typing');
  el.innerHTML = '<span></span><span></span><span></span>';
  const row = botRow(el, false, 'analyzing'); row.id = 'typingIndicator';
  clearTimeout(poseTimer); setHeaderPose('analyzing');
  scrollBottom();
}
function hideTyping(){ const e=$('typingIndicator'); if(e) e.remove(); }

function circlesHtml(list){                              // coloured circles = how many projects of this list are in each status; tap one to see only those
  const c = {}; list.forEach(p => c[p.sk] = (c[p.sk] || 0) + 1);
  const ks = ST_ORDER.filter(k => c[k]); if(ks.length < 2) return '';
  return '<div class="sdots" role="group" aria-label="Filter this list by status">' +
    ks.map(k => `<button class="sdot sd-${k}" data-sk="${k}" aria-label="${ST[k].en}: ${c[k]} projects. Tap to list only these"><span class="sdc">${c[k]}</span><span class="sdl">${ST[k].en}</span></button>`).join('') +
    '</div><div class="sdhint">Tap a coloured circle to see only that status — or pick a project below.</div>';
}
function addOptions(list, intro, o){
  o = o || {};
  const bubble = document.createElement('div');
  bubble.className = 'msg in';
  let html = fmtMsg(intro) + circlesHtml(list) + '<div class="optlist">';
  list.forEach(p => {                                   // the FULL list: every project, no cut-off
    html += `<button class="optbtn" data-po="${p.po}"><span class="on">${esc(p.name)}</span>` +
            `<span class="oi"><span>${ST[p.sk].dot}</span><span>${esc(p.status)}</span><span>·</span><b>PO ${p.po}</b>` +
            (p.zero>0 ? `<span>· ${p.zero} mo zero progress</span>` : '') + `</span></button>`;
  });
  html += `</div><span class="time">${timeNow()}</span>`;
  bubble.innerHTML = html;
  const row = botRow(bubble);
  bubble.querySelectorAll('.optbtn').forEach(b => b.addEventListener('click', () => handleQuery(b.dataset.po)));
  bubble.querySelectorAll('.sdot').forEach(b => b.addEventListener('click', () => listSubset(list, b.dataset.sk, o.label || 'this list')));
  scrollToTop(row);                                     // show the top of a long list (its heading and circles), not the end
}
function listSubset(list, sk, parentLabel){
  const lab = /^in /.test(parentLabel) ? `${ST[sk].en} ${parentLabel}` : `${ST[sk].en} · ${parentLabel}`;
  handleQuery(lab, lab, () => {
    const sub = list.filter(p => p.sk === sk);
    return sub.length === 1 ? {type:'one', project:sub[0], how:'filter', label:lab} : {type:'list', list:sub, label:lab};
  });
}
function addConfirm(r){                                  // "Do you mean ...?" - asks, and waits for a tap
  const bubble = document.createElement('div');
  bubble.className = 'msg in';
  let html = fmtMsg(`🤔 I'm not sure what you meant by “${r.raw}”.\n*Do you mean:*`) + '<div class="optlist dym">';
  r.options.forEach((o, i) => { html += `<button class="optbtn dymbtn" data-i="${i}"><span class="on">${esc(o.label)}</span></button>`; });
  html += '<button class="optbtn dymbtn dymno" data-i="-1"><span class="on">None of these</span></button></div>' +
          `<div class="dymnote">Please confirm your search by tapping one — I won’t guess.</div><span class="time">${timeNow()}</span>`;
  bubble.innerHTML = html;
  botRow(bubble);
  bubble.querySelectorAll('.dymbtn').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i;
    if(i >= 0) handleQuery(r.options[i].query, r.options[i].label);
    else { addText('None of these', 'out'); setTimeout(() => addText("No problem — please retype your search, or tap *Help* for examples.", 'in'), 350); }
  }));
  scrollBottom();
}

function tile(o){
  const bar = o.bar==null ? '' : `<div class="bar"><i style="width:${Math.max(0,Math.min(100,o.bar))}%;${o.bc ? '--bc:'+o.bc+';' : ''}"></i></div>`;
  return `<div class="tile"><div class="tv ${o.cls||''} ${o.ar?'ar':''} ${o.big?'big':''}">${o.v}</div><div class="tl">${o.l[0]}</div><div class="ta">${o.l[1]}</div>${bar}</div>`;
}
function forecastCell(f){
  if(f.d) return {v: fmtDate(f.d), cls:'', ar:false};
  const t = f.t || '—';
  if(t.indexOf('غير متوقع') >= 0) return {v: esc(t), cls:'good', ar:true};
  if(t.indexOf('متعثر') >= 0)     return {v: esc(t), cls:'bad',  ar:true};
  return {v: esc(t), cls:'warn', ar:true};
}
function section(l, items){
  const none = items.length===1 && /^لا (يوجد|توجد)/.test(items[0]);
  let body;
  if(!items.length)            body = '<p class="none">—</p>';
  else if(items.length===1)    body = `<p class="${none?'none':''}">${esc(items[0])}</p>`;
  else body = '<ol>' + items.map((x,i) => `<li><span class="n">${i+1}</span><span>${esc(x)}</span></li>`).join('') + '</ol>';
  return `<div class="sec"><div class="sh"><b>${l[0]}</b><small>${l[1]}</small></div>` +
         `<div class="sb"><div class="clamp">${body}</div><button class="more" aria-expanded="false">Show more ▾</button></div></div>`;
}

const UPD_VISIBLE = 3;      // latest updates shown by default; older ones sit behind a toggle
function updSection(items){
  const l = LBL.upd;
  const chip = x => x.d ? `<span class="dchip">${fmtDate(x.d)}</span>` : '';
  const li = (x,i) => `<li><span class="n">${i+1}</span><span class="ut">${chip(x)}${esc(x.t)}</span></li>`;
  let body, note = '';
  if(!items.length){
    body = '<p class="none">—</p>';
  } else if(items.length === 1){
    const none = /^لا (يوجد|توجد)/.test(items[0].t);
    body = `<p class="${none?'none':''}">${chip(items[0])}${esc(items[0].t)}</p>`;
  } else {
    const vis = items.slice(0, UPD_VISIBLE), old = items.slice(UPD_VISIBLE);
    body = '<ol>' + vis.map(li).join('') + '</ol>';
    if(old.length){
      body += `<div class="older" hidden><ol>${old.map((x,i) => li(x, i+UPD_VISIBLE)).join('')}</ol></div>` +
              `<button class="olderbtn" data-n="${old.length}" aria-expanded="false">Show ${old.length} earlier update${old.length>1?'s':''} ▾</button>`;
    }
    note = `Newest first${old.length ? ` · latest ${UPD_VISIBLE} of ${items.length}` : ''}`;
  }
  return `<div class="sec"><div class="sh"><b>${l[0]}</b><small>${l[1]}</small></div>${note ? `<div class="subnote">${note}</div>` : ''}<div class="sb">${body}</div></div>`;
}

function cardHtml(p){
  const s = ST[p.sk];
  const zc = p.zero>=3 ? 'bad' : p.zero>=1 ? 'warn' : '';
  const vc = p.variance<0 ? 'neg' : p.variance>0 ? 'pos' : 'mute';
  const ed = forecastCell(p.expDelay), et = forecastCell(p.expTroubled);
  const tiles = [
    tile({v:p.zero, cls:zc, l:LBL.zero}),
    tile({v:fmtPct(p.planned), l:LBL.planned, bar:p.planned, bc:'#7FA7D9'}),
    tile({v:fmtPct(p.actual), l:LBL.actual, bar:p.actual}),
    tile({v:fmtSigned(p.variance), cls:vc, l:LBL.variance}),
    tile({v:fmtPct(p.elapsed), cls:p.elapsed>100?'bad':'', l:LBL.elapsed, bar:p.elapsed, bc:p.elapsed>100?'#FF5C5C':'#8696A0'}),
    tile({v:fmtPct(p.plannedOct), l:LBL.plannedOct, bar:p.plannedOct, bc:'#7FA7D9'}),
    tile({v:fmtPct(p.susp), cls:p.susp>0?'warn':'', l:LBL.susp, bar:p.susp, bc:'#FFB020'}),
    tile({v:ed.v, cls:ed.cls, ar:ed.ar, l:LBL.expDelay}),
    tile({v:et.v, cls:et.cls, ar:et.ar, l:LBL.expTroubled}),
  ].join('');
  return `<div class="strip"></div>
    <div class="chead">
      <span class="schip"><span class="dotc"></span>${esc(p.status)} · ${s.en}</span>
      <span class="po">${LBL.po[0]} · ${LBL.po[1]}<b>${p.po}</b><small>Project no. ${esc(p.pno)}</small></span>
    </div>
    <div class="meta"><span>${LBL.project[0]} · ${LBL.project[1]}</span></div>
    <div class="name-ar">${esc(p.name)}</div>
    <div class="meta"><span>📍 ${esc(p.area)} · ${p.areaEn}</span><span class="sep">|</span><span>${esc(p.cls)}</span></div>
    <div class="prow"><span class="l">👷 ${LBL.contractor[0]}<small>${LBL.contractor[1]}</small></span><span class="v">${esc(p.contractor)||'—'}</span></div>
    <div class="prow"><span class="l">🧭 ${LBL.consultant[0]}<small>${LBL.consultant[1]}</small></span><span class="v">${esc(p.consultant)||'—'}</span></div>
    ${sgrBlock(p)}
    <div class="dates">
      <div class="dtile"><div class="dv">${fmtDate(p.start)}</div><div class="dl">${LBL.start[0]}</div><div class="da">${LBL.start[1]}</div></div>
      <div class="dtile"><div class="dv">${fmtDate(p.end)}</div><div class="dl">${LBL.end[0]}</div><div class="da">${LBL.end[1]}</div></div>
    </div>
    <div class="grid">${tiles}</div>
    ${section(LBL.mgmt, p.mgmt)}${updSection(p.upd)}${section(LBL.tech, p.tech)}`;
}

function addCard(p){
  const card = document.createElement('div');
  card.className = 'card st-' + p.sk;
  card.innerHTML = cardHtml(p);
  const row = botRow(card, true);
  card.querySelectorAll('.clamp').forEach(el => { if(el.scrollHeight > el.clientHeight + 3) el.classList.add('has-more'); });
  card.querySelectorAll('.more').forEach(btn => btn.addEventListener('click', () => {
    const open = btn.previousElementSibling.classList.toggle('open');
    btn.textContent = open ? 'Show less ▴' : 'Show more ▾';
    btn.setAttribute('aria-expanded', open);
  }));
  card.querySelectorAll('.olderbtn').forEach(btn => btn.addEventListener('click', () => {
    const box = btn.previousElementSibling, open = box.hidden;       // hidden -> opening
    box.hidden = !open;
    btn.textContent = open ? 'Hide earlier updates ▴' : `Show ${btn.dataset.n} earlier update${btn.dataset.n>1?'s':''} ▾`;
    btn.setAttribute('aria-expanded', open);
  }));
  scrollToTop(row);
}

/* ---------- portfolio dashboard ---------- */
const nf = v => v.toLocaleString('en-US', {maximumFractionDigits:1});
const PF_BARS = [
  ['ahead',   'Ahead of Schedule', 'متقدم',         'ahead of schedule'],
  ['ontrack', 'On Schedule',       'منتظم',         'on schedule'],
  ['delay',   'Delayed',           'متأخر',         'delayed'],
  ['trouble', 'Troubled',          'متعثر',         'troubled'],
  ['susp',    'Fully Suspended',   'ايقاف كلي',     'fully suspended'],
  ['handover','Initial Handover',  'استلام ابتدائي','initial handover', true],
  ['terminated','Contract Termination','انهاء تعاقد','terminated', true],
  ['completed','Completed',        'مكتمل التنفيذ', 'completed', false, true],
];
function portfolioHtml(scope){
  const S = scope ? PORTFOLIOS[scope] : null, P = S || PORTFOLIO, BARS = PF_BARS.filter(b => !b[5] || (P.status[b[0]] || 0) > 0), max = Math.max(1, ...BARS.map(b => P.status[b[0]] || 0));
  const bars = BARS.map(([k,en,ar,q,direct]) => {
    const n = P.status[k] || 0, w = n ? Math.max(4, Math.round(n/max*100)) : 0;
    const target = S ? `data-scope="${scope}" data-sk="${k}"` : direct ? `data-direct="1" data-sk="${k}"` : `data-q="${q}"`;
    return `<button class="brow c-${k}" ${target} ${n ? '' : 'disabled'} aria-label="${en}${S ? ' in ' + S.en : ''}: ${n} projects">` +
           `<div class="btop"><span class="bl"><b>${en}</b><small>${ar}</small></span><span class="bn"><b>${n}</b></span></div>` +
           `<div class="btrack"><i style="width:${w}%"></i></div></button>`;
  }).join('');
  const vc = P.variance < 0 ? 'neg' : P.variance > 0 ? 'pos' : 'mute';
  const kpis = [
    tile({v:`${nf(P.budgetM)}<span class="u">M SAR</span>`, big:true, l:LBL.pfBudget}),
    tile({v:fmtPct(P.planned), big:true, l:LBL.pfPlanned, bar:P.planned, bc:'#7FA7D9'}),
    tile({v:fmtPct(P.actual),  big:true, l:LBL.pfActual,  bar:P.actual,  bc:'#2ED39B'}),
    tile({v:fmtSigned(P.variance), big:true, cls:vc, l:LBL.pfVariance}),
  ].join('');
  const inv = [
    tile({v:nf(P.approvedCount), big:true, cls:'v-blue', l:LBL.invApprNo}),
    tile({v:`${nf(P.approvedM)}<span class="u">M SAR</span>`, big:true, cls:'v-blue', l:LBL.invApprAmt}),
    tile({v:nf(P.paidCount), big:true, cls:'good', l:LBL.invPaidNo}),
    tile({v:`${nf(P.paidM)}<span class="u">M SAR</span>`, big:true, cls:'good', l:LBL.invPaidAmt}),
  ].join('');
  return `<div class="strip"></div>
    <div class="pfhead"><div class="t"><b>${LBL.pfStatus[0]}</b><small>${LBL.pfStatus[1]}</small></div>
      ${S ? `<div class="scope">📍 <b>${S.en}</b><small>${S.ar}</small></div>` : ''}
      <div class="d">Weekly control · data through ${REPORT_DATE}</div></div>
    <div class="totalbox"><span class="tn">${P.total}</span><span class="tt"><b>${LBL.pfTotal[0]}</b><small>${LBL.pfTotal[1]}</small></span></div>
    ${bars}
    <div class="bhint">Tap a bar to list those projects.</div>
    <div class="pfsec"><div class="sh"><b>${LBL.pfDash[0]}</b><small>${LBL.pfDash[1]}</small></div><div class="grid g2">${kpis}</div></div>
    <div class="pfsec"><div class="sh"><b>${LBL.pfInv[0]}</b><small>${LBL.pfInv[1]}</small></div><div class="grid g2">${inv}</div></div>`;
}
function addPortfolio(scroll, scope){
  const card = document.createElement('div');
  card.className = 'card pf' + (scope ? ' pf-scope' : '');
  card.dataset.scope = scope || 'all';
  card.innerHTML = portfolioHtml(scope);
  const row = botRow(card, true, 'planning');
  card.querySelectorAll('.brow:not(:disabled)').forEach(b => b.addEventListener('click', () =>
    b.dataset.scope ? listScope(b.dataset.scope, b.dataset.sk) : b.dataset.direct ? listAll(b.dataset.sk) : handleQuery(b.dataset.q, cap(b.dataset.q))));
  if(scroll) scrollToTop(row);
}
function listAll(sk){                                  // a bar of the whole-portfolio dashboard for the two handover/termination statuses
  const label = ST[sk].en;
  handleQuery(label, label, () => { const list = PROJECTS.filter(p => p.sk === sk).sort((a, b) => a.ord - b.ord); return list.length === 1 ? {type:'one', project:list[0], how:'filter', label} : {type:'list', list, label}; });
}
/* a bar of a scoped dashboard lists exactly the projects it counts (same membership as the dashboard) */
function listScope(scope, sk){
  const S = PORTFOLIOS[scope], label = `${ST[sk].en} · ${S.en}`;
  handleQuery(label, label, () => {
    const list = PROJECTS.filter(p => S.pos.includes(p.po) && p.sk === sk).sort((a, b) => a.ord - b.ord), lab = `${ST[sk].en} in ${S.en}`;
    return list.length === 1 ? {type:'one', project:list[0], how:'filter', label:lab} : {type:'list', list, label:lab};
  });
}
function portfolioSpeech(scope){
  const S = scope ? PORTFOLIOS[scope] : null, P = S || PORTFOLIO, s = P.status;
  return `${S ? S.en + ' portfolio' : 'Portfolio'} of ${P.total} projects. ${s.ahead} ahead of schedule, ${s.ontrack} on schedule, ${s.delay} delayed, ${s.trouble} troubled, ${s.susp} fully suspended. ` +
         `Budget ${nf(P.budgetM)} million riyals with taxes. Planned ${P.planned} percent, performance ${P.actual} percent, variance ${P.variance} percent. ` +
         `${P.approvedCount} approved invoices worth ${nf(P.approvedM)} million, and ${P.paidCount} paid invoices worth ${nf(P.paidM)} million.`;
}

/* =====================================================================
   Conversation
   ===================================================================== */
const HELP_INTRO = "Hi, I'm your PMO Bot, I'm here to help you get the latest weekly updates on projects.";
const HELP_TEXT =
  HELP_INTRO + "\n\n" +
  "I show the weekly control card of any project (data through " + REPORT_DATE + "). Ask me by:\n" +
  "• *PO* — e.g. 901240386 (or its last digits)\n" +
  "• *Project / contractor / consultant* — Arabic or English, e.g. Yanbu, Badr, ينبع\n" +
  "• *Status* — troubled, delayed, fully suspended, on schedule, ahead\n" +
  "• *Flags* — zero progress, partially suspended, critical\n" +
  "• *Area* — Madinah, Tabuk\n" +
  "• *Portfolio* — status bars, budget, planned / performance / variance and invoices (tap 📊)\n\n" +
  "Combine them freely: “delayed in Madinah”, “zero progress Tabuk”.\n" +
  "🎤 Tap the mic to speak, 🔊 to hear replies read aloud.";

const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
function handleQuery(qRaw, label, direct){
  qRaw = String(qRaw||'').trim();
  if(!qRaw) return;
  addText(label || qRaw, 'out');
  showTyping();
  setTimeout(() => {
    hideTyping();
    let r;
    try { r = direct ? direct() : search(qRaw); } catch(e){ console.error(e); r = {type:'none'}; }
    respond(r, qRaw);
  }, 450 + Math.random()*350);
}

const corr = r => r.corrected ? `✓ Showing results for *${r.corrected.to}* — you typed “${r.corrected.from}”.\n` : '';
function respond(r, qRaw){
  curPose = poseFor(r); setHeaderPose(curPose); settleHeaderPose();
  if(r.type==='help'){
    addText(HELP_TEXT, 'in');
    speakResponse(HELP_INTRO + " You can ask me by PO number, project or contractor name, status, or area. Try saying delayed projects in Madinah.");
    return;
  }
  if(r.type==='portfolio'){
    const sc = r.scope ? PORTFOLIOS[r.scope] : null;
    addText(corr(r) + (sc ? `Here's the *${sc.en}* portfolio status and dashboard — ${sc.total} project${sc.total>1?'s':''} (data through ${REPORT_DATE}):`
                          : `Here's the portfolio status and dashboard (data through ${REPORT_DATE}):`), 'in');
    addPortfolio(true, r.scope);
    speakResponse(portfolioSpeech(r.scope));
    return;
  }
  if(r.type==='report'){ openReport(r); return; }
  if(r.type==='confirm'){
    addConfirm(r);
    speakResponse('I am not sure what you meant. Do you mean ' + r.options.map(o => o.label).join(', or ') + '? Please tap one to confirm.');
    return;
  }
  if(r.type==='raghint'){
    addText("Projects are classified by their official status rather than red / amber / green. Try *troubled*, *delayed*, *fully suspended*, *on schedule* or *ahead* — or *critical* for all delayed, troubled and suspended projects.", 'in');
    speakResponse("Projects are classified by official status. Try troubled, delayed, or critical.");
    return;
  }
  if(r.type==='none'){
    if(r.label && r.hasFilter){
      addText(`${corr(r)}No projects match *${r.label}* in this report.${r.hasFilter ? '\nTip: try removing one filter.' : ''}`, 'in');
      speakResponse(`No projects match ${r.label}.`);
    } else {
      addText(`I couldn't find a project for “${qRaw}”. Try a PO (e.g. 901240386), part of a project or contractor name, a status (troubled, delayed, fully suspended, on schedule, ahead), an area (Madinah, Tabuk) or “zero progress”. Type *help* for examples.`, 'in');
      speakResponse("I couldn't find a match. Try a PO number, a name, a status, or an area.");
    }
    return;
  }
  if(r.type==='one'){
    const p = r.project;
    const lead = r.how==='po'    ? `Here's the latest control card for PO *${p.po}* (data through ${REPORT_DATE}):`
               : r.how==='fuzzy' ? `Closest match for “${qRaw}” — PO *${p.po}*:`
               :                   `Only one project matches *${r.label}* — PO *${p.po}*:`;
    addText(corr(r) + lead, 'in');
    addCard(p);
    speakResponse(cardToSpeech(p));
    return;
  }
  if(r.type==='list'){
    const n = r.list.length;
    const mixed = new Set(r.list.map(p => p.sk)).size > 1;
    const lead = `${corr(r)}${r.fuzzy ? 'Closest matches — ' : ''}*${n}* project${n>1?'s':''} — ${r.label}` + (mixed ? '' : '\n\nTap a project for its control card:');
    speakResponse(`${n} projects. ${r.label}.`);
    addOptions(r.list, lead, {label:r.label});
  }
}

/* =====================================================================
   Voice output (text-to-speech)
   ===================================================================== */
let voiceOutputEnabled = false;
const speakToggleBtn = $('speakToggleBtn');
function cleanForSpeech(t){ return t.replace(/\*/g,'').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,'').replace(/\s+/g,' ').trim(); }
function speakResponse(text){
  if(!voiceOutputEnabled || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(cleanForSpeech(text));
  u.lang = 'en-US'; u.rate = 1.0;
  window.speechSynthesis.speak(u);
}
function fcSpeech(f){
  if(f.d) return fmtDate(f.d);
  if((f.t||'').indexOf('غير متوقع') >= 0) return 'not expected';
  if((f.t||'').indexOf('متعثر') >= 0) return 'already troubled';
  return 'already delayed';
}
function cardToSpeech(p){
  const v = p.variance<0 ? 'minus '+Math.abs(p.variance) : String(p.variance);
  let s = `PO ${p.po}. Status ${ST[p.sk].en}. Planned ${p.planned} percent, performance ${p.actual} percent, variance ${v} percent. Elapsed time ${p.elapsed} percent.`;
  if(p.zero>0) s += ` Zero progress for ${p.zero} months.`;
  if(p.susp>0) s += ` Suspension ${p.susp} percent.`;
  s += ` Expected delay ${fcSpeech(p.expDelay)}. Expected troubled ${fcSpeech(p.expTroubled)}.`;
  return s;
}
if(speakToggleBtn){
  speakToggleBtn.addEventListener('click', () => {
    voiceOutputEnabled = !voiceOutputEnabled;
    speakToggleBtn.textContent = voiceOutputEnabled ? '🔊' : '🔇';
    speakToggleBtn.classList.toggle('active', voiceOutputEnabled);
    speakToggleBtn.title = voiceOutputEnabled ? 'Spoken replies: on' : 'Spoken replies: off';
    if(!voiceOutputEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    if(voiceOutputEnabled) speakResponse('Spoken replies are now on.');
  });
}

/* =====================================================================
   Voice input (speech-to-text)
   ===================================================================== */
const micBtn = $('micBtn'), langBtn = $('langBtn'), voiceHint = $('voiceHint');
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recogLang = 'en-US', recognition = null, isListening = false;
if(SpeechRecognitionAPI){
  recognition = new SpeechRecognitionAPI();
  recognition.continuous = false; recognition.interimResults = false; recognition.maxAlternatives = 1;
  recognition.onstart  = () => { isListening = true; clearTimeout(poseTimer); setHeaderPose('listening'); micBtn.classList.add('listening','active'); voiceHint.textContent = recogLang==='ar-SA' ? 'Listening (Arabic)… tap to stop' : 'Listening… tap to stop'; };
  recognition.onend    = () => { isListening = false; settleHeaderPose(); if(!document.getElementById('typingIndicator')) setHeaderPose('welcome'); micBtn.classList.remove('listening','active'); voiceHint.textContent = 'Tap to speak'; };
  recognition.onerror  = e  => { isListening = false; setHeaderPose('welcome'); micBtn.classList.remove('listening','active'); voiceHint.textContent = e.error==='not-allowed' ? 'Microphone blocked — allow it in settings' : 'Tap to speak'; };
  recognition.onresult = e  => { handleQuery(e.results[0][0].transcript); };
  micBtn.addEventListener('click', () => {
    if(isListening){ recognition.stop(); return; }
    recognition.lang = recogLang;
    try { recognition.start(); } catch(err){}
  });
  langBtn.addEventListener('click', () => {
    recogLang = recogLang==='en-US' ? 'ar-SA' : 'en-US';
    langBtn.textContent = recogLang==='en-US' ? 'EN' : 'AR';
    langBtn.title = 'Voice recognition language: ' + (recogLang==='en-US' ? 'English' : 'Arabic');
  });
} else {
  micBtn.classList.add('unsupported'); micBtn.disabled = true;
  micBtn.title = 'Voice input is not supported in this browser';
  langBtn.style.display = 'none';
  voiceHint.textContent = 'Voice not supported here';
}

/* =====================================================================
   Wiring + welcome
   ===================================================================== */
$('sendBtn').addEventListener('click', () => { const i=$('inp'); if(i.value.trim()){ handleQuery(i.value.trim()); i.value=''; } });
$('inp').addEventListener('keydown', e => { if(e.key==='Enter') $('sendBtn').click(); });
document.querySelectorAll('.quickchip').forEach(c => {
  const tabLabel = c => c.textContent.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  c.addEventListener('click', () => handleQuery(c.dataset.q, tabLabel(c)));
  c.addEventListener('keydown', e => { if(e.key==='Enter' || e.key===' '){ e.preventDefault(); handleQuery(c.dataset.q, tabLabel(c)); } });
});
$('headerAvatarSlot').innerHTML = avatarHtml('welcome', {ring:true}); $('headerAvatarSlot').dataset.pose = 'welcome';
addText("👋 Hi! I'm the NWC Northwestern Cluster PMO Bot.\n\nAsk for any project's weekly control card by *PO*, *name*, *contractor*, *status* or *area* (data through " + REPORT_DATE + ").\n\nTry: *901240386*, *troubled*, *delayed in Madinah*, *Yanbu* — or type *help*. Tap *📊 portfolio* any time for the dashboard.", 'in');
addPortfolio(false);
</script>
</body>
</html>
