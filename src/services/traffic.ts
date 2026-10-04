import type { Coordinates, Route } from '../types';
import { closestSegment, distanceMeters } from '../lib/geo';

const TOMTOM_KEY = (import.meta.env.VITE_TOMTOM_API_KEY as string | undefined)?.trim();

export const isTrafficEnabled = Boolean(TOMTOM_KEY);

// ─── Flow (natężenie) ─────────────────────────────────────────────
export interface TrafficSample {
  coordinates: Coordinates;
  currentSpeed: number;
  freeFlowSpeed: number;
  confidence: number;
  roadClosure: boolean;
  congestion: number; // 0= płynnie, 1= korek
}

export interface TrafficReport {
  samples: TrafficSample[];
  averageCongestion: number;
  durationMultiplier: number;
  hasRoadClosure: boolean;
  fetchedAt: number;
}

// ─── Incidents (zdarzenia) ────────────────────────────────────────
export interface TrafficIncident {
  id: string;
  category: number;
  description: string;
  from?: string;
  to?: string;
  roadNumbers: string[];
  delay: number;             // sekundy
  length: number;            // metry
  magnitudeOfDelay: number;  // 0..4
  coordinates: Coordinates;  // reprezentatywny punkt
  distanceFromStart: number;// metry od początku trasy
}

const ICON_BY_CATEGORY: Record<number, string> = {
  0: '❓',
  1: '🚗',
  2: '🌫️',
  3: '⚠️',
  4: '🌧️',
  5: '🚧',
  6: '🚫',
  7: '⚠️',
  8: '💨',
  9: '🌊',
  10: '❄️',
  11: '🚦',
  14: '🔧'
};

const LABEL_BY_CATEGORY: Record<number, string> = {
  0: 'Zdarzenie',
  1: 'Wypadek',
  2: 'Mgła',
  3: 'Niebezpieczeństwo',
  4: 'Deszcz',
  5: 'Roboty drogowe',
  6: 'Zamknięcie drogi',
  7: 'Niebezpieczeństwo',
  8: 'Silny wiatr',
  9: 'Podtopienie',
  10: 'Lód na drodze',
  11: 'Korek',
  14: 'Awaria pojazdu'
};

const COLOR_BY_CATEGORY: Record<number, string> = {
  1: '#dc2626',
  2: '#6b7280',
  3: '#f59e0b',
  4: '#3b82f6',
  5: '#f97316',
  6: '#7f1d1d',
  7: '#f59e0b',
  8: '#0ea5e9',
  9: '#0891b2',
  10: '#06b6d4',
  11: '#b91c1c',
  14: '#8b5cf6'
};

export function incidentIcon(cat: number): string {
  return ICON_BY_CATEGORY[cat] ?? '⚠️';
}
export function incidentLabel(cat: number): string {
  return LABEL_BY_CATEGORY[cat] ?? 'Zdarzenie';
}
export function incidentColor(cat: number): string {
  return COLOR_BY_CATEGORY[cat] ?? '#f59e0b';
}

// ─── Próbkowanie trasy ────────────────────────────────────────────
function samplePoints(route: Route, maxSamples: number): Coordinates[] {
  const g = route.geometry;
  if (g.length < 2) return [];
  const step = Math.max(1, Math.floor(g.length / maxSamples));
  const out: Coordinates[] = [];
  for (let i = 0; i < g.length; i += step) {
    out.push({ lng: g[i][0], lat: g[i][1] });
  }
  return out.slice(0, maxSamples);
}

