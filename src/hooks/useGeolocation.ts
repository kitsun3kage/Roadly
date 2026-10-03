import { useCallback, useEffect, useRef, useState } from 'react';
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

/**
 * Bearing między dwoma punktami (0–360°, 0 = północ, zgodnie z ruchem wskazówek zegara).
 * Używany gdy `coords.heading` jest niedostępne (np. przy małej prędkości).
 */
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

/** Odległość w metrach (przybliżenie dla małych dystansów). */
function distanceMeters(a: Coordinates, b: Coordinates): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function useGeolocation() {
  const [position, setPosition] = useState<LocationResult | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [watching, setWatching] = useState(false);
  const [permission, setPermission] = useState<GeolocationPermission>('unknown');

  const stopRef = useRef<(() => void) | null>(null);
  const positionRef = useRef<LocationResult | null>(null);
  const permissionRef = useRef<GeolocationPermission>('unknown');

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    permissionRef.current = permission;
  }, [permission]);

  // ─── Sprawdzenie uprawnień + nasłuch zmian ─────────────────────────
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

  // ─── Przetwarzanie pozycji → heading ───────────────────────────────
  const handlePosition = useCallback((loc: LocationResult) => {
    const prev = positionRef.current;
    positionRef.current = loc;
    setPosition(loc);
    setError(null);

    // 1) Preferuj heading z Geolocation API (wiarygodny gdy speed > ~1 m/s)
    if (loc.heading != null && loc.speed != null && loc.speed > 0.5) {
      setHeading(loc.heading);
      return;
    }

    // 2) Fallback: oblicz bearing z dwóch ostatnich pozycji, jeśli przesunął się wystarczająco
    if (prev) {
      const dist = distanceMeters(prev.coordinates, loc.coordinates);
      // Ignoruj mikro-drgania (< 3 m) i stare punkty (> 30 s)
      const dt = (loc.timestamp - prev.timestamp) / 1000;
      if (dist > 3 && dist < 500 && dt > 0 && dt < 30) {
        setHeading(bearingBetween(prev.coordinates, loc.coordinates));
      }
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