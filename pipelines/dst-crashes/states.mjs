// FARS state codes (US FIPS) with the IANA zone that covers most of each state's people.
// States split between two zones get their main zone; crashes in the other part get a clock
// that is one hour off, which only the sun-position join reads (see README).
// Indiana is left out of every comparison: its counties did not follow one clock rule before 2006,
// and the extract keeps no county-level Indiana zones. Fritz et al. (2020) leave it out too.

export const EXCLUDED = { 18: 'Indiana: counties followed different clock rules before 2006' };

export const STATES = {
  1: ['AL', 'Alabama', 'America/Chicago'],
  2: ['AK', 'Alaska', 'America/Anchorage'],
  4: ['AZ', 'Arizona', 'America/Phoenix'],
  5: ['AR', 'Arkansas', 'America/Chicago'],
  6: ['CA', 'California', 'America/Los_Angeles'],
  8: ['CO', 'Colorado', 'America/Denver'],
  9: ['CT', 'Connecticut', 'America/New_York'],
  10: ['DE', 'Delaware', 'America/New_York'],
  11: ['DC', 'District of Columbia', 'America/New_York'],
  12: ['FL', 'Florida', 'America/New_York'],
  13: ['GA', 'Georgia', 'America/New_York'],
  15: ['HI', 'Hawaii', 'Pacific/Honolulu'],
  16: ['ID', 'Idaho', 'America/Boise'],
  17: ['IL', 'Illinois', 'America/Chicago'],
  18: ['IN', 'Indiana', 'America/Indiana/Indianapolis'],
  19: ['IA', 'Iowa', 'America/Chicago'],
  20: ['KS', 'Kansas', 'America/Chicago'],
  21: ['KY', 'Kentucky', 'America/New_York'],
  22: ['LA', 'Louisiana', 'America/Chicago'],
  23: ['ME', 'Maine', 'America/New_York'],
  24: ['MD', 'Maryland', 'America/New_York'],
  25: ['MA', 'Massachusetts', 'America/New_York'],
  26: ['MI', 'Michigan', 'America/New_York'],
  27: ['MN', 'Minnesota', 'America/Chicago'],
  28: ['MS', 'Mississippi', 'America/Chicago'],
  29: ['MO', 'Missouri', 'America/Chicago'],
  30: ['MT', 'Montana', 'America/Denver'],
  31: ['NE', 'Nebraska', 'America/Chicago'],
  32: ['NV', 'Nevada', 'America/Los_Angeles'],
  33: ['NH', 'New Hampshire', 'America/New_York'],
  34: ['NJ', 'New Jersey', 'America/New_York'],
  35: ['NM', 'New Mexico', 'America/Denver'],
  36: ['NY', 'New York', 'America/New_York'],
  37: ['NC', 'North Carolina', 'America/New_York'],
  38: ['ND', 'North Dakota', 'America/Chicago'],
  39: ['OH', 'Ohio', 'America/New_York'],
  40: ['OK', 'Oklahoma', 'America/Chicago'],
  41: ['OR', 'Oregon', 'America/Los_Angeles'],
  42: ['PA', 'Pennsylvania', 'America/New_York'],
  44: ['RI', 'Rhode Island', 'America/New_York'],
  45: ['SC', 'South Carolina', 'America/New_York'],
  46: ['SD', 'South Dakota', 'America/Chicago'],
  47: ['TN', 'Tennessee', 'America/Chicago'],
  48: ['TX', 'Texas', 'America/Chicago'],
  49: ['UT', 'Utah', 'America/Denver'],
  50: ['VT', 'Vermont', 'America/New_York'],
  51: ['VA', 'Virginia', 'America/New_York'],
  53: ['WA', 'Washington', 'America/Los_Angeles'],
  54: ['WV', 'West Virginia', 'America/New_York'],
  55: ['WI', 'Wisconsin', 'America/Chicago'],
  56: ['WY', 'Wyoming', 'America/Denver'],
};

export function stateInfo(code) {
  const s = STATES[code];
  return s ? { code, abbr: s[0], name: s[1], zone: s[2] } : null;
}
