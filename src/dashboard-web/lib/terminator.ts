/**
 * Day/night terminator geometry for the map's daylight overlay.
 *
 * Computes the sub-solar point from a timestamp (standard low-precision solar
 * position: NOAA-style ecliptic → equatorial reduction) and returns the *day*
 * hemisphere as a single deck.gl polygon ring of [lng, lat] pairs.
 *
 * Antimeridian: every vertex stays within [-180, 180]. The ring follows the
 * terminator west→east, then closes across the top/bottom edge of the map at the
 * lit pole (a horizontal segment along ±90 lat), so it never crosses the
 * antimeridian and needs no longitude wrapping to tessellate cleanly.
 *
 * Adapted from the well-known leaflet-terminator algorithm, inverted to shade
 * the daylight side rather than the night side.
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Julian day from a JS Date. */
function julian(date: Date): number {
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

/** Greenwich mean sidereal time, in hours [0, 24). */
function gmstHours(julianDay: number): number {
  const d = julianDay - 2_451_545.0;
  return ((18.697_374_558 + 24.065_709_824_419_08 * d) % 24 + 24) % 24;
}

/** Apparent ecliptic longitude of the sun, in degrees. */
function sunEclipticLongitude(julianDay: number): number {
  const n = julianDay - 2_451_545.0;
  const meanLong = (280.460 + 0.985_647_4 * n) % 360;
  const meanAnom = ((357.528 + 0.985_600_3 * n) % 360) * DEG;
  return meanLong + 1.915 * Math.sin(meanAnom) + 0.020 * Math.sin(2 * meanAnom);
}

/** Obliquity of the ecliptic, in degrees. */
function eclipticObliquity(julianDay: number): number {
  const t = (julianDay - 2_451_545.0) / 36_525;
  return 23.439_291_11 - t * (46.836_769 / 3600);
}

/** Sun right ascension (alpha) and declination (delta), in degrees. */
function sunEquatorial(eclLng: number, obliquity: number): { alpha: number; delta: number } {
  let alpha = RAD * Math.atan(Math.cos(obliquity * DEG) * Math.tan(eclLng * DEG));
  const delta = RAD * Math.asin(Math.sin(obliquity * DEG) * Math.sin(eclLng * DEG));
  // Put right ascension in the same quadrant as the ecliptic longitude.
  const lngQuadrant = Math.floor(eclLng / 90) * 90;
  const raQuadrant = Math.floor(alpha / 90) * 90;
  alpha += lngQuadrant - raQuadrant;
  return { alpha, delta };
}

/**
 * The daylight hemisphere for `date` as a ring of [lng, lat] pairs, ready to feed
 * a deck.gl SolidPolygonLayer. Longitudes are sampled every `stepDeg` degrees.
 */
export function daylightPolygon(date: Date = new Date(), stepDeg = 1): [number, number][] {
  const jd = julian(date);
  const gst = gmstHours(jd);
  const { alpha, delta } = sunEquatorial(sunEclipticLongitude(jd), eclipticObliquity(jd));

  const ring: [number, number][] = [];
  for (let lng = -180; lng <= 180; lng += stepDeg) {
    const lst = gst + lng / 15; // local sidereal time, hours
    const hourAngle = lst * 15 - alpha; // degrees
    const lat = RAD * Math.atan(-Math.cos(hourAngle * DEG) / Math.tan(delta * DEG));
    ring.push([lng, lat]);
  }

  // Close over the *lit* pole (opposite the pole in polar night): when the sun is
  // south of the equator (delta < 0) the south pole is in daylight, and vice versa.
  const litPole = delta < 0 ? -90 : 90;
  ring.push([180, litPole]);
  ring.push([-180, litPole]);
  return ring;
}
