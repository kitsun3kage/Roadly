import { useEffect, useRef, useState } from 'react';
import { bearingDelta } from '../lib/geo';

/**
 * Kompas urządzenia (0 = północ) lub null.
 *
 * - iOS Safari: `webkitCompassHeading` (dokładny, wymaga zgody przez requestPermission).
 * - Android Chrome: `alpha` (0–360°, przeciwnie do wskazówek zegara) → przeliczamy.
 *
 * Wartości są wygładzane wykładniczo (filtr EMA), żeby strzałka nie drgała.
 * Aktualizacje ograniczone do ~10 Hz (wystarczy dla płynności, nie zabija CPU).
 */
export function useDeviceHeading(enabled: boolean) {
  const [heading, setHeading] = useState<number | null>(null);
  const listenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const smoothedRef = useRef<number | null>(null);
  const lastEmitRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setHeading(null);
      smoothedRef.current = null;
      return;
    }
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const handler = (e: DeviceOrientationEvent) => {
      const anyE = e as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
      };

      let raw: number | null = null;
      if (
        typeof anyE.webkitCompassHeading === 'number' &&
        !Number.isNaN(anyE.webkitCompassHeading)
      ) {
        raw = anyE.webkitCompassHeading;
      } else if (typeof e.alpha === 'number' && !Number.isNaN(e.alpha)) {
        raw = (360 - e.alpha) % 360;
      }
      if (raw == null) return;

      // Filtr EMA: nowe = stare + delta * alpha
      const prev = smoothedRef.current;
      const ALPHA = 0.2;
      const next =
        prev == null ? raw : prev + bearingDelta(prev, raw) * ALPHA;
      smoothedRef.current = next;

      // Throttle emisji do ~10 Hz
      const now = performance.now();
      if (now - lastEmitRef.current < 100) return;
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