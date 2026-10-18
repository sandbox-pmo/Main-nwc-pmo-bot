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


def candidates(drop, root):
    """{'weekly': [...], 'gates': [...]} - every recognised file in drop/, NEWEST FIRST (by when it was added to the repository)"""
    found = {'weekly': [], 'gates': []}
    for p in sorted(glob.glob(os.path.join(drop, '**', '*.xlsx'), recursive=True)):
        if os.path.basename(p).startswith('~$'):
            continue
        kind = classify(p)
        if kind:
            found[kind].append(p)
    for k in found:
        found[k].sort(key=lambda p: (modified(p, root), os.path.getmtime(p)), reverse=True)
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=os.path.abspath(os.path.join(HERE, '..')))
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    root = a.root; drop = os.path.join(root, 'drop')
    src = os.path.join(HERE, 'src') if os.path.isdir(os.path.join(HERE, 'src')) else os.path.join(HERE, '..', 'parts')
    state_path = os.path.join(drop, '.processed.json')
    try:
        cands = candidates(drop, root)
        missing = [k for k, v in cands.items() if not v]
        if missing:
            raise ingest.IngestError('the drop folder needs both files; missing: ' + ', '.join('weekly progress file' if m == 'weekly' else 'gates schedule file' for m in missing))
        # nothing new since the last run (same files, same code) -> nothing to do
        key = hashlib.sha256(('|'.join(sha(p) for k in ('weekly', 'gates') for p in cands[k]) + build_site.src_hash(src) + build_site.read(os.path.join(HERE, 'ingest.py'))).encode()).hexdigest()
        old = json.load(open(state_path)) if os.path.exists(state_path) else {}
        if old.get('key') == key and os.path.exists(os.path.join(root, 'index.html')) and not a.force:
            print(f"No change: the {len(cands['weekly']) + len(cands['gates'])} files in drop/ were already processed.")
            return 0
        repo = os.environ.get('GITHUB_REPOSITORY', '')
        ignored = []; why = lambda e: str(e) if isinstance(e, ingest.IngestError) else f'could not be opened ({type(e).__name__})'
        gates = None; extras = []
        for p in cands['gates']:                                              # newest readable gates file leads; up to two older readable ones fill the projects it does not cover
            try:
                ingest.read_gates_any(p)
            except Exception as e:
                ignored.append({'file': os.path.basename(p), 'kind': 'gates', 'why': why(e)}); continue
            if gates is None:
                gates = p
            elif len(extras) < 2:
                extras.append(p)
        if gates is None:
            raise ingest.IngestError('no gates schedule file in drop/ can be read: ' + '; '.join(f"{i['file']}: {i['why']}" for i in ignored))
        res = weekly = None
        for p in cands['weekly']:                                             # the newest weekly file that can really be read
            try:
                res = ingest.ingest(p, gates, repo, ignored=ignored, extra_gates=extras); weekly = p; break
            except Exception as e:
                ignored.append({'file': os.path.basename(p), 'kind': 'weekly', 'why': why(e)})
        if res is None:
            raise ingest.IngestError('no weekly progress file in drop/ can be read: ' + '; '.join(f"{i['file']}: {i['why']}" for i in ignored if i['kind'] == 'weekly'))
        if ignored:                                                           # (a late weekly failure is not in the notes yet: build once more with the full list)
            res = ingest.ingest(weekly, gates, repo, ignored=ignored, extra_gates=extras)
        build_site.write_site(src, res['js'], root)
        json.dump({'key': key, 'weekly': os.path.basename(weekly), 'gates': os.path.basename(gates), 'built': res['build']['built'], 'reportDate': res['build']['reportDate'], 'projects': res['build']['projects'],
                   'ignored': [i['file'] for i in ignored]}, open(state_path, 'w'), indent=1)
        n = res['build']['notes']
        print(f"UPDATED from {os.path.basename(weekly)} (report date {res['report']}) + {os.path.basename(gates)}: {res['build']['projects']} projects, {res['build']['withGates']} with gate data (" + ', '.join(f"{s_['projects']} from {s_['file']} [{s_['model']}]" for s_ in res['build']['gatesSources']) + ').')
        print('Notes:', {k: (v if k != 'unmatched' else f"{len(v)} projects not in the gates file") for k, v in n.items() if k != 'ignored'})
        for i in ignored:
            print(f"::warning::IGNORED {i['file']} - {i['why']} (the newest readable {'gates' if i['kind'] == 'gates' else 'weekly'} file is used instead)")
        return 0
    except ingest.IngestError as e:
        print('::error::UPDATE FAILED - the site was NOT changed. ' + str(e), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
