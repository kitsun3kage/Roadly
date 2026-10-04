import { useEffect, useRef, useState } from 'react';
import { bearingDelta } from '../lib/geo';

/**
 * Zwraca kąt obrotu ekranu (0, 90, 180, 270).
 * W landscape orientacja ekranu jest obrócona względem "góry telefonu",
 * dlatego trzeba ją skompensować w kompasie.
 */
function getScreenAngle(): number {
  if (typeof window === 'undefined') return 0;
  const s = window.screen as Screen & { orientation?: { angle?: number } };
  const angle = s.orientation?.angle;
  if (typeof angle === 'number' && !Number.isNaN(angle)) return angle;
  // Fallback dla starszych przeglądarek
  const w = window as unknown as { orientation?: number };
  if (typeof w.orientation === 'number' && !Number.isNaN(w.orientation)) {
    return w.orientation;
  }
  return 0;
}

/**
 * Kompas urządzenia (0 = północ) lub null.
 *
 * - iOS Safari: `webkitCompassHeading` (dokładny).
 * - Android Chrome: `alpha` (0–360°, przeciwnie do wskazówek zegara) → przeliczamy.
 *
 * Do wartości dodajemy:
 *  1. Kąt orientacji ekranu (portrait / landscape / reverse).
 *  2. Kalibrację użytkownika (`offsetDeg`) — do korekty "odwróconej" wskazówki.
 *
 * Wartości są wygładzane wykładniczo (filtr EMA) i emitowane ~30 Hz
 * (wystarczy dla płynności, nie zabija CPU).
 */
export function useDeviceHeading(enabled: boolean, offsetDeg = 0) {
  const [heading, setHeading] = useState<number | null>(null);
  const listenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const smoothedRef = useRef<number | null>(null);
  const lastEmitRef = useRef(0);
  const screenAngleRef = useRef(0);
  const offsetRef = useRef(offsetDeg);

  // Aktualizuj offset bez restartu listenerów
  useEffect(() => {
    offsetRef.current = offsetDeg;
  }, [offsetDeg]);

  useEffect(() => {
    if (!enabled) {
      setHeading(null);
      smoothedRef.current = null;
      return;
    }
    if (typeof window === 'undefined') return;

    let cancelled = false;
    screenAngleRef.current = getScreenAngle();

    const onScreenOrientation = () => {
      screenAngleRef.current = getScreenAngle();
    };
    window.addEventListener('orientationchange', onScreenOrientation);

    const handler = (e: DeviceOrientationEvent) => {
      const anyE = e as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
        webkitCompassAccuracy?: number;
      };

      let base: number | null = null;
      if (
        typeof anyE.webkitCompassHeading === 'number' &&
        !Number.isNaN(anyE.webkitCompassHeading)
      ) {
        base = anyE.webkitCompassHeading;
      } else if (typeof e.alpha === 'number' && !Number.isNaN(e.alpha)) {
        base = (360 - e.alpha) % 360;
      }
      if (base == null) return;

      // Kompensacja orientacji ekranu + kalibracja użytkownika
      const corrected =
        (((base + screenAngleRef.current + offsetRef.current) % 360) + 360) % 360;

      // Filtr EMA — wygładzenie
      const prev = smoothedRef.current;
      const ALPHA = 0.22;
      const next =
        prev == null ? corrected : prev + bearingDelta(prev, corrected) * ALPHA;
      smoothedRef.current = next;

      // Throttle emisji do ~30 Hz
      const now = performance.now();
      if (now - lastEmitRef.current < 33) return;
      lastEmitRef.current = now;
      setHeading(next);
    };

    listenerRef.current = handler;

    const attach = () => {
      window.addEventListener('deviceorientationabsolute', handler as EventListener);
      window.addEventListener('deviceorientation', handler as EventListener);
    };

    const anyDOE = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<'granted' | 'denied'>;
        })
      | undefined;

    if (anyDOE && typeof anyDOE.requestPermission === 'function') {
      anyDOE
        .requestPermission()
        .then((res) => {
          if (cancelled) return;
          if (res === 'granted') attach();
        })
        .catch(() => {
          /* ignore */
        });
    } else {
      attach();
    }

    return () => {
      cancelled = true;
      window.removeEventListener('orientationchange', onScreenOrientation);
      const h = listenerRef.current;
      if (h) {
        window.removeEventListener('deviceorientationabsolute', h as EventListener);
        window.removeEventListener('deviceorientation', h as EventListener);
      }
      listenerRef.current = null;
      smoothedRef.current = null;
    };
  }, [enabled]);

  return heading;
}