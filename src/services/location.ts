import type { Coordinates } from '../types';

export interface LocationResult {
  coordinates: Coordinates;
  accuracy: number;
  timestamp: number;
  /** Kierunek ruchu w stopniach (0 = północ). null gdy brak danych. */
  heading: number | null;
  /** Prędkość w m/s, jeśli dostępna. */
  speed: number | null;
}

export type GeolocationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported' | 'unknown';

export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

export function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

export async function getGeolocationPermission(): Promise<GeolocationPermission> {
  if (!isGeolocationSupported()) return 'unsupported';
  const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
  if (!perms || typeof perms.query !== 'function') return 'unknown';
  try {
    const status = await perms.query({ name: 'geolocation' as PermissionName });
    return (status.state as GeolocationPermission) ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function getPositionOnce(options: PositionOptions): Promise<LocationResult> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toLocationResult(pos)),
      (err) => reject(err),
      options
    );
  });
}

function toLocationResult(pos: GeolocationPosition): LocationResult {
  const c = pos.coords as GeolocationCoordinates & { heading?: number | null; speed?: number | null };
  const heading =
    typeof c.heading === 'number' && !Number.isNaN(c.heading) && c.heading >= 0
      ? c.heading
      : null;
  const speed =
    typeof c.speed === 'number' && !Number.isNaN(c.speed) && c.speed >= 0 ? c.speed : null;

  return {
    coordinates: { lat: c.latitude, lng: c.longitude },
    accuracy: c.accuracy,
    timestamp: pos.timestamp,
    heading,
    speed
  };
}

export async function getCurrentLocation(options?: PositionOptions): Promise<LocationResult> {
  if (!isGeolocationSupported()) {
    throw new Error('Geolokalizacja nie jest wspierana w tej przeglądarce.');
  }
  if (!isSecureContext()) {
    throw new Error(
      'Geolokalizacja wymaga połączenia HTTPS (lub localhost). Otwórz aplikację przez bezpieczne połączenie.'
    );
  }

  const permission = await getGeolocationPermission();
  if (permission === 'denied') {
    throw new Error(
      'Dostęp do lokalizacji został zablokowany. Kliknij ikonę zamka w pasku adresu i zezwól na lokalizację dla tej strony.'
    );
  }

  const attempts: PositionOptions[] = [
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000, ...options },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 },
    { enableHighAccuracy: false, timeout: 20000, maximumAge: 600000 }
  ];

  let lastError: unknown = null;

  for (let i = 0; i < attempts.length; i++) {
    try {
      return await getPositionOnce(attempts[i]);
    } catch (err) {
      lastError = err;
      const code = (err as GeolocationPositionError).code;
      const currentPerm = await getGeolocationPermission();
      if (currentPerm === 'denied') {
        throw new Error(
          'Dostęp do lokalizacji został zablokowany. Kliknij ikonę zamka w pasku adresu i zezwól na lokalizację dla tej strony.'
        );
      }
      if (code === 2) {
        throw new Error(
          'Lokalizacja jest chwilowo niedostępna. Sprawdź, czy Wi-Fi / GPS są włączone, i spróbuj ponownie.'
        );
      }
      if (i < attempts.length - 1) {
        await new Promise((r) => setTimeout(r, 400 + i * 300));
      }
    }
  }

  const code = (lastError as GeolocationPositionError | undefined)?.code;
  if (code === 1) {
    throw new Error(
      'Przeglądarka odrzuciła żądanie lokalizacji, mimo że uprawnienie wygląda na przyznane. Odśwież stronę (F5) i spróbuj ponownie.'
    );
  }
  if (code === 3) {
    throw new Error(
      'Przekroczono czas oczekiwania na lokalizację. Spróbuj ponownie — pierwsze wywołanie w sesji bywa wolne.'
    );
  }
  throw new Error(
    (lastError as Error | undefined)?.message || 'Nie udało się pobrać lokalizacji.'
  );
}

export function watchLocation(
  onUpdate: (loc: LocationResult) => void,
  onError: (err: Error) => void
): () => void {
  if (!isGeolocationSupported()) {
    onError(new Error('Geolokalizacja nie jest wspierana w tej przeglądarce.'));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => onUpdate(toLocationResult(pos)),
    (err) => onError(new Error(describePositionError(err))),
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 2000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}

function describePositionError(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Dostęp do lokalizacji został zablokowany. Kliknij ikonę zamka w pasku adresu i zezwól na lokalizację dla tej strony.';
    case err.POSITION_UNAVAILABLE:
      return 'Lokalizacja jest chwilowo niedostępna. Sprawdź, czy Wi-Fi / GPS są włączone.';
    case err.TIMEOUT:
      return 'Przekroczono czas oczekiwania na lokalizację. Spróbuj ponownie.';
    default:
      return err.message || 'Nieznany błąd lokalizacji.';
  }
}