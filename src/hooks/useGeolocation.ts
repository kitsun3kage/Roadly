import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  getCurrentLocation,
  getGeolocationPermission,
  isGeolocationSupported,
  isSecureContext,
  watchLocation,
  type GeolocationPermission,
  type LocationResult
} from '../services/location';
import type { Coordinates } from '../types';

const MIN_MOVE_M = 2;
const MIN_INTERVAL_MS = 900;

function distanceM(a: Coordinates, b: Coordinates): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface GeolocationHook {
  position: LocationResult | null;
  positionRef: MutableRefObject<LocationResult | null>;
  heading: number | null;
  error: string | null;
  loading: boolean;
  watching: boolean;
  permission: GeolocationPermission;
  supported: boolean;
  secure: boolean;
  request: () => Promise<LocationResult | null>;
  ensurePosition: () => Promise<LocationResult | null>;
  startWatch: () => void;
  stopWatch: () => void;
}

export function useGeolocation(): GeolocationHook {
  const [position, setPosition] = useState<LocationResult | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [watching, setWatching] = useState(false);
  const [permission, setPermission] = useState<GeolocationPermission>('unknown');

  const stopRef = useRef<(() => void) | null>(null);
  const positionRef = useRef<LocationResult | null>(null);
  const permissionRef = useRef<GeolocationPermission>('unknown');
  const lastEmitTsRef = useRef(0);

  useEffect(() => {
    permissionRef.current = permission;
  }, [permission]);

  // ─── Uprawnienia ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    getGeolocationPermission().then((p) => {
      if (!cancelled) setPermission(p);
    });

    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    let status: PermissionStatus | null = null;
    const handler = () => {
      if (status) setPermission(status.state as GeolocationPermission);
    };

    if (perms && typeof perms.query === 'function') {
      perms
        .query({ name: 'geolocation' as PermissionName })
        .then((s) => {
          if (cancelled) return;
          status = s;
          setPermission(s.state as GeolocationPermission);
          s.addEventListener?.('change', handler);
        })
        .catch(() => {
          /* ignore */
        });
    }

    return () => {
      cancelled = true;
      if (status) status.removeEventListener?.('change', handler);
    };
  }, []);

  // ─── Przetwarzanie pozycji: throttling + stabilizacja ───────────
  const handlePosition = useCallback((loc: LocationResult) => {
    const prev = positionRef.current;
    const now = performance.now();

    // 1) Stabilizacja po dystansie — ignoruj mikro-drgania GPS
    if (prev) {
      const moved = distanceM(prev.coordinates, loc.coordinates);
      const dHeading = loc.heading != null && prev.heading != null
        ? Math.abs(loc.heading - prev.heading)
        : 999;
      // Jeśli prawie stoimy i heading się nie zmienił, pomijamy
      if (moved < MIN_MOVE_M && dHeading < 5 && Math.abs(loc.accuracy - prev.accuracy) < 5) {
        return;
      }
    }

    // 2) Throttling czasowy — nie częściej niż ~1 Hz
    if (now - lastEmitTsRef.current < MIN_INTERVAL_MS) {
      return;
    }
    lastEmitTsRef.current = now;

    // 3) Zapis w ref (dla konsumentów którzy nie chcą re-renderów)
    positionRef.current = loc;

    // 4) setState tylko gdy naprawdę trzeba
    setPosition(loc);
    setError(null);

    // Heading z GPS — preferuj z Geolocation API
    if (loc.heading != null && loc.speed != null && loc.speed > 0.5) {
      setHeading(loc.heading);
    }
  }, []);

  // ─── AUTO-WATCH ────────────────────────────────────────────────────
  useEffect(() => {
    if (permission !== 'granted') return;
    if (stopRef.current) return;
    if (!isGeolocationSupported() || !isSecureContext()) return;

    stopRef.current = watchLocation(
      (loc) => handlePosition(loc),
      (err) => {
        if (!positionRef.current) setError(err.message);
      }
    );
    setWatching(true);

    return () => {
      if (stopRef.current) {
        stopRef.current();
        stopRef.current = null;
        setWatching(false);
      }
    };
  }, [permission, handlePosition]);

  const request = useCallback(async (): Promise<LocationResult | null> => {
    setLoading(true);
    setError(null);

    if (!isGeolocationSupported()) {
      setError('Geolokalizacja nie jest wspierana w tej przeglądarce.');
      setLoading(false);
      return null;
    }
    if (!isSecureContext()) {
      setError('Geolokalizacja wymaga HTTPS (lub localhost).');
      setLoading(false);
      return null;
    }

    const current = await getGeolocationPermission();
    setPermission(current);

    if (current === 'denied') {
      setError(
        'Dostęp do lokalizacji jest zablokowany. Kliknij ikonę zamka w pasku adresu i zezwól na lokalizację, a następnie odśwież stronę.'
      );
      setLoading(false);
      return null;
    }

    try {
      const loc = await getCurrentLocation();
      handlePosition(loc);
      const after = await getGeolocationPermission();
      setPermission(after);
      return loc;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      const after = await getGeolocationPermission();
      setPermission(after);
      return null;
    } finally {
      setLoading(false);
    }
  }, [handlePosition]);

  const ensurePosition = useCallback(async (): Promise<LocationResult | null> => {
    if (positionRef.current) return positionRef.current;
    return await request();
  }, [request]);

  const startWatch = useCallback(() => {
    if (stopRef.current) return;
    if (permissionRef.current !== 'granted') {
      void request();
      return;
    }
    stopRef.current = watchLocation(
      (loc) => handlePosition(loc),
      (err) => setError(err.message)
    );
    setWatching(true);
  }, [handlePosition, request]);

  const stopWatch = useCallback(() => {
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
    }
    setWatching(false);
  }, []);

  useEffect(() => {
    return () => {
      if (stopRef.current) stopRef.current();
    };
  }, []);

  return {
    position,
    positionRef,
    heading,
    error,
    loading,
    watching,
    permission,
    supported: isGeolocationSupported(),
    secure: isSecureContext(),
    request,
    ensurePosition,
    startWatch,
    stopWatch
  };
}