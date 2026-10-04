import { useEffect, useState } from 'react';
import type { Route } from '../types';
import {
  fetchTrafficForRoute,
  isTrafficEnabled,
  type TrafficReport
} from '../services/traffic';

/** Odświeżanie korków co 5 minut podczas nawigacji. */
const REFRESH_MS = 5 * 60 * 1000;

export function useTraffic(route: Route | null, active: boolean) {
  const [report, setReport] = useState<TrafficReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !route || !isTrafficEnabled) {
      setReport(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const ctrl = new AbortController();

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetchTrafficForRoute(route, ctrl.signal);
        if (cancelled) return;
        if (r) setReport(r);
        else setError('Brak danych o ruchu.');
      } catch {
        if (!cancelled) setError('Nie udało się pobrać danych o ruchu.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    const id = window.setInterval(run, REFRESH_MS);

    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [route?.id, active]);

  return { report, loading, error, enabled: isTrafficEnabled };
}