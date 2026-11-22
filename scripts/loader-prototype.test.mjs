// The loader-scan prototype on /case-studies/aviation-platform reads data/aviation-platform/prototype.json.
// These tests check that record, the contrast figures the page computes from it, the four screen images and
// the page source. They read the files; they do not build the site or call Figma.
// Run: node --test scripts/loader-prototype.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  checkPrototype, contrast, contrastFacts, figmaLinks, luminance, ratioLabel,
} from '../src/lib/case-studies/loader-prototype.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const data = JSON.parse(read('data/aviation-platform/prototype.json'));
const copy = () => JSON.parse(JSON.stringify(data));
const component = read('src/components/LoaderScanPrototype.astro');
const page = read('src/pages/case-studies/aviation-platform.astro');
const css = read('public/css/case-prototype.css');

/** Width and height of a WebP file: lossy (VP8), lossless (VP8L) or extended (VP8X). */
function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  throw new Error(`unknown WebP chunk ${kind}`);
}

test('the record passes its own checks, and breaking a rule the page relies on fails them', () => {
  assert.equal(checkPrototype(data), true);
  const breakers = {
    'synthetic must be true': (d) => { d.synthetic = false; },
    'not the real system': (d) => { d.label = 'Screens from the project.'; },
    'rules are not numbered': (d) => { d.rules[0].finds = `1. ${d.rules[0].finds}`; },
    'one LOAD row, last': (d) => { d.rules.reverse(); },
    'embed.figma.com': (d) => { d.figma.embedUrl = d.figma.embedUrl.replace('embed.figma.com', 'example.com'); },
    'embed-host': (d) => { d.figma.embedUrl = d.figma.embedUrl.replace(/&embed-host=[^&]+/, ''); },
    'start on node': (d) => { d.figma.protoUrl = d.figma.protoUrl.replace('node-id=14-132', 'node-id=14-151'); },
    'full alt text': (d) => { d.screens[0].alt = 'Screen'; },
    'given, when and then': (d) => { delete d.criteria[1].when; },
  };
  for (const [message, breakIt] of Object.entries(breakers)) {
    const d = copy();
    breakIt(d);
    assert.throws(() => checkPrototype(d), new RegExp(message), message);
  }
});

test('contrast is computed from the recorded colours and never rounded up', () => {
  assert.equal(luminance('#FFFFFF'), 1);
  assert.equal(luminance('#000000'), 0);
  assert.throws(() => luminance('green'), /#RRGGBB/);
  assert.equal(contrast('#000000', '#FFFFFF'), 21);
  assert.equal(contrast('#FFFFFF', '#00662C'), contrast('#00662C', '#FFFFFF'));
  assert.equal(ratioLabel(21), '21:1');
  assert.equal(ratioLabel(7.199), '7.1:1');
  assert.equal(ratioLabel(4.5), '4.5:1');
  const facts = contrastFacts(data);
  assert.equal(facts.ink, '21:1');
  for (const k of ['green', 'red']) {
    const value = Number.parseFloat(facts[k]);
    assert.ok(value >= 7, `white on ${k} is at least 7:1, got ${facts[k]}`);
    assert.ok(value <= contrast(data.colours.white, data.colours[k]), `${k} is not overstated`);
  }
});

test('the four screens exist as 720 by 1280 WebP files with captions and alt text', () => {
  assert.equal(data.screens.length, 4);
  for (const s of data.screens) {
    const file = new URL(`public${s.src}`, root);
    assert.ok(existsSync(file), `${s.src} exists`);
    assert.deepEqual(webpSize(readFileSync(file)), { w: 720, h: 1280 }, `${s.src} is drawn at twice its 360 by 640 display size`);
    assert.ok(s.caption.length > 0 && s.alt.length >= 40, `${s.src} has a caption and alt text`);
  }
  assert.match(component, /width="360" height="640"/, 'images reserve their space before they load');
});

test('the Figma links open one file at one starting screen', () => {
  const links = figmaLinks(data);
  assert.equal(new URL(links.proto).origin, 'https://www.figma.com');
  assert.equal(new URL(links.embed).searchParams.get('embed-host'), 'felipealveslab');
  assert.equal(new URL(links.embed).searchParams.get('footer'), 'false');
  assert.ok(links.proto.includes(data.figma.fileKey) && links.embed.includes(data.figma.fileKey));
  assert.ok(data.figma.designUrl.endsWith(data.figma.fileKey));
});

test('the page embeds the prototype to load as the visitor reaches it, with the stills as the fallback', () => {
  assert.match(page, /import LoaderScanPrototype from '\.\.\/\.\.\/components\/LoaderScanPrototype\.astro'/);
  assert.match(page, /<a href="#approach">Approach<\/a><a href="#mvp">MVP<\/a>/);
  assert.match(page, /<\/section><LoaderScanPrototype \/><section class="case-section" id="evidence">/);
  assert.match(page, /'case-prototype'/);
  assert.match(component, /id="mvp"/);
  const frames = component.match(/<iframe[^>]*>/g) ?? [];
  assert.equal(frames.length, 1, 'one embed, in the HTML: no click needed');
  assert.match(frames[0], /src=\{links\.embed\}/);
  assert.match(frames[0], /loading="lazy"/, 'it loads as the visitor reaches it');
  assert.match(frames[0], /title="[^"]+"/);
  assert.doesNotMatch(component, /data-lp-load|<script/, 'no button and no script');
  assert.ok(component.indexOf('<iframe') < component.indexOf('class="lp-screens"'), 'the live prototype comes before the stills');
  assert.match(component, /loads from Figma as you reach it, and Figma sets its own cookies/, 'the line names the service');
  assert.match(css, /\.lp-live iframe\{display:block;width:100%;height:760px;border:0\}/);
  assert.match(css, /@media\(max-width:680px\)\{[^}]*\}\.lp-live iframe\{height:700px\}\}/, 'phones get the embed too');
});

test('the words never count the checks, and say the screens are simplified and not the real system', () => {
  const text = [
    component.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' '),
    data.label, ...data.rules.flatMap((r) => [r.finds, r.sees]),
    ...data.criteria.flatMap((k) => [k.given, k.when, k.then]),
    ...data.screens.flatMap((s) => [s.caption, s.alt]),
  ].join(' ');
  assert.doesNotMatch(text, /\b(?:one|two|three|four|five|six|seven|\d+)\s+(?:\w+\s+)?checks?\b/i);
  assert.match(data.label, /not the real system/i);
  assert.match(data.label, /process and the checks are simplified/i);
  assert.match(text, /indoors at the carousels and outdoors on the ramp/);
  assert.match(text, /Baggage offloaded/);
  assert.match(text, /An offloaded bag cannot be loaded into a unit\./);
});
