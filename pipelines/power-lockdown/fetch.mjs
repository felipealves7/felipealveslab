// Downloads every source of the lockdown and power-load lab into data/power-lockdown/raw/ and
// records each file's address, download date, size and SHA-256 in data/power-lockdown/sources.json.
// ONS revises published values, so each download keeps its date and checksum; a later download
// with a different checksum is a revision to look into, not a silent change.
//
// Usage: node pipelines/power-lockdown/fetch.mjs
// Behind a proxy: NODE_USE_ENV_PROXY=1 node pipelines/power-lockdown/fetch.mjs
//
// Files kept unchanged: the four ONS hourly load files, the ONS substation and transformer tables,
// and the two IBC-Br series. OxCGRT's subnational file is 43 MB, so only Brazil's state rows for
// 2020 and 2021 are kept, with the checksum of the whole file it came from.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseCsv } from '../airport-contract/csv.mjs';

const RAW = new URL('../../data/power-lockdown/raw/', import.meta.url);
const SOURCES = new URL('../../data/power-lockdown/sources.json', import.meta.url);
const ONS = 'https://ons-aws-prod-opendata.s3.amazonaws.com/dataset';

export const YEARS = [2018, 2019, 2020, 2021];
export const OXCGRT_URL = 'https://raw.githubusercontent.com/OxCGRT/covid-policy-dataset/main/data/OxCGRT_compact_subnational_v1.csv';
export const OXCGRT_FIELDS = ['RegionName', 'RegionCode', 'Jurisdiction', 'Date', 'StringencyIndex_Average'];
const BCB = (series) => `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${series}/dados?formato=json&dataInicial=01/01/2017&dataFinal=31/12/2021`;

export const FILES = [
  ...YEARS.map((y) => ({ file: `ons/CURVA_CARGA_${y}.csv`, url: `${ONS}/curva-carga-ho/CURVA_CARGA_${y}.csv`, source: 'ONS, Curva de Carga Horária' })),
  { file: 'ons/SUBESTACAO.csv', url: `${ONS}/subestacao/SUBESTACAO.csv`, source: 'ONS, Subestações da Rede de Operação' },
  { file: 'ons/CAPACIDADE_TRANSFORMACAO.csv', url: `${ONS}/capacidade-transformacao/CAPACIDADE_TRANSFORMACAO.csv`, source: 'ONS, Capacidade de Transformação da Rede Básica' },
  { file: 'bcb/ibcbr-24363.json', url: BCB(24363), source: 'Banco Central do Brasil, IBC-Br (series 24363)' },
  { file: 'bcb/ibcbr-24364.json', url: BCB(24364), source: 'Banco Central do Brasil, IBC-Br seasonally adjusted (series 24364)' },
];

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Brazil's state rows (no city rows, no national row) for 2020 and 2021, as a small CSV. */
export function oxcgrtExtract(text) {
  const lines = text.split(/\r?\n/);
  const header = lines[0];
  const keep = lines.filter((l) => l.startsWith('Brazil,BRA,'));
  const { rows } = parseCsv([header, ...keep].join('\n'));
  const out = rows
    .filter((r) => r.RegionCode && !r.CityName && /^202[01]/.test(r.Date))
    .map((r) => OXCGRT_FIELDS.map((f) => r[f]));
  return [OXCGRT_FIELDS.join(','), ...out.map((r) => r.map((v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(','))].join('\n') + '\n';
}

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const retrieved = new Date().toISOString().slice(0, 10);
  mkdirSync(new URL('ons/', RAW), { recursive: true });
  mkdirSync(new URL('bcb/', RAW), { recursive: true });
  mkdirSync(new URL('oxcgrt/', RAW), { recursive: true });
  const record = [];
  for (const f of FILES) {
    const buf = await get(f.url);
    writeFileSync(new URL(f.file, RAW), buf);
    record.push({ ...f, retrieved, bytes: buf.length, sha256: sha256(buf) });
    console.log(`${f.file}: ${buf.length} bytes`);
  }
  const ox = await get(OXCGRT_URL);
  const extract = Buffer.from(oxcgrtExtract(ox.toString('utf8')));
  writeFileSync(new URL('oxcgrt/brazil-states-2020-2021.csv', RAW), extract);
  record.push({
    file: 'oxcgrt/brazil-states-2020-2021.csv',
    url: OXCGRT_URL,
    source: 'Oxford COVID-19 Government Response Tracker, compact subnational file (v1)',
    retrieved,
    bytes: extract.length,
    sha256: sha256(extract),
    from: { bytes: ox.length, sha256: sha256(ox), kept: 'Brazil state rows (STATE_TOTAL), 2020 and 2021; columns ' + OXCGRT_FIELDS.join(', ') },
  });
  writeFileSync(SOURCES, JSON.stringify({ retrieved, files: record }, null, 1) + '\n');
  console.log(`wrote ${record.length} files and data/power-lockdown/sources.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
