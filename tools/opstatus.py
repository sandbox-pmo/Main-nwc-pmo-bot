"""Operating Status from the minutes presentation, slides 23-29 (the detailed tables).
Columns are read by header name. Totals are checked against slide 22."""
import re, json
from pptx import Presentation
def clean(s): return re.sub(r'\s+', ' ', str(s or '').replace('\u200f', '').replace('\u200e', '')).strip()
def table_rows(slide):
    for sh in slide.shapes:
        if sh.has_table:
            rows = [[clean(c.text) for c in r.cells] for r in sh.table.rows]
            return rows
    return []
def col(hdr, *keys):
    for i, h in enumerate(hdr):
        if all(k in h for k in keys): return i
    return None
def dup(*vals): return any('مكرر' in clean(v) for v in vals)
def build(path):
    prs = Presentation(path); S = list(prs.slides)
    groups = []
    # group 1: slides 23-27 (delivered, linked), group 2: slide 28, group 3: slide 29
    g1 = {'title': 'مشاريع مسلّمة لم يتم الاستفادة منها بسبب ارتباطها بمشاريع (تحت التنفيذ – مستقبلية)', 'titleEn': 'Delivered, not benefited: linked to projects under construction or future', 'rows': []}
    for sn in (23, 24, 25, 26, 27):
        rows = table_rows(S[sn - 1]); hdr = rows[0] if rows else []
        ci = {'name': col(hdr, 'اسم المشروع'), 'area': col(hdr, 'المنطقة'), 'cls': col(hdr, 'التصنيف'), 'pct': col(hdr, 'نسبة الاستفادة'), 'reason': col(hdr, 'سبب عدم'), 'rcat': col(hdr, 'تصنيف سبب'), 'end': col(hdr, 'تاريخ نهاية'), 'liq': col(hdr, 'السيولة'), 'val': col(hdr, 'القيمة التقديرية'), 'impact': col(hdr, 'الأثر')}
        if ci['name'] is None: continue
        for r in rows[1:]:
            if not r or len(r) < 5: continue
            name = r[ci['name']] if ci['name'] < len(r) else ''
            if not name: continue
            def g(k): return clean(r[ci[k]]) if ci[k] is not None and ci[k] < len(r) else ''
            g1['rows'].append({'no': len(g1['rows']) + 1, 'year': '', 'name': name, 'area': g('area'), 'cls': g('cls'), 'pct': g('pct'), 'reason': g('reason')[:260], 'rcat': g('rcat'), 'end': g('end'), 'liq': g('liq'), 'val': g('val'), 'impact': g('impact')[:200], 'slide': sn, 'dup': dup(name, g('reason'), g('impact'), g('val')), 'transferred': 'نقله' in ' '.join(r) or 'لجهة أخرى' in ' '.join(r)})
    groups.append(g1)
    g2 = {'title': 'مشاريع تحت التنفيذ لن يتم الاستفادة منها بسبب ارتباطها بمشاريع مستقبلية', 'titleEn': 'Under construction, will not operate on completion (linked to future projects)', 'rows': []}
    rows = table_rows(S[27]); hdr = rows[0] if rows else []
    ci = {'name': col(hdr, 'اسم المشروع'), 'area': col(hdr, 'المنطقة'), 'val': col(hdr, 'إجمالي القيمة'), 'status': col(hdr, 'وضع المشروع'), 'op': col(hdr, 'التشغيل فور'), 'reason': col(hdr, 'سبب عدم'), 'linked': col(hdr, 'حالة المشروع المرتبط'), 'fval': col(hdr, 'قيمة المشاريع المستقبلية')}
    for r in rows[1:]:
        if not r or len(r) < 5 or not clean(r[ci['name']]): continue
        def g(k): return clean(r[ci[k]]) if ci[k] is not None and ci[k] < len(r) else ''
        g2['rows'].append({'no': len(g2['rows']) + 1, 'name': g('name'), 'area': g('area'), 'val': g('val'), 'status': g('status'), 'op': g('op'), 'reason': g('reason')[:260], 'linked': g('linked'), 'fval': g('fval'), 'slide': 28, 'dup': False, 'transferred': False})
    groups.append(g2)
    g3 = {'title': 'مشاريع وردت من إدارة التشغيل وغير مضمنة بقائمة قطاع المشاريع', 'titleEn': 'From Operations, not in the sector list', 'rows': []}
    rows = table_rows(S[28]); hdr = rows[0] if rows else []
    ci = {'name': col(hdr, 'اسم المشروع'), 'area': col(hdr, 'المنطقة'), 'cls': col(hdr, 'التصنيف'), 'val': col(hdr, 'إجمالي القيمة'), 'end': col(hdr, 'تاريخ التشغيل'), 'pct': col(hdr, 'نسبة الاستفادة'), 'reason': col(hdr, 'سبب عدم'), 'impact': col(hdr, 'الأثر')}
    for r in rows[1:]:
        if not r or len(r) < 5 or not clean(r[ci['name']]): continue
        def g(k): return clean(r[ci[k]]) if ci[k] is not None and ci[k] < len(r) else ''
        g3['rows'].append({'no': len(g3['rows']) + 1, 'name': g('name'), 'area': g('area'), 'cls': g('cls'), 'val': g('val'), 'end': g('end'), 'pct': g('pct'), 'reason': g('reason')[:260], 'impact': g('impact')[:200], 'slide': 29, 'dup': False, 'transferred': False})
    groups.append(g3)
    s22 = ' '.join(clean(sh.text_frame.text) for sh in S[21].shapes if sh.has_text_frame) + ' ' + ' '.join(clean(c.text) for sh in S[21].shapes if sh.has_table for r in sh.table.rows for c in r.cells)
    tot = re.findall(r'الإجمالي\s+(\d+)\s+بقيمة\s+([\d.]+)\s*مليون', s22)
    totals = [{'count': int(a), 'value': float(b)} for a, b in tot[:3]]
    for g, t in zip(groups, totals): g['totalCount'], g['totalValue'] = t['count'], t['value']
    return {'groups': groups, 'source': 'محضر الاجتماع · الشرائح 23–29', 'checks': {'counts': [len(g['rows']) for g in groups], 'expected': [t['count'] for t in totals], 'values': [g.get('totalValue') for g in groups]}}
def js(path):
    d = build(path); return 'const OPS = ' + json.dumps(d, ensure_ascii=False, separators=(',', ':')) + ';\n', d
if __name__ == '__main__':
    import sys
    d = build(sys.argv[1]); print('counts', d['checks']['counts'], 'expected', d['checks']['expected'])
    for g in d['groups']:
        print('--', g['title'][:50], len(g['rows']), 'dup', sum(r['dup'] for r in g['rows']), 'transferred', sum(r['transferred'] for r in g['rows']))
        for r in g['rows'][:3]: print('   ', r['name'][:60], '|', r.get('area'), '|', r.get('val', r.get('reason', ''))[:30])
