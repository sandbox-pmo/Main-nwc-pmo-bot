"""Weekly meeting presentations -> const MEET: verified figures + searchable index of all their text.
Figures are read by fixed patterns; a pattern that does not match is reported and the figure is left out (never guessed)."""
import re, json, collections
from pptx import Presentation
def clean(s): return re.sub(r'\s+', ' ', str(s or '')).strip()
def slide_texts(slide):
    out = []
    for sh in slide.shapes:
        if sh.has_text_frame and sh.text_frame.text.strip(): out.append(clean(sh.text_frame.text))
        if sh.has_table:
            for r in sh.table.rows:
                for c in r.cells:
                    if clean(c.text): out.append(clean(c.text))
    return out
def kind_of(prs):
    """minutes: the first slide carries 'الاجتماع بتاريخ'; support report: it carries the withdrawn-projects plan."""
    slides = list(prs.slides)
    first = ' '.join(slide_texts(slides[0])) if slides else ''
    if 'الاجتماع بتاريخ' in first: return 'minutes'
    allt = ' '.join(' '.join(slide_texts(x)) for x in slides)
    if 'خطة معالجة المشاريع المسحوبة' in allt and 'موقف الاستلامات النهائية' in allt: return 'support'
    return None
CAT = [('contractors', r'مقاول|شركة'), ('consultants', r'فيوتشر|دورش|الاستشاري|الإشراف|الاشراف|عناصر'), ('statements', r'مستخلص|المستخلصات|الاستلام'),
       ('withdrawn', r'المسحوبة|المنهاة|إعادة الطرح|اعادة الطرح|الترسية|المعاد ترسيتها'), ('budget', r'ميزانية|الميزانية|الوفورات|الصرف'),
       ('audit', r'التدقيق|ملاحظات'), ('minutes_actions', r'الإجراء|الإجراءات|الإجراء المطلوب'), ('projects', r'مشروع|مشاريع')]
def category(text):
    for name, pat in CAT:
        if re.search(pat, text): return name
    return 'other'
EN = {'contractors': 'Contractors', 'consultants': 'Consultants', 'statements': 'Final statements', 'withdrawn': 'Withdrawn projects', 'budget': 'Budget', 'audit': 'Audit notes', 'minutes_actions': 'Minutes actions', 'projects': 'Projects', 'other': 'Other'}
def figures(minutes, support):
    F, miss = {}, []
    def get(key, text, pat, conv=lambda m: m.group(1)):
        m = re.search(pat, text)
        if m: F[key] = conv(m)
        else: miss.append(key)
    s7 = ' '.join(slide_texts(minutes.slides[6]))
    pairs = re.findall(r'(\d+)\s*مشروع\s+([\d.]+)\s*مليون ريال\s+(.+?)(?=\s*\d+\s*مشروع|\s*\d+\s*%|$)', s7)
    for n, val, lab in pairs:
        if 'المطلوب إغلاقها' in lab: F['to_close'], F['to_close_val'] = int(n), float(val)
        elif 'لم يتم صرف المستخلص' in lab: F['no_statement'], F['no_statement_val'] = int(n), float(val)
        elif 'تم إغلاقهم' in lab: F['closed'], F['closed_val'] = int(n), float(val)
    for key in ('to_close', 'no_statement', 'closed'):
        if key not in F: miss.append(key)
    pct = re.findall(r'(\d+)\s*%\s*نسبة من العدد', s7)
    if len(pct) >= 2: F['no_statement_pct'], F['closed_pct'] = int(pct[0]), int(pct[1])
    t9 = ' '.join(slide_texts(minutes.slides[8])); get('not_meeting_criteria', t9, r'(\d+)\s*مشاريع غير مستوفية لشروط الإغلاق', lambda m: int(m.group(1)))
    t10 = ' '.join(slide_texts(minutes.slides[9])); get('not_settled', t10, r'(\d+)\s*مشروع لم تتم التسوية', lambda m: int(m.group(1)))
    t31 = ' '.join(slide_texts(minutes.slides[30])); get('audit_notes', t31, r'\((\d+) ملاحظة\)', lambda m: int(m.group(1)))
    t22 = ' '.join(slide_texts(minutes.slides[22])); get('linked_delivered', t22, r'الإجمالي\s+16 مشروع\s+([\d.]+) مليون', lambda m: float(m.group(1)))
    t23 = ' '.join(slide_texts(minutes.slides[22])); 
    t40 = ' '.join(slide_texts(minutes.slides[39])); get('fcc_contract', t40, r'الإتفاقية رقم (\d+) هو (\d{2}/\d{2}/\d{4})م بقيمة ([\d.]+) مليون', lambda m: f"{m.group(1)}|{m.group(2)}|{m.group(3)}")
    t39 = ' '.join(slide_texts(minutes.slides[38])); get('supervision_cost_end', t39, r'([\d.]+) مليون إجمالي الدراسة طبقا للنهاية', lambda m: float(m.group(1)))
    t8 = ' '.join(slide_texts(support.slides[7]))
    get('km_water', t8, r'\+(\d+)\s*كم\s*خطوط وشبكات المياه', lambda m: int(m.group(1)))
    get('km_sewer', t8, r'\+(\d+)\s*كم\s*خطوط وشبكات الصرف', lambda m: int(m.group(1)))
    t17 = ' '.join(slide_texts(support.slides[16])); get('nw_under_procedure', t17, r'عدد المشاريع تحت الاجراء\s+(\d+) مشروع', lambda m: int(m.group(1)))
    return F, miss
def build(path_minutes, path_support):
    mins, sup = Presentation(path_minutes), Presentation(path_support)
    F, miss = figures(mins, sup)
    items = []
    for label, prs, src in (('minutes', mins, 'محضر الاجتماع 14-10-2026'), ('support', sup, 'التقارير الداعمة 25-10-2026')):
        for n, s in enumerate(prs.slides, 1):
            texts = slide_texts(s)
            if not texts: continue
            title = texts[0][:160]
            seen = set()
            for t in texts:
                if len(t) < 4 or t in seen: continue
                seen.add(t)
                items.append({'src': src, 'file': label, 'slide': n, 'cat': category(title + ' ' + t), 'ar': t[:400], 'title': title})
    return {'figures': F, 'missing': miss, 'items': items, 'sources': [{'id': 'minutes', 'ar': 'محضر الاجتماع', 'en': 'Meeting minutes', 'date': '14 Oct 2026'}, {'id': 'support', 'ar': 'التقارير الداعمة', 'en': 'Support report', 'date': '25 Oct 2026'}]}
def js(path_minutes, path_support):
    d = build(path_minutes, path_support)
    return 'const MEET = ' + json.dumps(d, ensure_ascii=False, separators=(',', ':')) + ';\n', d
if __name__ == '__main__':
    import sys
    d = build(sys.argv[1], sys.argv[2])
    print(json.dumps(d['figures'], ensure_ascii=False)); print('missing:', d['missing']); print('items:', len(d['items']), collections.Counter(i['cat'] for i in d['items']))
