// The written data contract for three OurAirports tables. Each check has an id, a plain sentence,
// a scope and a level:
//   table checks look at the whole file (columns, row count). One failure fails the run.
//   row checks look at one row at a time. Failing rows are rejected and counted. The run fails when
//   rejected rows exceed the check's tolerance (a share of the table).
export const MAX_AGE_DAYS = 7;

const AIRPORT_TYPES = ['balloonport', 'closed', 'heliport', 'large_airport', 'medium_airport', 'seaplane_base', 'small_airport'];
const int = /^-?\d+$/;
const num = (v) => v !== '' && Number.isFinite(Number(v));

export const REQUIRED_COLUMNS = {
  airports: ['id', 'ident', 'type', 'name', 'latitude_deg', 'longitude_deg', 'elevation_ft', 'continent', 'iso_country', 'iso_region', 'scheduled_service', 'iata_code'],
  runways: ['id', 'airport_ref', 'airport_ident', 'length_ft', 'width_ft', 'surface', 'closed'],
  countries: ['id', 'code', 'name', 'continent'],
};

// Bounds were set from the first real run on 2026-10-29 (86,301 airports, 48,382 runways, 249 countries)
// with room to grow or shrink. A file outside them is more likely broken than changed.
export const ROW_BOUNDS = {
  airports: [70000, 120000],
  runways: [35000, 70000],
  countries: [200, 300],
};

export function buildChecks(tables) {
  const countryCodes = new Set(tables.countries.rows.map((r) => r.code));
  const airportIds = new Set(tables.airports.rows.map((r) => r.id));
  const dupes = (table, col) => {
    const seen = new Set();
    const dup = new Set();
    for (const r of tables[table].rows) (seen.has(r[col]) ? dup : seen).add(r[col]);
    return dup;
  };
  const dupAirportId = dupes('airports', 'id');
  const dupAirportIdent = dupes('airports', 'ident');
  const dupCountryCode = dupes('countries', 'code');
  const tableChecks = Object.keys(REQUIRED_COLUMNS).flatMap((t) => [
    { id: `${t}.columns`, table: t, level: 'table', says: `${t} has the ${REQUIRED_COLUMNS[t].length} columns the pipeline reads`, test: ({ columns }) => REQUIRED_COLUMNS[t].filter((c) => !columns.includes(c)).map((c) => `missing column ${c}`) },
    { id: `${t}.row_count`, table: t, level: 'table', says: `${t} has between ${ROW_BOUNDS[t][0].toLocaleString('en-GB')} and ${ROW_BOUNDS[t][1].toLocaleString('en-GB')} rows`, test: ({ rows }) => (rows.length >= ROW_BOUNDS[t][0] && rows.length <= ROW_BOUNDS[t][1] ? [] : [`${rows.length} rows`]) },
  ]);
  const rowCheck = (id, table, says, tolerance, test) => ({ id, table, level: 'row', says, tolerance, test });
  return [
    ...tableChecks,
    rowCheck('airports.id_unique_integer', 'airports', 'id is an integer and appears once', 0, (r) => (int.test(r.id) && !dupAirportId.has(r.id) ? null : 'id')),
    rowCheck('airports.ident_unique', 'airports', 'ident is not empty and appears once', 0, (r) => (r.ident !== '' && !dupAirportIdent.has(r.ident) ? null : 'ident')),
    rowCheck('airports.type_allowed', 'airports', `type is one of ${AIRPORT_TYPES.length} listed values`, 0, (r) => (AIRPORT_TYPES.includes(r.type) ? null : `type=${r.type}`)),
    rowCheck('airports.coordinates', 'airports', 'latitude is -90 to 90 and longitude is -180 to 180', 0, (r) => (num(r.latitude_deg) && num(r.longitude_deg) && Math.abs(r.latitude_deg) <= 90 && Math.abs(r.longitude_deg) <= 180 ? null : 'coordinates')),
    rowCheck('airports.country_known', 'airports', 'iso_country exists in the countries table', 0, (r) => (countryCodes.has(r.iso_country) ? null : `iso_country=${r.iso_country}`)),
    rowCheck('airports.region_matches_country', 'airports', 'iso_region starts with the iso_country code', 0.001, (r) => (r.iso_region.startsWith(`${r.iso_country}-`) ? null : `iso_region=${r.iso_region}`)),
    rowCheck('airports.scheduled_service_yes_no', 'airports', 'scheduled_service is yes or no', 0, (r) => (r.scheduled_service === 'yes' || r.scheduled_service === 'no' ? null : `scheduled_service=${r.scheduled_service}`)),
    rowCheck('airports.iata_format', 'airports', 'iata_code, when present, is three letters or digits', 0, (r) => (r.iata_code === '' || /^[A-Z0-9]{3}$/.test(r.iata_code) ? null : `iata_code=${r.iata_code}`)),
    rowCheck('airports.elevation_integer', 'airports', 'elevation_ft, when present, is a whole number', 0, (r) => (r.elevation_ft === '' || int.test(r.elevation_ft) ? null : `elevation_ft=${r.elevation_ft}`)),
    rowCheck('runways.airport_known', 'runways', 'airport_ref points to an airport id', 0, (r) => (airportIds.has(r.airport_ref) ? null : `airport_ref=${r.airport_ref}`)),
    rowCheck('runways.length_positive', 'runways', 'length_ft, when present, is a whole number above 0', 0.001, (r) => (r.length_ft === '' || (int.test(r.length_ft) && Number(r.length_ft) > 0) ? null : `length_ft=${r.length_ft}`)),
    rowCheck('runways.closed_flag', 'runways', 'closed is 0 or 1', 0, (r) => (r.closed === '0' || r.closed === '1' ? null : `closed=${r.closed}`)),
    rowCheck('countries.code_unique_two_letters', 'countries', 'code is two capital letters and appears once', 0, (r) => (/^[A-Z]{2}$/.test(r.code) && !dupCountryCode.has(r.code) ? null : `code=${r.code}`)),
  ];
}

// tables: { airports, runways, countries }, each { columns, rows }.
// Returns one entry per check plus the overall status. Never throws on bad data.
export function runContract(tables) {
  const results = [];
  for (const check of buildChecks(tables)) {
    const t = tables[check.table];
    let failed = 0;
    let samples = [];
    if (check.level === 'table') {
      samples = check.test(t);
      failed = samples.length;
    } else {
      for (const row of t.rows) {
        const why = check.test(row);
        if (why) { failed++; if (samples.length < 3) samples.push(why); }
      }
    }
    const share = check.level === 'row' && t.rows.length ? failed / t.rows.length : 0;
    const passed = check.level === 'table' ? failed === 0 : share <= check.tolerance;
    results.push({ id: check.id, table: check.table, level: check.level, says: check.says, tolerance: check.tolerance ?? 0, failed, checked: check.level === 'row' ? t.rows.length : 1, passed, samples });
  }
  return { status: results.every((r) => r.passed) ? 'pass' : 'fail', checks: results };
}

// Freshness comes from the HTTP Last-Modified header of the upstream file, compared with the run date.
export function freshness(lastModifiedIso, runDateIso) {
  const ageDays = (Date.parse(runDateIso) - Date.parse(lastModifiedIso)) / 86400000;
  return { upstreamLastModified: lastModifiedIso, ageDays: Math.round(ageDays * 10) / 10, ok: ageDays <= MAX_AGE_DAYS && ageDays >= -1 };
}
