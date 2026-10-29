// Rule-based tagging of airport names: person, place, other, or unclear.
// Two versions are kept so the page can show what the one revision changed.
//   v1: first draft, written before the rules were scored.
//   v2: the single revision, written after reading v1's mistakes on the labelled sample.
// Rules are cues in a name. They do not know who anyone was. A person is "found" only when the name
// carries a title or a given name from the lists below.

export const VERSIONS = ['v1', 'v2'];

const GENERIC = new Set([
  'airport', 'international', 'intl', 'regional', 'municipal', 'national', 'air', 'base', 'field', 'terminal',
  'new', 'old', 'airfield', 'aerodrome', 'airbase', 'city', 'county', 'metropolitan', 'domestic', 'civil',
  'aeroporto', 'aeropuerto', 'aeroport', 'aéroport', 'flughafen', 'lufthavn', 'lotnisko', 'havalimani',
  'sud', 'nord', 'sur', 'norte', 'north', 'south', 'east', 'west', 'central', 'de', 'del', 'la', 'le', 'el',
  'the', 'of', 'and', 'et', 'y', 'e', 'di', 'da', 'do', 'des', 'von', 'van', 'at', 'island', 'isla',
]);

const TITLES_V1 = new Set(['sir', 'general', 'king', 'prince', 'princess', 'president', 'chief', 'dr', 'sultan', 'queen']);
const TITLES_V2 = new Set([
  ...TITLES_V1,
  'comodoro', 'ingeniero', 'coronel', 'capitan', 'capitão', 'governador', 'governor', 'mallam', 'alhaji',
  'shaheed', 'shahid', 'raja', 'maharaja', 'emir', 'sheikh', 'imam', 'saint', 'san', 'santo', 'santa', 'sao',
  'padre', 'father', 'mother', 'marshal', 'admiral', 'colonel', 'captain', 'major', 'lieutenant', 'senator',
  'mayor', 'professor', 'doctor', 'don', 'dom', 'lord', 'lady', 'tsar', 'khan', 'bin', 'ibn', 'abu', 'abdul',
]);

const GIVEN_V1 = new Set([
  'john', 'james', 'george', 'charles', 'henry', 'william', 'robert', 'frank', 'thomas', 'richard', 'peter',
  'paul', 'mohammed', 'mohamed', 'muhammad', 'ahmed', 'ali', 'omar', 'jose', 'juan', 'carlos', 'jorge',
]);
const GIVEN_V2 = new Set([
  ...GIVEN_V1,
  'david', 'michael', 'joseph', 'edward', 'arthur', 'albert', 'alexander', 'alexei', 'anthony', 'antonio',
  'benjamin', 'daniel', 'donald', 'francis', 'franz', 'franjo', 'frederick', 'federico', 'gabriel', 'jean',
  'julius', 'louis', 'luis', 'manuel', 'mark', 'martin', 'nelson', 'nicholas', 'oscar', 'pedro', 'philip',
  'rafael', 'ramon', 'ramón', 'roberto', 'roman', 'samuel', 'simon', 'stephen', 'ted', 'victor', 'vincent',
  'adolfo', 'amilcar', 'andres', 'arturo', 'ahmadu', 'abubakar', 'aminu', 'akhmat', 'adem', 'henri', 'felix',
  'lynden', 'lech', 'rajiv', 'indira', 'jawaharlal', 'sabiha', 'hussein', 'hasan', 'hassan', 'ibrahim',
  'khalid', 'mustafa', 'nursultan', 'owen', 'sardar', 'subhas', 'toussaint', 'yusuf', 'zayed', 'abdulaziz',
  'abdullah', 'mohammad', 'khwaja', 'fahd', 'faisal', 'saud', 'rosalia', 'anna', 'maria', 'mary', 'elizabeth',
  'margaret', 'catherine', 'juliana', 'wilhelmina', 'beatrix',
]);

const OTHER_V2 = new Set([
  'friendship', 'liberty', 'freedom', 'peace', 'republic', 'independence', 'unity', 'gateway', 'pioneer',
  'victory', 'revolution', 'hope', 'harmony', 'millennium', 'sunshine', 'paradise', 'eagle', 'phoenix',
]);

export function fold(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function words(text) {
  return fold(text).split(/[^a-z0-9']+/).filter(Boolean).map((w) => w.replace(/'s$/, ''));
}

/** Returns { label, reason } for one airport row. label is person | place | other | unclear. */
export function classify(airport, version = 'v2') {
  const v2 = version === 'v2';
  const titles = v2 ? TITLES_V2 : TITLES_V1;
  const given = v2 ? GIVEN_V2 : GIVEN_V1;
  const known = new Set(words(airport.municipality || ''));
  const all = words(airport.name);
  const left = all.filter((w) => !GENERIC.has(w) && !known.has(w));

  if (left.length === 0) return { label: 'place', reason: 'name is only the city or generic words' };
  const title = left.find((w) => titles.has(w));
  if (title) return { label: 'person', reason: `title or honorific "${title}"` };
  const name = left.find((w) => given.has(w));
  if (name) return { label: 'person', reason: `given name "${name}"` };
  if (v2) {
    const word = left.find((w) => OTHER_V2.has(w));
    if (word) return { label: 'other', reason: `concept word "${word}"` };
    // A name that is still new after removing the city: a district or a surname. The rules cannot tell which.
  }
  if (!v2 && left.length >= 1) return { label: 'place', reason: 'no person cue found, so assumed to be a place' };
  return { label: 'unclear', reason: `leftover words: ${left.join(' ')}` };
}