// ─── Flow Segment Data ────────────────────────────────────────────
async function fetchFlowPoint(
  point: Coordinates,
  signal?: AbortSignal
): Promise<TrafficSample | null> {
  if (!TOMTOM_KEY) return null;
  const url =
    `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json` +
    `?point=${point.lat},${point.lng}&unit=KMPH&key=${TOMTOM_KEY}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const d = data?.flowSegmentData;
    if (!d) return null;
    const currentSpeed = Number(d.currentSpeed) || 0;
    const freeFlowSpeed = Number(d.freeFlowSpeed) || currentSpeed || 1;
    const congestion = freeFlowSpeed > 0
      ? Math.max(0, Math.min(1, 1 - currentSpeed / freeFlowSpeed))
      : 0;
    return {
      coordinates: point,
      currentSpeed,
      freeFlowSpeed,
      confidence: Number(d.confidence) || 0,
      roadClosure: Boolean(d.roadClosure),
      congestion
    };
  } catch {
    return null;
  }
}

export async function fetchTrafficForRoute(
  route: Route,
  signal?: AbortSignal
): Promise<TrafficReport | null> {
  if (!TOMTOM_KEY) return null;
  const points = samplePoints(route, 10);
  if (!points.length) return null;

  const results = await Promise.all(points.map((p) => fetchFlowPoint(p, signal)));
  const samples = results.filter((x): x is TrafficSample => x !== null);
  if (!samples.length) return null;

  const avg = samples.reduce((s, x) => s + x.congestion, 0) / samples.length;

  return {
    samples,
    averageCongestion: avg,
    durationMultiplier: 1 + avg * 1.5,
    hasRoadClosure: samples.some((s) => s.roadClosure),
    fetchedAt: Date.now()
  };
}

// ─── Incident Details ─────────────────────────────────────────────
/**
 * Pobiera zdarzenia z TomTom Incident Details API dla całej trasy.
 * Zwraca listę zdarzeń z przypisaną odległością od startu trasy.
 */
export async function fetchIncidentsForRoute(
  route: Route,
  signal?: AbortSignal
): Promise<TrafficIncident[]> {
  if (!TOMTOM_KEY) return [];
  if (route.geometry.length < 2) return [];

  // bbox z całej geometrii + bufor ~500 m
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of route.geometry) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  const pad = 0.005;
  const bbox = `${minLng - pad},${minLat - pad},${maxLng + pad},${maxLat + pad}`;

  const fields =
    '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,delay,length,from,to,roadNumbers,events{description,iconCategory}}}}';

  const url =
    `https://api.tomtom.com/traffic/services/5/incidentDetails` +
    `?key=${TOMTOM_KEY}` +
    `&bbox=${bbox}` +
    `&language=pl-PL` +
    `&timeValidityFilter=present` +
    `&fields=${encodeURIComponent(fields)}`;

  let data: any;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    data = await res.json();
  } catch {
    return [];
  }

  const incidents: TrafficIncident[] = [];
  const arr = Array.isArray(data?.incidents) ? data.incidents : [];

  for (const inc of arr) {
    try {
      const props = inc.properties ?? {};
      const category = Number(props.iconCategory) || 0;
      const geom = inc.geometry ?? {};
      const type = geom.type;
      const coords = geom.coordinates;

      let repPoint: Coordinates | null = null;
      if (type === 'Point' && Array.isArray(coords) && coords.length >= 2) {
        repPoint = { lng: coords[0], lat: coords[1] };
      } else if (type === 'LineString' && Array.isArray(coords) && coords.length > 0) {
        const mid = coords[Math.floor(coords.length / 2)];
        repPoint = { lng: mid[0], lat: mid[1] };
      }
      if (!repPoint) continue;

      // odległość od startu trasy
      const proj = closestSegment(repPoint, route.geometry);
      let along = 0;
      for (let i = 0; i < proj.segmentIndex; i++) {
        along += distanceMeters(
          { lng: route.geometry[i][0], lat: route.geometry[i][1] },
          { lng: route.geometry[i + 1][0], lat: route.geometry[i + 1][1] }
        );
      }
      along += distanceMeters(
        { lng: route.geometry[proj.segmentIndex][0], lat: route.geometry[proj.segmentIndex][1] },
        repPoint
      );

      // pomijaj zdarzenia bardzo daleko od trasy (> 300 m)
      if (proj.distance > 300) continue;

      const events: any[] = Array.isArray(props.events) ? props.events : [];
      const description =
        events.map((e) => e?.description).filter(Boolean).join(' · ') ||
        incidentLabel(category);

      incidents.push({
        id: String(props.id ?? `${category}-${along}-${repPoint.lat}-${repPoint.lng}`),
        category,
        description,
        from: props.from,
        to: props.to,
        roadNumbers: Array.isArray(props.roadNumbers) ? props.roadNumbers : [],
        delay: Number(props.delay) || 0,
        length: Number(props.length) || 0,
        magnitudeOfDelay: Number(props.magnitudeOfDelay) || 0,
        coordinates: repPoint,
        distanceFromStart: along
      });
    } catch {
      /* ignore pojedyncze */
    }
  }

  // sortuj wg odległości od startu
  incidents.sort((a, b) => a.distanceFromStart - b.distanceFromStart);
  return incidents;
}

// ─── Etykiety korków ──────────────────────────────────────────────
export function congestionLabel(c: number): string {
  if (c < 0.15) return 'Płynnie';
  if (c < 0.35) return 'Umiarkowany';
  if (c < 0.6) return 'Korki';
  return 'Duże korki';
}

/**
 * Kolor linii trasy wg natężenia (0=płynnie, 1=korek).
 * Zielony → żółty → pomarańczowy → czerwony.
 */
export function congestionLineColor(c: number): string {
  if (c < 0.15) return '#16a34a';       // zielony
  if (c < 0.35) return '#facc15';       // żółty
  if (c < 0.6) return '#f97316';        // pomarańczowy
  if (c < 0.85) return '#dc2626';       // czerwony
  return '#7f1d1d';                     // ciemny czerwony (korek)
}