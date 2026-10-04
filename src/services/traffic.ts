import type { Coordinates, Route } from '../types';

const TOMTOM_KEY = (import.meta.env.VITE_TOMTOM_API_KEY as string | undefined)?.trim();

/** True tylko gdy klucz TomTom jest ustawiony w .env. */
export const isTrafficEnabled = Boolean(TOMTOM_KEY);

export interface TrafficSample {
  coordinates: Coordinates;
  currentSpeed: number;
  freeFlowSpeed: number;
  confidence: number;
  roadClosure: boolean;
  /** 0 = płynnie, 1 = całkowity korek. */
  congestion: number;
}

export interface TrafficReport {
  samples: TrafficSample[];
  /** Średni współczynnik (0=płynnie, 1=korek). */
  averageCongestion: number;
  /** Mnożnik do czasu trasy (1.0 = brak korków, 2.5 = duże). */
  durationMultiplier: number;
  hasRoadClosure: boolean;
  fetchedAt: number;
}

function samplePoints(route: Route, maxSamples: number): Coordinates[] {
  const geom = route.geometry;
  if (geom.length < 2) return [];
  const step = Math.max(1, Math.floor(geom.length / maxSamples));
  const out: Coordinates[] = [];
  for (let i = 0; i < geom.length; i += step) {
    out.push({ lng: geom[i][0], lat: geom[i][1] });
  }
  return out.slice(0, maxSamples);
}

async function fetchPoint(
  point: Coordinates,
  signal?: AbortSignal
): Promise<TrafficSample | null> {
  if (!TOMTOM_KEY) return null;
  // TomTom Flow Segment Data — zoom 10 (~100 m segment)
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
    const congestion =
      freeFlowSpeed > 0 ? Math.max(0, Math.min(1, 1 - currentSpeed / freeFlowSpeed)) : 0;
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
  if (points.length === 0) return null;

  const results = await Promise.all(points.map((p) => fetchPoint(p, signal)));
  const samples = results.filter((x): x is TrafficSample => x !== null);
  if (samples.length === 0) return null;

  const avg = samples.reduce((s, x) => s + x.congestion, 0) / samples.length;

  return {
    samples,
    averageCongestion: avg,
    durationMultiplier: 1 + avg * 1.5, // korek 100% → ×2.5
    hasRoadClosure: samples.some((s) => s.roadClosure),
    fetchedAt: Date.now()
  };
}

export function congestionLabel(c: number): string {
  if (c < 0.15) return 'Płynnie';
  if (c < 0.35) return 'Umiarkowany';
  if (c < 0.6) return 'Korki';
  return 'Duże korki';
}

export function congestionColor(c: number): string {
  if (c < 0.15) return '#34c759';
  if (c < 0.35) return '#ffcc00';
  if (c < 0.6) return '#ff9500';
  return '#ff3b30';
}