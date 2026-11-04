"""PMO Executive Meeting minutes (MOM) -> const MOM. Highlighted (yellow) Northwestern Cluster updates, organised by date, newest first."""
import re, json, docx
AR = {'يناير':1,'فبراير':2,'مارس':3,'أبريل':4,'ابريل':4,'مايو':5,'يونيو':6,'يوليو':7,'أغسطس':8,'اغسطس':8,'سبتمبر':9,'أكتوبر':10,'اكتوبر':10,'نوفمبر':11,'ديسمبر':12}
EN = ['', 'January','February','March','April','May','June','July','August','September','October','November','December']
PAT = re.compile(r'(\d{1,2})\s*-?\s*([\u0600-\u06FF]+)\s*-?\s*(\d{4})')
def iso_of(s):
    m = PAT.search(s or '')
    if not m or m.group(2).strip() not in AR: return None
    return f"{m.group(3)}-{AR[m.group(2).strip()]:02d}-{int(m.group(1)):02d}"
def nice(iso):
    if not iso: return '—'
    y, m, d = iso.split('-'); return f"{int(d):02d} {EN[int(m)]} {y}"
def clean(s): return re.sub(r'\s+', ' ', s or '').strip()
def yellow_text(par):
    out, cur = [], ''
    for r in par.runs:
        if r.font.highlight_color is not None and 'YELLOW' in str(r.font.highlight_color): cur += r.text
        else:
            if cur.strip(): out.append(cur.strip())
            cur = ''
    if cur.strip(): out.append(cur.strip())
    return out
EXCLUDE = ('الوفورات',)                      # removed from the tab on the owner's instruction
def build(path):
    d = docx.Document(path)
    table = next(t for t in d.tables if any('الإجراء' in c.text for c in t.rows[0].cells))
    acts = []
    for row in list(table.rows)[1:]:
        c = row.cells
        yl = [y for p in c[5].paragraphs for y in yellow_text(p)]
        if not yl: continue
        action = clean(c[1].text)
        if any(action.startswith(x) or x in action[:30] for x in EXCLUDE): continue
        action = clean(re.sub(r'^ثانياً\s*:\s*', '', action))
        ups = []
        for y in yl:
            iso = iso_of(y)
            if iso: ups.append({'iso': iso, 'd': nice(iso), 't': clean(y)})
        ups.sort(key=lambda u: u['iso'], reverse=True)
        acts.append({'action': action, 'owner': clean(c[2].text), 'created': nice(iso_of(clean(c[3].text))), 'expected': nice(iso_of(clean(c[4].text))), 'updates': ups})
    all_iso = [u['iso'] for a in acts for u in a['updates']]
    out = {'title': 'MOM · PMO Executive Meeting · Northwestern Cluster', 'titleAr': 'محضر اجتماع · الاجتماع الدوري لقطاع المشاريع · القطاع الشمالي الغربي',
           'meeting': nice('2026-10-14'), 'latest': nice(max(all_iso)) if all_iso else '—', 'actions': acts}
    return out
def js(path):
    d = build(path); return 'const MOM = ' + json.dumps(d, ensure_ascii=False, separators=(',', ':')) + ';\n', d
if __name__ == '__main__':
    import sys
    s, d = js(sys.argv[1]); print(d['meeting'], d['latest'], [(a['action'][:40], len(a['updates']), a['created'], a['expected']) for a in d['actions']])
