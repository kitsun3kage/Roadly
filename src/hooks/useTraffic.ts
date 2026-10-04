import { useEffect, useState } from 'react';
import type { Route } from '../types';
import {
  fetchIncidentsForRoute,
  fetchTrafficForRoute,
  isTrafficEnabled,
  type TrafficIncident,
  type TrafficReport
} from '../services/traffic';

/** Odświeżanie co 5 minut podczas nawigacji. */
const REFRESH_MS = 5 * 60 * 1000;

export function useTraffic(route: Route | null, active: boolean) {
  const [report, setReport] = useState<TrafficReport | null>(null);
  const [incidents, setIncidents] = useState<TrafficIncident[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Nie ładuj gdy nieaktywne lub brak trasy/klucza
    if (!route || !isTrafficEnabled) {
      setReport(null);
      setIncidents([]);
      setError(null);
      return;
    }

    let cancelled = false;
    const ctrl = new AbortController();

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [flow, inc] = await Promise.all([
          fetchTrafficForRoute(route, ctrl.signal),
          fetchIncidentsForRoute(route, ctrl.signal)
        ]);
        if (cancelled) return;
        if (flow) setReport(flow);
        else setError('Brak danych o ruchu.');
        setIncidents(inc);
      } catch {
        if (!cancelled) setError('Nie udało się pobrać danych o ruchu.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    const id = active ? window.setInterval(run, REFRESH_MS) : null;

    return () => {
      cancelled = true;
      ctrl.abort();
      if (id) window.clearInterval(id);
    };
  }, [route?.id, active]);

  return { report, incidents, loading, error, enabled: isTrafficEnabled };
}