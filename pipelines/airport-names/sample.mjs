// Draws the fixed 200-airport sample that is labelled by hand. Seeded, so it never changes.
import { readFileSync } from 'node:fs';
import { parseCsv } from './csv.mjs';
import { SET_FILE } from './build-set.mjs';
import { makeRng } from '../../src/lib/artifacts/prng.mjs';

export const SAMPLE_SEED = 2029;
export const SAMPLE_SIZE = 200;

export function loadSet() {
  return parseCsv(readFileSync(SET_FILE, 'utf8'));
}

export function drawSample(airports, seed = SAMPLE_SEED, size = SAMPLE_SIZE) {
  const rng = makeRng(seed);
  const pool = [...airports];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size).sort((a, b) => Number(a.id) - Number(b.id));
}
