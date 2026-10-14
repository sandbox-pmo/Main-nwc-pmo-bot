"""Hourly job (GitHub Actions): look in drop/ for the newest weekly-progress file and the newest gates file,
rebuild index.html + sw.js from them, and report what happened.  Nothing is rewritten when the inputs have not changed.
Exit code 1 (with a plain message) when a file cannot be read: the site that is online stays as it is."""
import os, sys, json, hashlib, subprocess, datetime, glob, argparse
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ingest, build_site
import openpyxl


def classify(path):
    """'weekly' | 'gates' | None  - decided by what is INSIDE the file, so any file name works."""
    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    except Exception:
        return None
    try:
        if 'Portfolio Status' in wb.sheetnames:
            return 'weekly'
        for ws in wb.worksheets:
            if ws.sheet_state != 'visible':
                continue
            for row in ws.iter_rows(min_row=1, max_row=20, values_only=True):
                if any(isinstance(v, str) and v.strip().lower() == 'updated sn' for v in row):
                    return 'gates'
    finally:
        wb.close()
    return None


def modified(path, root):
    try:
        out = subprocess.run(['git', 'log', '-1', '--format=%ct', '--', os.path.relpath(path, root)], cwd=root, capture_output=True, text=True).stdout.strip()
        if out:
            return int(out)
    except Exception:
        pass
    return int(os.path.getmtime(path))


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def pick(drop, root):
    found = {'weekly': [], 'gates': []}
    for p in sorted(glob.glob(os.path.join(drop, '**', '*.xlsx'), recursive=True)):
        if os.path.basename(p).startswith('~$'):
            continue
        kind = classify(p)
        if kind:
            found[kind].append(p)
    if not found['weekly'] or not found['gates']:
        missing = [k for k, v in found.items() if not v]
        raise ingest.IngestError('the drop folder needs both files; missing: ' + ', '.join('weekly progress file' if m == 'weekly' else 'gates schedule file' for m in missing))
    newest = lambda lst: max(lst, key=lambda p: (modified(p, root), os.path.getmtime(p)))
    return newest(found['weekly']), newest(found['gates'])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=os.path.abspath(os.path.join(HERE, '..')))
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    root = a.root; drop = os.path.join(root, 'drop')
    src = os.path.join(HERE, 'src') if os.path.isdir(os.path.join(HERE, 'src')) else os.path.join(HERE, '..', 'parts')
    state_path = os.path.join(drop, '.processed.json')
    try:
        weekly, gates = pick(drop, root)
        key = hashlib.sha256((sha(weekly) + sha(gates) + build_site.src_hash(src) + build_site.read(os.path.join(HERE, 'ingest.py'))).encode()).hexdigest()
        old = json.load(open(state_path)) if os.path.exists(state_path) else {}
        if old.get('key') == key and os.path.exists(os.path.join(root, 'index.html')) and not a.force:
            print(f"No change: {os.path.basename(weekly)} + {os.path.basename(gates)} were already processed.")
            return 0
        repo = os.environ.get('GITHUB_REPOSITORY', '')
        res = ingest.ingest(weekly, gates, repo)
        build_site.write_site(src, res['js'], root)
        json.dump({'key': key, 'weekly': os.path.basename(weekly), 'gates': os.path.basename(gates), 'built': res['build']['built'], 'reportDate': res['build']['reportDate'], 'projects': res['build']['projects']},
                  open(state_path, 'w'), indent=1)
        n = res['build']['notes']
        print(f"UPDATED from {os.path.basename(weekly)} (report date {res['report']}) + {os.path.basename(gates)}: {res['build']['projects']} projects, {res['build']['withGates']} with gate data.")
        print('Notes:', {k: (v if k != 'unmatched' else f"{len(v)} projects not in the gates file") for k, v in n.items()})
        return 0
    except ingest.IngestError as e:
        print('::error::UPDATE FAILED - the site was NOT changed. ' + str(e), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
