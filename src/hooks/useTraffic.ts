import { useEffect, useRef, useState } from 'react';
import type { Route } from '../types';
import {
  fetchIncidentsForRoute,
  fetchTrafficForRoute,
  isTrafficEnabled,
  type TrafficIncident,
  type TrafficReport
} from '../services/traffic';

const REFRESH_MS = 5 * 60 * 1000;
const CACHE_TTL_MS = 4 * 60 * 1000; // trochę krótszy niż refresh

interface CacheEntry {
  report: TrafficReport | null;
  incidents: TrafficIncident[];
  ts: number;
}

const cache = new Map<string, CacheEntry>();

export function useTraffic(route: Route | null, active: boolean) {
  const [report, setReport] = useState<TrafficReport | null>(null);
  const [incidents, setIncidents] = useState<TrafficIncident[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<AbortController | null>(null);

  const routeId = route?.id ?? null;

  useEffect(() => {
    if (!routeId || !route || !isTrafficEnabled) {
      setReport(null);
      setIncidents([]);
      setError(null);
      return;
    }

    // Cache hit?
    const cached = cache.get(routeId);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setReport(cached.report);
      setIncidents(cached.incidents);
      setError(null);
      // Jeśli nie jesteśmy w trybie nawigacji, nie odświeżamy
      if (!active) return;
    }

    inflightRef.current?.abort();
    const ctrl = new AbortController();
    inflightRef.current = ctrl;

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [flow, inc] = await Promise.all([
          fetchTrafficForRoute(route, ctrl.signal),
          fetchIncidentsForRoute(route, ctrl.signal)
        ]);
        if (cancelled) return;
        cache.set(routeId, {
          report: flow,
          incidents: inc,
          ts: Date.now()
        });
        setReport(flow);
        setIncidents(inc);
        if (!flow) setError('Brak danych o ruchu.');
      } catch {
        if (!cancelled) setError('Nie udało się pobrać danych o ruchu.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    // Odświeżaj w tle tylko w trybie nawigacji
    let intervalId: number | null = null;
    if (active) {
      intervalId = window.setInterval(() => {
        // Wymuś pominięcie cache
        cache.delete(routeId);
        void run();
      }, REFRESH_MS);
    }

    return () => {
      cancelled = true;
      ctrl.abort();
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [routeId, active, route]);

  return { report, incidents, loading, error, enabled: isTrafficEnabled };
}