"""Excel -> PMO Bot data.  Columns are found by their HEADER NAMES (never by letter), so a shifted layout does not break the update.

  weekly file : sheet "Portfolio Status"  (one row per project, header row = the row that has "PO" and "Project no.")
  gates file  : the sheet that has an "Updated SN" column and the eight gate names ("1. ..." ... "8. ...") with start/finish dates

Anything unexpected (missing column, unknown status, no projects) raises IngestError with a plain message: the previous site stays online.
"""
import re, json, hashlib, datetime, os, unicodedata
from decimal import Decimal, ROUND_HALF_UP
import openpyxl


class IngestError(Exception):
    pass


STATUS = {  # Arabic status (column "حالة المشروع") -> (key, English)
    'متقدم': ('ahead', 'Ahead of Schedule'), 'منتظم': ('ontrack', 'On Schedule'), 'متأخر': ('delay', 'Delayed'), 'متعثر': ('trouble', 'Troubled'),
    'ايقاف كلي': ('susp', 'Fully Suspended'), 'استلام ابتدائي': ('handover', 'Initial Handover'), 'انهاء تعاقد': ('terminated', 'Contract Termination'),
    'مكتمل التنفيذ': ('completed', 'Completed'),
}
AREA_EN = {'المدينة المنورة': 'Madinah', 'تبوك': 'Tabuk'}
GATE_FIX = {'Registeratin': 'Registration'}                  # visible typo in the gates file
AR_MONTH = {'يناير': 1, 'فبراير': 2, 'مارس': 3, 'ابريل': 4, 'أبريل': 4, 'مايو': 5, 'يونيو': 6, 'يوليو': 7, 'اغسطس': 8, 'أغسطس': 8, 'سبتمبر': 9, 'اكتوبر': 10, 'أكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12}


# ------------------------------------------------------------------ text helpers
def norm(s):
    s = unicodedata.normalize('NFKC', str(s if s is not None else ''))
    s = re.sub(r'[\u064B-\u065F\u0670\u0640]', '', s)
    s = s.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ى', 'ي').replace('ة', 'ه')
    return re.sub(r'\s+', ' ', s.replace('\n', ' ')).strip().lower()


def clean(s):
    return re.sub(r'\s+', ' ', str(s)).strip() if s is not None else ''


MARK = re.compile(r'(?:(?<=\s)|^)(\d{1,2})(?:\s*\.\s*|\s*[-)]\s+)(?=[^\d\s%])')


def split_numbered(text):
    """'1. a 2. b' -> ['a','b'] (numbers must run 1,2,3...)."""
    text = re.sub(r'\s+', ' ', str(text)).strip(); expected, cuts = 1, []
    for m in MARK.finditer(text):
        if int(m.group(1)) == expected:
            cuts.append((m.start(), m.end())); expected += 1
    if not cuts:
        return [text]
    items = []; head = text[:cuts[0][0]].strip()
    if head:
        items.append(head)
    for i, (s, e) in enumerate(cuts):
        seg = text[e:(cuts[i + 1][0] if i + 1 < len(cuts) else len(text))].strip()
        if seg:
            items.append(seg)
    return items


TEXT_NUMBERS = []          # cells that held a number typed as text (reported in the data-quality notes)


def fnum(x):
    """number, or a number typed as text ('12', '1,234.5', '٠٫٥'); empty -> 0."""
    if x is None or x == '':
        return 0.0
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip().translate(str.maketrans('٠١٢٣٤٥٦٧٨٩٫٬', '0123456789.,')).replace(',', '').replace('%', '')
    try:
        TEXT_NUMBERS.append(str(x)); return float(s)
    except ValueError:
        raise IngestError(f'a number was expected but the cell contains "{x}"')


def frac(x):
    """a percentage cell as a fraction: 0.279 stays 0.279, the text '27.9%' becomes 0.279."""
    if isinstance(x, str) and '%' in x:
        return fnum(x) / 100
    return fnum(x)


def pct(x):
    """fraction -> percent, half-up on the decimal text, 1 decimal (int when whole)."""
    q = float((Decimal(repr(frac(x))) * 100).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP))
    return int(q) if q == int(q) else q


def h1(v):
    r = float(Decimal(repr(float(v))).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP))
    return 0.0 if r == 0 else r


# ------------------------------------------------------------------ dates
MON = {m: i for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], 1)}


