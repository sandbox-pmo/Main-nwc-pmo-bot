"""White Helmet database -> data for the White Helmet tab (const WH). Columns are read by header name where possible."""
import re, json, datetime, collections, openpyxl, warnings
warnings.filterwarnings('ignore')
SHEET_FP, SHEET_OBS, SHEET_REP = 'Floor Plan_Master File', '360 Obs', '360 Reports'
def key(s): return re.sub(r'\s+', '', str(s or '')).upper()
def clean(s): return re.sub(r'\s+', ' ', str(s or '')).strip()
def consultant(s):
    t = clean(s).lower()
    if not t or t == 'none': return 'Not assigned'
    if 'فيوتشر' in t or 'fcc' in t or 'future' in t: return 'FCC'
    if 'دورش' in t or 'dorsch' in t: return 'Dorsch'
    return clean(s)
def region(s):
    t = clean(s)
    if 'تبوك' in t: return 'Tabuk'
    if 'المدينة' in t: return 'Madinah'
    return 'Other'
def month(v):
    if isinstance(v, datetime.datetime): return (v.year, v.month)
    m = re.match(r'(\d{4})-(\d{2})', str(v or ''))
    return (int(m.group(1)), int(m.group(2))) if m else None
def build(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    fp = wb[SHEET_FP]; P = []; byPno = {}; byPo = {}
    for r in range(2, fp.max_row + 1):
        if not (fp.cell(r, 1).value or fp.cell(r, 2).value or fp.cell(r, 3).value): continue
        p = dict(po=clean(fp.cell(r, 2).value), pno=clean(fp.cell(r, 3).value), name=clean(fp.cell(r, 5).value), region=region(fp.cell(r, 6).value),
                 reports=int(fp.cell(r, 9).value or 0), contractor=clean(fp.cell(r, 18).value) or 'Not assigned', consultant=consultant(fp.cell(r, 21).value),
                 floor=clean(fp.cell(r, 22).value).lower() in ('yes',), emps=[clean(fp.cell(r, c).value) for c in (23, 26, 29) if clean(fp.cell(r, c).value)], obs=0, idx=len(P))
        P.append(p)
        if p['pno']: byPno.setdefault(key(p['pno']), p['idx'])
        if p['po']: byPo.setdefault(key(p['po']), p['idx'])
    byName = {p['name']: p['idx'] for p in P}
    ob = wb[SHEET_OBS]; issuers = collections.defaultdict(lambda: {'obs': 0, 'rep': 0, 'projects': set()}); obsRows = 0; unmatchedObs = 0
    for r in range(2, ob.max_row + 1):
        name = clean(ob.cell(r, 1).value)
        if not name: continue
        obsRows += 1
        m = re.search(r'-\s*([A-Za-z0-9][\w\-]*)\s*$', name); idx = byPno.get(key(m.group(1))) if m else None
        if idx is None: idx = byName.get(name)
        iss = clean(ob.cell(r, 7).value) or 'Unknown'
        issuers[iss]['obs'] += 1
        if idx is not None: P[idx]['obs'] += 1; issuers[iss]['projects'].add(idx)
        else: unmatchedObs += 1
    rp = wb[SHEET_REP]; repRows = 0; unmatchedRep = 0
    for r in range(2, rp.max_row + 1):
        if not clean(rp.cell(r, 2).value): continue
        repRows += 1
        idx = byPno.get(key(rp.cell(r, 13).value))
        iss = clean(rp.cell(r, 7).value) or 'Unknown'
        issuers[iss]['rep'] += 1
        if idx is not None: issuers[iss]['projects'].add(idx)
        else: unmatchedRep += 1
    # index: each issuer is also searchable as an employee name
    I = [dict(name=k, obs=v['obs'], rep=v['rep'], projects=sorted(v['projects'])) for k, v in issuers.items()]
    tot_obs = obsRows; tot_rep = sum(p['reports'] for p in P)
    inv_proj = [p['idx'] for p in P if p['reports'] > 0]
    contr = collections.defaultdict(lambda: {'reports': 0, 'projects': 0})
    for p in P:
        if p['reports'] > 0: contr[p['contractor']]['reports'] += p['reports']; contr[p['contractor']]['projects'] += 1
    cons = collections.defaultdict(lambda: {'reports': 0, 'projects': 0})
    for p in P: cons[p['consultant']]['reports'] += p['reports']; cons[p['consultant']]['projects'] += 1
    reg = collections.defaultdict(lambda: {'reports': 0, 'projects': 0, 'obs': 0})
    for p in P: reg[p['region']]['reports'] += p['reports']; reg[p['region']]['projects'] += 1; reg[p['region']]['obs'] += p['obs']
    out = dict(kpi=dict(obs=tot_obs, reports=tot_rep, issuers=len(I), issuersObs=sum(1 for x in I if x['obs']), issuersRep=sum(1 for x in I if x['rep']),
                        projects=len(inv_proj), projectsAll=len(P), floors=sum(1 for p in P if p['floor']),
                        contractors=sum(1 for k, v in contr.items() if v['reports'] > 0)),
               projects=P, issuers=I, contractors=sorted([dict(name=k, **v) for k, v in contr.items()], key=lambda x: -x['reports']),
               consultants=sorted([dict(name=k, **v) for k, v in cons.items()], key=lambda x: -x['reports']),
               regions=sorted([dict(name=k, **v) for k, v in reg.items()], key=lambda x: -x['reports']),
               check=dict(obsRows=obsRows, obsUnmatched=unmatchedObs, repRows=repRows, repUnmatched=unmatchedRep))
    return out
def as_of(path):
    m = re.search(r'(\d{2})_([A-Za-z]{3})_(\d{4})', path)
    return f"{m.group(1)} {m.group(2)} {m.group(3)}" if m else ''
def js(path):
    d = build(path); d['asOf'] = as_of(path)
    return 'const WH = ' + json.dumps(d, ensure_ascii=False, separators=(',', ':')) + ';\n', d
if __name__ == '__main__':
    import sys
    s, d = js(sys.argv[1]); print(json.dumps(dict(kpi=d['kpi'], check=d['check']), ensure_ascii=False)); print('bytes', len(s))
