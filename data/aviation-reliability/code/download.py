"""Official BTS monthly archives; resumable by SHA256, no credentials."""
import argparse,concurrent.futures,hashlib,json,urllib.request,urllib.error,zipfile,time
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE='https://transtats.bts.gov/PREZIP/'
def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def fetch(ym):
    y,m=ym;name=f'On_Time_Reporting_Carrier_On_Time_Performance_1987_present_{y}_{m}.zip'
    dest=ROOT/'data/raw'/name;dest.parent.mkdir(parents=True,exist_ok=True)
    meta=dest.with_suffix('.json')
    if dest.exists() and meta.exists():
        saved=json.loads(meta.read_text())
        if sha(dest)==saved['sha256']:return saved
    for attempt in range(3):
        try:
            with urllib.request.urlopen(BASE+name,timeout=120) as r,dest.with_suffix('.part').open('wb') as f:
                while chunk:=r.read(1024*1024):f.write(chunk)
                modified=r.headers.get('Last-Modified')
            break
        except urllib.error.HTTPError as e:
            if e.code not in [429,500,502,503,504] or attempt==2:raise
            time.sleep(min(30,int(e.headers.get('Retry-After','0')) or 2**(attempt+1)))
    dest.with_suffix('.part').replace(dest)
    with zipfile.ZipFile(dest) as z:
        if z.testzip():raise ValueError('ZIP integrity failure')
        csvs=[n for n in z.namelist() if n.lower().endswith('.csv')]
        if len(csvs)!=1:raise ValueError('Unexpected CSV count')
    saved={'period':f'{y}-{m:02d}','url':BASE+name,'file':name,'sha256':sha(dest),
      'bytes':dest.stat().st_size,'retrieved_at':datetime.now(timezone.utc).isoformat(),
      'last_modified':modified,'csv_member':csvs[0],'zip_integrity':'pass'}
    meta.write_text(json.dumps(saved,indent=2)+'\n')
    print(saved['period'],saved['bytes'],flush=True);return saved
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--start',default='2025-01');p.add_argument('--end',default='2026-08')
    a=p.parse_args();start=tuple(map(int,a.start.split('-')));end=tuple(map(int,a.end.split('-')))
    periods=[(y,m) for y in range(start[0],end[0]+1) for m in range(1,13) if start<=(y,m)<=end]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:items=list(pool.map(fetch,periods))
    (ROOT/'evidence').mkdir(exist_ok=True)
    (ROOT/'evidence/source-manifest.json').write_text(json.dumps(items,indent=2)+'\n')