def parse_date(v, notes=None, where=''):
    """datetime / Excel serial / text such as '01-Oct-24 A', '29/11/20225' -> date or None."""
    if v is None or v == '':
        return None
    if isinstance(v, datetime.datetime):
        return v.date()
    if isinstance(v, datetime.date):
        return v
    if isinstance(v, (int, float)) and 20000 < v < 80000:
        return (datetime.datetime(1899, 12, 30) + datetime.timedelta(days=float(v))).date()
    s = clean(v)
    if s.upper() in ('#N/A', 'N/A', 'NA', '-', '—', '0'):   # Excel "no value"
        return None
    cleaned = False
    if re.search(r'\s*\bA\b\s*$', s):                     # "A" = actual date
        s = re.sub(r'\s*\bA\b\s*$', '', s); cleaned = True
    m = re.match(r'^(\d{1,2})\s*[-/ ]\s*([A-Za-z]{3,9}|\d{1,2})\s*[-/ ]\s*(\d{2,5})$', s)
    d = None
    if m:
        dd, mm, yy = m.group(1), m.group(2), m.group(3)
        mon = MON.get(mm[:3].lower()) if mm.isalpha() else int(mm)
        y = int(yy)
        if y > 2100:                                         # typo such as 20225
            y = int(str(y)[:2] + str(y)[-2:]); cleaned = True
        elif y < 100:
            y += 2000
        try:
            d = datetime.date(y, mon, int(dd))
        except (ValueError, TypeError):
            d = None
    elif not re.search(r'[A-Za-z]', s) and len(re.findall(r'\d+', s)) in (3, 4):          # stray separators: "19/03/20/24", "29/03//2028"
        nums = re.findall(r'\d+', s)
        try:
            if len(nums) == 4 and len(nums[2]) == 2 and len(nums[3]) == 2:
                nums = [nums[0], nums[1], nums[2] + nums[3]]
            if len(nums) == 3 and len(nums[0]) <= 2:
                y = int(nums[2]); y = y + 2000 if y < 100 else y
                d = datetime.date(y, int(nums[1]), int(nums[0])); cleaned = True
            elif len(nums) == 3 and len(nums[0]) == 4:
                d = datetime.date(int(nums[0]), int(nums[1]), int(nums[2]))
        except ValueError:
            d = None
    else:
        m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', s)
        if m:
            try:
                d = datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            except ValueError:
                d = None
    if notes is not None:
        if d is None:
            notes.setdefault('badDates', []).append(f'{where}: "{s}"')
        elif cleaned:
            notes['datesCleaned'] = notes.get('datesCleaned', 0) + 1
    return d


iso = lambda d: d.isoformat() if d else None


# ------------------------------------------------------------------ header lookup
class Headers:
    def __init__(self, ws, row):
        self.ws, self.row = ws, row
        self.cells = [(c, norm(ws.cell(row, c).value)) for c in range(1, ws.max_column + 1) if ws.cell(row, c).value not in (None, '')]

    def find(self, label, mode='exact', must=(), nth=0, required=True):
        key = norm(label)
        hits = [c for c, t in self.cells if (t == key if mode == 'exact' else t.startswith(key)) and all(norm(m) in t for m in must)]
        if len(hits) <= nth:
            if required:
                raise IngestError(f'column "{label}" was not found in header row {self.row} of sheet "{self.ws.title}"')
            return None
        return hits[nth]


def find_header_row(ws, needles, limit=15):
    for r in range(1, min(ws.max_row, limit) + 1):
        texts = {norm(ws.cell(r, c).value) for c in range(1, ws.max_column + 1)}
        if all(norm(n) in texts for n in needles):
            return r
    return None


# ------------------------------------------------------------------ weekly file
def report_date_of(wb, ws, filename):
    title = clean(ws.cell(1, 1).value)
    m = re.search(r'(\d{1,2})\s+([^\s\d]+)\s+(\d{4})', title)
    if m and m.group(2) in AR_MONTH:
        try:
            return datetime.date(int(m.group(3)), AR_MONTH[m.group(2)], int(m.group(1)))
        except ValueError:
            pass
    for name in wb.sheetnames:                              # a sheet named like "08 Oct 2026"
        m = re.match(r'^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$', name.strip())
        if m and m.group(2).lower() in MON:
            return datetime.date(int(m.group(3)), MON[m.group(2).lower()], int(m.group(1)))
    m = re.search(r'(\d{2})-(\d{2})-(\d{4})', filename or '')
    if m:
        return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    raise IngestError('could not work out the report date of the weekly file (title, sheet names and file name were all unreadable)')


