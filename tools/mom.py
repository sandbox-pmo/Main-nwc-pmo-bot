"""PMO Executive Meeting minutes (MOM) -> const MOM.
Structure (approved layout v4):
 - تعديل أسقف اتفاقيات الاشراف المحلية والعالمية: 1) اتفاقيات الاشراف المحلية  2) اتفاقيات الإشراف العالمية
 - إعادة طرح المشاريع المسحوبة: 1) المنهاة  2) التي سبق طرحها  3) المعاد ترسيتها
 - إغلاق ملاحظات فريق التدقيق الداخلي (16 ملاحظة)
Updates = the yellow (highlighted) dated text of each row, newest first, shown as day / month name / year."""
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
def updates_of(cell):
    ups = []
    for p in cell.paragraphs:
        for y in yellow_text(p):
            iso = iso_of(y)
            if iso: ups.append({'iso': iso, 'd': nice(iso), 't': clean(y)})
    return sorted(ups, key=lambda u: u['iso'], reverse=True)
SPEC = [
    ('تعديل أسقف اتفاقيات الاشراف المحلية والعالمية', [
        ('اتفاقيات الاشراف المحلية', r'أولاً\s*:\s*اتفاقيات\s+الإ?شراف\s+المحلية'),
        ('اتفاقيات الإشراف العالمية', r'ثانياً\s*:\s*اتفاقيات\s+الإ?شراف\s+العالمية')]),
    ('إعادة طرح المشاريع المسحوبة', [
        ('المنهاة', r'أولا\s*:?\s*-?\s*إعادة طرح المشاريع المسحوبة\s*\(المنهاة\)'),
        ('التي سبق طرحها', r'ثانيا\s*:?\s*-?\s*إعادة طرح المشاريع المسحوبة التي سبق'),
        ('المعاد ترسيتها', r'ثالثا\s*:?\s*-?\s*استرداد فرق تكاليف المشاريع المسحوبة المعاد ترسيتها')]),
    ('إغلاق ملاحظات فريق التدقيق الداخلي (16 ملاحظة)', [
        ('', r'[إا]غلاق ملاحظات فريق التدقيق الداخلي')]),
]
def build(path):
    d = docx.Document(path)
    table = next(t for t in d.tables if any('الإجراء' in c.text for c in t.rows[0].cells))
    rows = list(table.rows)[1:]
    def find(pattern):
        for r in rows:
            if re.search(pattern, clean(r.cells[1].text)) or re.search(pattern, clean(r.cells[5].text[:200])): return r
        raise ValueError('row not found: ' + pattern)
    groups = []
    for title, subs in SPEC:
        g = {'title': title, 'subs': []}
        for stitle, pattern in subs:
            r = find(pattern)
            g['subs'].append({'title': stitle, 'updates': updates_of(r.cells[5]), 'owner': clean(r.cells[2].text), 'created': nice(iso_of(clean(r.cells[3].text))), 'expected': nice(iso_of(clean(r.cells[4].text)))})
        groups.append(g)
    all_iso = [u['iso'] for g in groups for s in g['subs'] for u in s['updates']]
    return {'title': 'MOM · PMO Executive Meeting · Northwestern Cluster', 'titleAr': 'محضر اجتماع · الاجتماع الدوري لقطاع المشاريع · القطاع الشمالي الغربي',
            'meeting': nice('2026-10-14'), 'latest': nice(max(all_iso)) if all_iso else '—', 'groups': groups}
def js(path):
    dd = build(path); return 'const MOM = ' + json.dumps(dd, ensure_ascii=False, separators=(',', ':')) + ';\n', dd
if __name__ == '__main__':
    import sys
    s, dd = js(sys.argv[1]); print(dd['meeting'], dd['latest'], [(g['title'][:30], [(x['title'], len(x['updates'])) for x in g['subs']]) for g in dd['groups']])
