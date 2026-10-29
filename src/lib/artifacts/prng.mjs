// Small seeded random number generator (mulberry32).
// Every illustration on the site is built from synthetic data made with this,
// so the same seed always produces the same numbers.

export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** Float in [0, 1). */
    next,
    /** Integer in [lo, hi], both included. */
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    /** True with probability p. */
    chance: (p) => next() < p,
    /** Pick one item from a non-empty array. */
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}