def read_weekly(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    if 'Portfolio Status' not in wb.sheetnames:
        raise IngestError('the weekly file has no sheet named "Portfolio Status"')
    ws = wb['Portfolio Status']
    hr = find_header_row(ws, ['PO', 'Project no.'])
    if not hr:
        raise IngestError('the "Portfolio Status" sheet has no header row containing "PO" and "Project no."')
    H = Headers(ws, hr)
    F = dict(
        po=H.find('PO'), pno=H.find('Project no.'), name=H.find('اسم المشروع', 'start'), contractor=H.find('المقاول', 'start'), consultant=H.find('الإستشاري', 'start'),
        area=H.find('المنطقة'), cls=H.find('تصنيف المشروع', 'start'), partial=H.find('الإستلام الإبتدائي الجزئي', 'start', required=False), zero=H.find('مدة التوقف عن العمل', 'start'),
        status=H.find('حالة المشروع'), start=H.find('بداية المشروع التعاقدية', 'start'), end=H.find('نهاية المشروع المعدلة PMO LIVE', 'start'),
        value=H.find('قيمة المشروع بالضريبة', 'start'), ev=H.find('EV'), pv=H.find('PV'),
        unpaid_amt=H.find('Unpaid Invoices Amount'), unpaid_n=H.find('No. of Unpaid Invoices'), paid_amt=H.find('Paid Invoices Amount'), paid_n=H.find('No. of Paid invoices'),
        appr_amt=H.find('Approved Invoices Amount'), appr_n=H.find('No. of Approved Invoices'),
        susp=H.find('نسبة الإيقاف%', 'start'), planned=H.find('المخطط % التراكمي'), actual=H.find('المنفذ % التراكمي'), variance=H.find('الفرق بين المخطط', 'start'),
        elapsed=H.find('نسبة المدة المنقضية', 'start'), plannedOct=H.find('نسبة المخطط التراكمي حتى', 'start'),
        expDelay=H.find('التاريخ المتوقع للتأخر', 'start', must=['متوسط']), expTroubled=H.find('التاريخ المتوقع للتعثر', 'start', must=['متوسط']),
        tech=H.find('الإجراء الفني الحالي', 'start'), mgmt=H.find('الإجراءات الإدارية للمشاريع', 'start'), upd=H.find('اخر تحديث الإجراء الإداري الحالي', 'start'))
    rows = []
    for r in range(hr + 1, ws.max_row + 1):
        po = ws.cell(r, F['po']).value
        if isinstance(po, str) and po.strip().isdigit():
            po = int(po.strip())
        if not isinstance(po, (int, float)) or po <= 0:
            continue
        rows.append((r, str(int(po))))
    if not rows:
        raise IngestError('no project rows were found in the "Portfolio Status" sheet')
    return wb, ws, F, rows, report_date_of(wb, ws, os.path.basename(path))


UPD_CUTOFF_DAYS = 3
DATE_IN_TEXT = re.compile(r'(?<!\d)(\d{1,2})\s*[/\-]\s*(\d{1,2})\s*[/\-]\s*(\d{4,5})(?!\d)')


def item_date(text, cutoff):
    best = None
    for d, m, y in DATE_IN_TEXT.findall(text):
        d, m, y = int(d), int(m), int(y)
        if y > 2100:
            y = int(str(y)[:2] + str(y)[-2:])
        try:
            dt = datetime.date(y, m, d)
        except ValueError:
            continue
        if dt <= cutoff and (best is None or dt > best):
            best = dt
    return best


def newest_first(items, cutoff):
    own = [item_date(t, cutoff) for t in items]; eff, last = [], None
    for o in own:
        last = o or last; eff.append(last)
    nxt = None
    for i in range(len(eff) - 1, -1, -1):
        if eff[i] is None:
            eff[i] = nxt
        else:
            nxt = eff[i]
    order = sorted(range(len(items)), key=lambda i: (eff[i] or datetime.date.min, i), reverse=True)
    return [{'t': items[i], 'd': iso(own[i])} for i in order]


# ------------------------------------------------------------------ gates file
GATE_N = 8


def read_gates(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = hr = None
    for s in wb.worksheets:
        if s.sheet_state != 'visible':
            continue
        r = find_header_row(s, ['Updated SN'], limit=20)
        if r:
            ws, hr = s, r; break
    if ws is None:
        raise IngestError('the gates file has no visible sheet with an "Updated SN" column')
    # the row with the eight gate names ("1. ..." ... "8. ...") above the header row
    gate_row, gate_cols = None, {}
    for r in range(1, hr + 1):
        found = {}
        for c in range(1, ws.max_column + 1):
            v = ws.cell(r, c).value
            m = re.match(r'^\s*([1-8])\s*\.\s*([A-Za-z\u0600-\u06FF].*)$', v) if isinstance(v, str) else None      # text only: "7.29" (a number) is not gate 7
            if m and int(m.group(1)) not in found:
                found[int(m.group(1))] = (c, clean(m.group(2)))
        if len(found) == GATE_N:
            gate_row, gate_cols = r, found; break
    if not gate_cols:
        raise IngestError('could not find the eight gate names ("1. ..." to "8. ...") in the gates file')
    names = []
    for n in range(1, GATE_N + 1):
        nm = re.sub(r'\.?\s*\(', ' (', gate_cols[n][1]).rstrip('. ').strip()
        names.append(GATE_FIX.get(nm, nm))
    H = Headers(ws, hr)
    c_code = H.find('Updated SN'); c_po = H.find('رقم امر الشراء PO', 'start', required=False); c_pm = H.find('مرحلة المشروع الحاليه حسب PM', 'start', required=False)
    notes = {}
    out = {}
    for r in range(hr + 1, ws.max_row + 1):
        code = ws.cell(r, c_code).value
        if code in (None, ''):
            continue
        code = clean(code).upper()
        g = []
        for n in range(1, GATE_N + 1):
            c = gate_cols[n][0]
            s = parse_date(ws.cell(r, c).value, notes, f'{code} gate {n} start'); e = parse_date(ws.cell(r, c + 1).value, notes, f'{code} gate {n} finish')
            if s and e and e < s:
                notes['reversed'] = notes.get('reversed', 0) + 1
            g.append([iso(s), iso(e)])
        po = ws.cell(r, c_po).value if c_po else None
        po = str(int(po)) if isinstance(po, (int, float)) and po else (clean(po) if po not in (None, 0, '0') else '')
        pm = clean(ws.cell(r, c_pm).value) if c_pm else ''
        m = re.match(r'^\s*([1-8])\b', pm)
        out[code] = {'gates': g, 'po': po, 'pm': int(m.group(1)) if m else None}
    if not out:
        raise IngestError('the gates file has no project rows')
    return wb, names, out, notes


# ------------------------------------------------------------------ build the data
def ingest(weekly_path, gates_path, repo='', built=None, ignored=None):
    TEXT_NUMBERS.clear()
    wb, ws, F, rows, report = read_weekly(weekly_path)
    gwb, gate_names, gates, gnotes = read_gates(gates_path)
    cutoff = report + datetime.timedelta(days=UPD_CUTOFF_DAYS)
    by_po = {v['po']: k for k, v in gates.items() if v['po']}
    cell = lambda r, k: ws.cell(r, F[k]).value
    projects, pf_rows = [], []
    unmatched, matched_by_po = [], 0
    for ordn, (r, po) in enumerate(rows):
        st = clean(cell(r, 'status'))
        if st not in STATUS:
            raise IngestError(f'unknown project status "{st}" for PO {po} - add it to STATUS in tools/ingest.py')
        sk, sen = STATUS[st]
        area = clean(cell(r, 'area'))
        if area not in AREA_EN:
            raise IngestError(f'unknown area "{area}" for PO {po}')
        fc = lambda v: {'d': iso(parse_date(v))} if isinstance(v, (datetime.datetime, datetime.date)) else {'t': clean(v) if v is not None else ''}
        start, end = parse_date(cell(r, 'start')), parse_date(cell(r, 'end'))
        if not start or not end:
            raise IngestError(f'PO {po}: contract start / end date missing')
        pno = clean(cell(r, 'pno'))
        code = pno.upper(); g = gates.get(code)
        if g is None and po in by_po:
            code = by_po[po]; g = gates[code]; matched_by_po += 1
        if g is None:
            unmatched.append(pno)
        p = dict(po=po, pno=pno, name=clean(cell(r, 'name')), contractor=clean(cell(r, 'contractor')), consultant=clean(cell(r, 'consultant')), area=area, areaEn=AREA_EN[area],
                 cls=clean(cell(r, 'cls')), status=st, sk=sk, statusEn=sen, zero=int(fnum(cell(r, 'zero'))), start=iso(start), end=iso(end),
                 planned=pct(cell(r, 'planned')), actual=pct(cell(r, 'actual')), variance=pct(cell(r, 'variance')), elapsed=pct(cell(r, 'elapsed')),
                 plannedOct=pct(cell(r, 'plannedOct')), susp=pct(cell(r, 'susp')),
                 expDelay=fc(cell(r, 'expDelay')), expTroubled=fc(cell(r, 'expTroubled')),
                 mgmt=split_numbered(cell(r, 'mgmt')) if cell(r, 'mgmt') else [], upd=newest_first(split_numbered(cell(r, 'upd')), cutoff) if cell(r, 'upd') else [],
                 tech=split_numbered(cell(r, 'tech')) if cell(r, 'tech') else [], ord=ordn,
                 hoPartial=bool(F['partial']) and clean(cell(r, 'partial')) == 'نعم', gates=g['gates'] if g else None, pmGate=g['pm'] if g else None)
        projects.append(p)
        pf_rows.append(dict(area=area, sk=sk, value=fnum(cell(r, 'value')), pv=fnum(cell(r, 'pv')), ev=fnum(cell(r, 'ev')),
                            appr_n=int(fnum(cell(r, 'appr_n'))), appr=fnum(cell(r, 'appr_amt')), paid_n=int(fnum(cell(r, 'paid_n'))), paid=fnum(cell(r, 'paid_amt')),
                            unpaid_n=int(fnum(cell(r, 'unpaid_n'))), unpaid=fnum(cell(r, 'unpaid_amt'))))

    def agg(rs):
        budget = sum(x['value'] for x in rs)
        if not budget:
            raise IngestError('portfolio budget is zero - check the "قيمة المشروع بالضريبة" column')
        pl, ac = 100 * sum(x['pv'] for x in rs) / budget, 100 * sum(x['ev'] for x in rs) / budget
        return {'total': len(rs), 'budgetM': h1(budget), 'planned': h1(pl), 'actual': h1(ac), 'variance': h1(ac - pl),
                'approvedCount': sum(x['appr_n'] for x in rs), 'approvedM': h1(sum(x['appr'] for x in rs) / 1e6),
                'paidCount': sum(x['paid_n'] for x in rs), 'paidM': h1(sum(x['paid'] for x in rs) / 1e6),
                'unpaidCount': sum(x['unpaid_n'] for x in rs), 'unpaidM': h1(sum(x['unpaid'] for x in rs) / 1e6),
                'status': {k: sum(1 for x in rs if x['sk'] == k) for k in ('susp', 'trouble', 'delay', 'ontrack', 'ahead', 'handover', 'terminated', 'completed')}}
    portfolio = agg(pf_rows); portfolio['reportDate'] = report.isoformat()
    scopes = {}
    for key, ar, en in (('madinah', 'المدينة المنورة', 'Madinah'), ('tabuk', 'تبوك', 'Tabuk')):
        sub = [i for i, p in enumerate(projects) if p['area'] == ar]
        if sub:
            a = agg([pf_rows[i] for i in sub]); a.update({'en': en, 'ar': ar, 'pos': [projects[i]['po'] for i in sub]}); scopes[key] = a
    notes = dict(gnotes)
    notes['unmatched'] = unmatched; notes['matchedByPO'] = matched_by_po
    if ignored:
        notes['ignored'] = [{'file': i['file'], 'why': i['why'][:300]} for i in ignored]          # files in drop/ that could not be read (shown in the app)
    if TEXT_NUMBERS:
        notes['textNumbers'] = len(TEXT_NUMBERS)
    if notes.get('badDates'):
        notes['badDatesCount'] = len(notes['badDates']); notes['badDates'] = notes['badDates'][:12]
    build = {'built': (built or datetime.datetime.now(datetime.timezone.utc)).strftime('%Y-%m-%dT%H:%M:%SZ'), 'repo': repo,
             'weeklyFile': os.path.basename(weekly_path), 'gatesFile': os.path.basename(gates_path), 'reportDate': report.isoformat(),
             'projects': len(projects), 'withGates': len(projects) - len(unmatched), 'notes': notes}
    month = lambda d: f'{d.day} {d.strftime("%b")} {d.year}'
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))
    js = (f"const REPORT_DATE = {json.dumps(month(report))};\nconst PROJECTS = {dump(projects)};\nconst PORTFOLIO = {dump(portfolio)};\n"
          f"const PORTFOLIOS = {dump(scopes)};\nconst GATES = {dump([{'n': i + 1, 'name': n} for i, n in enumerate(gate_names)])};\nconst BUILD = {dump(build)};\n")
    return {'js': js, 'projects': projects, 'portfolio': portfolio, 'scopes': scopes, 'gate_names': gate_names, 'build': build, 'report': report}


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(); ap.add_argument('--weekly', required=True); ap.add_argument('--gates', required=True); ap.add_argument('--out', required=True); ap.add_argument('--repo', default='')
    a = ap.parse_args(); res = ingest(a.weekly, a.gates, a.repo)
    open(a.out, 'w', encoding='utf-8').write(res['js'])
    print(f"{len(res['projects'])} projects, report date {res['report']}, {res['build']['withGates']} with gate data -> {a.out}")
