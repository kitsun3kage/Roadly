import type { Coordinates } from '../types';

export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearingBetween(a: Coordinates, b: Coordinates): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(b.lng - a.lng);
  const y = Math.sin(dLon) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function bearingDelta(from: number, to: number): number {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export interface SegmentProjection {
  /** Indeks segmentu w łamanej (0..len-2). */
  segmentIndex: number;
  /** Parametr w segmencie 0..1 (0 = początek segmentu). */
  t: number;
  /** Odległość punktu od rzutu (metry). */
  distance: number;
}

export function closestSegment(
  point: Coordinates,
  polyline: [number, number][]
): SegmentProjection {
  if (polyline.length < 2) {
    return { segmentIndex: 0, t: 0, distance: Infinity };
  }
  const toRad = (d: number) => (d * Math.PI) / 180;
  const cosLat = Math.cos(toRad(point.lat));
  let best: SegmentProjection = { segmentIndex: 0, t: 0, distance: Infinity };

  for (let i = 0; i < polyline.length - 1; i++) {
    const [x1, y1] = polyline[i];
    const [x2, y2] = polyline[i + 1];
    const dx = (x2 - x1) * cosLat;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) {
      const px = (point.lng - x1) * cosLat;
      const py = point.lat - y1;
      t = (px * dx + py * dy) / len2;
      t = Math.max(0, Math.min(1, t));
    }
    const projX = x1 + (x2 - x1) * t;
    const projY = y1 + (y2 - y1) * t;
    const d = distanceMeters(point, { lng: projX, lat: projY });
    if (d < best.distance) {
      best = { segmentIndex: i, t, distance: d };
    }
  }
  return best;
}

export function distanceToPolyline(
  point: Coordinates,
  polyline: [number, number][]
): number {
  return closestSegment(point, polyline).distance;
}

export function remainingDistanceAlongRoute(
  point: Coordinates,
  polyline: [number, number][]
): number {
  if (polyline.length < 2) return 0;
  const { segmentIndex, t } = closestSegment(point, polyline);
  const seg = (i: number) =>
    distanceMeters(
      { lng: polyline[i][0], lat: polyline[i][1] },
      { lng: polyline[i + 1][0], lat: polyline[i + 1][1] }
    );
  let remaining = seg(segmentIndex) * (1 - t);
  for (let i = segmentIndex + 1; i < polyline.length - 1; i++) remaining += seg(i);
  return remaining;
}