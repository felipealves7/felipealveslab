"""Lossless selected fields; independent original-CSV KPI totals."""
import json,zipfile
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from download import ROOT,sha
COLS=['Year','Month','DayOfWeek','FlightDate','Reporting_Airline','DOT_ID_Reporting_Airline',
 'Flight_Number_Reporting_Airline','OriginAirportID','Origin','OriginCityName','DestAirportID',
 'Dest','DestCityName','CRSDepTime','ArrDelay','ArrDel15','Cancelled','Diverted','Distance']
STR=['Reporting_Airline','Origin','OriginCityName','Dest','DestCityName']
def totals(f):
    c=f.Cancelled.eq(1);d=f.Diverted.eq(1);o=(~c)&(~d)&f.ArrDelay.notna()
    return dict(scheduled=len(f),cancelled=int(c.sum()),diverted=int(d.sum()),
      observed_arrivals=int(o.sum()),on_time=int((o&f.ArrDelay.lt(15)).sum()),
      delayed=int((o&f.ArrDelay.ge(15)).sum()),unclassified=int((~c&~d&~o).sum()),
      arrival_delay_sum=float(f.loc[o,'ArrDelay'].sum()),
      positive_delay_sum=float(f.loc[o,'ArrDelay'].clip(lower=0).sum()),
      source_flag_mismatches=int((f.loc[o,'ArrDel15'].notna()&
         f.loc[o,'ArrDel15'].ne(f.loc[o,'ArrDelay'].ge(15).astype(int))).sum()))
def main():
    out=ROOT/'data/selected';out.mkdir(parents=True,exist_ok=True);items=[];references=[]
    for s in json.loads((ROOT/'evidence/source-manifest.json').read_text()):
        src=ROOT/'data/raw'/s['file'];period=s['period']
        if sha(src)!=s['sha256']:raise ValueError('Raw checksum mismatch')
        target=out/f'flights_{period}.parquet';writer=None;rows=0;total=None;lo=None;hi=None
        try:
            with zipfile.ZipFile(src) as z,z.open(s['csv_member']) as f:
                for c in pd.read_csv(f,usecols=COLS,dtype={k:'string' for k in STR},chunksize=100000):
                    t=totals(c);total=t if total is None else {k:total[k]+v for k,v in t.items()}
                    dates=pd.to_datetime(c.FlightDate)
                    if not dates.dt.strftime('%Y-%m').eq(period).all():raise ValueError('Wrong archive period')
                    a=str(dates.min().date());b=str(dates.max().date());lo=a if lo is None else min(lo,a);hi=b if hi is None else max(hi,b)
                    c['FlightDate']=dates.dt.date;c['source_period']=period;c['source_row']=range(rows+1,rows+len(c)+1)
                    c['source_sha256']=s['sha256']
                    for k in COLS:
                        if k not in STR and k!='FlightDate':c[k]=c[k].astype('float64')
                    table=pa.Table.from_pandas(c,preserve_index=False)
                    if writer is None:writer=pq.ParquetWriter(target,table.schema,compression='zstd')
                    writer.write_table(table);rows+=len(c)
        finally:
            if writer:writer.close()
        items.append({'period':period,'rows':rows,'min_date':lo,'max_date':hi,'path':str(target.relative_to(ROOT)),
                      'sha256':sha(target),'bytes':target.stat().st_size})
        references.append({'period':period,**total});print(period,rows,flush=True)
    (ROOT/'evidence/selected-manifest.json').write_text(json.dumps(items,indent=2)+'\n')
    (ROOT/'evidence/independent-raw-totals.json').write_text(json.dumps(references,indent=2)+'\n')
if __name__=='__main__':main()
