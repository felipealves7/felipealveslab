// Solar elevation for a place and a UTC instant, from the NOAA Global Monitoring Laboratory's
// general solar position equations (fractional-year form). Accurate to about a degree, which is
// enough to sort a crash into daylight, twilight or dark. Zero dependencies.

const RAD = Math.PI / 180;

/** Solar elevation in degrees above the horizon, without refraction. */
export function solarElevation(lat, lon, utcMs) {
  const t = new Date(utcMs);
  const y = t.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dayOfYear = Math.floor((utcMs - start) / 86400000) + 1;
  const hour = t.getUTCHours() + t.getUTCMinutes() / 60 + t.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / (leap ? 366 : 365)) * (dayOfYear - 1 + (hour - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const trueSolarMinutes = hour * 60 + eqTime + 4 * lon;
  const ha = (trueSolarMinutes / 4 - 180) * RAD;
  const cosZenith = Math.sin(lat * RAD) * Math.sin(decl) + Math.cos(lat * RAD) * Math.cos(decl) * Math.cos(ha);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosZenith))) / RAD;
}

/**
 * Light class from the sun: "day" above the horizon allowing for refraction and the disc (-0.833°),
 * "twilight" down to civil twilight (-6°), "dark" below that.
 */
export function sunClass(elevation) {
  if (elevation > -0.833) return 'day';
  if (elevation > -6) return 'twilight';
  return 'dark';
}
