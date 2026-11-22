// The loader-scan prototype on /case-studies/aviation-platform reads data/aviation-platform/prototype.json.
// These helpers check that record and compute the contrast figures the page quotes, so no figure is typed by hand.

/** Relative luminance of a #RRGGBB colour, by the WCAG 2 formula. */
export function luminance(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(String(hex))) throw new Error(`not a #RRGGBB colour: ${hex}`);
  const n = Number.parseInt(hex.slice(1), 16);
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Contrast ratio between two colours, from 1 to 21. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** "7.1:1" or "21:1". Rounded down, so the page never overstates a ratio. */
export function ratioLabel(r) {
  const down = Math.floor(r * 10 + 1e-9) / 10;
  return `${Number.isInteger(down) ? down : down.toFixed(1)}:1`;
}

/** The ratios the page quotes: white text on the green and red screens, black on white. */
export function contrastFacts(data) {
  const { white, black, green, red } = data.colours;
  return {
    green: ratioLabel(contrast(white, green)),
    red: ratioLabel(contrast(white, red)),
    ink: ratioLabel(contrast(black, white)),
  };
}

/** The prototype's URLs share one file and one starting screen, on Figma's own hosts. */
export function figmaLinks(data) {
  const f = data.figma;
  const proto = new URL(f.protoUrl);
  const embed = new URL(f.embedUrl);
  if (proto.origin !== 'https://www.figma.com' || !proto.pathname.startsWith(`/proto/${f.fileKey}`)) {
    throw new Error(`protoUrl must open /proto/${f.fileKey} on www.figma.com`);
  }
  if (embed.origin !== 'https://embed.figma.com' || !embed.pathname.startsWith(`/proto/${f.fileKey}`)) {
    throw new Error(`embedUrl must be embed.figma.com/proto/${f.fileKey}`);
  }
  if (!embed.searchParams.get('embed-host')) throw new Error('embedUrl needs embed-host, the one required parameter');
  for (const u of [proto, embed]) {
    if (u.searchParams.get('node-id') !== f.startNode || u.searchParams.get('starting-point-node-id') !== f.startNode) {
      throw new Error(`${u.origin} link must start on node ${f.startNode}`);
    }
  }
  if (!f.frameOrigins.includes(embed.origin)) throw new Error('frameOrigins must include the embed origin');
  return { proto: proto.href, embed: embed.href };
}

/** Throws if the record breaks a rule the page relies on; returns true otherwise. */
export function checkPrototype(data) {
  if (data.synthetic !== true) throw new Error('the prototype runs on invented data: synthetic must be true');
  if (!/not the real system/i.test(data.label) || !/simplified/i.test(data.label)) {
    throw new Error('the label must say these are not the real system and that the process and checks are simplified');
  }
  figmaLinks(data);
  for (const s of data.screens) {
    if (!/^\/assets\/case-studies\/aviation\/[a-z0-9-]+\.webp$/.test(s.src)) throw new Error(`unexpected image path: ${s.src}`);
    if (!s.caption || !s.alt || s.alt.length < 40) throw new Error(`${s.src} needs a caption and a full alt text`);
  }
  if (data.rules.some((r) => /^\s*\d/.test(r.finds))) throw new Error('rules are not numbered');
  const loads = data.rules.filter((r) => r.verdict === 'LOAD');
  if (loads.length !== 1 || data.rules.at(-1).verdict !== 'LOAD') throw new Error('one LOAD row, last: any failed check turns the screen red');
  if (data.rules.some((r) => !['LOAD', 'DO NOT LOAD'].includes(r.verdict))) throw new Error('verdicts are LOAD or DO NOT LOAD');
  for (const c of data.criteria) {
    if (!c.given || !c.when || !c.then) throw new Error('each criterion has given, when and then');
  }
  return true;
}
