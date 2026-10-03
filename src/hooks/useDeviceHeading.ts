import { useEffect, useRef, useState } from 'react';

/**
 * Zwraca kierunek patrzenia urządzenia w stopniach (0 = północ) lub null.
 *
 * iOS Safari wymaga zgody użytkownika (DeviceOrientationEvent.requestPermission)
 * i udostępnia dokładny heading przez `webkitCompassHeading`.
 * Android Chrome udostępnia `alpha` (0–360°, przeciwnie do wskazówek zegara),
 * więc przeliczamy go na heading kompasowy.
 */
export function useDeviceHeading(enabled: boolean) {
  const [heading, setHeading] = useState<number | null>(null);
  const listenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  useEffect(() => {
    if (!enabled) {
      setHeading(null);
      return;
    }
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const handler = (e: DeviceOrientationEvent) => {
      const anyE = e as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
        webkitCompassAccuracy?: number;
      };

      // iOS: dokładny heading kompasowy
      if (
        typeof anyE.webkitCompassHeading === 'number' &&
        !Number.isNaN(anyE.webkitCompassHeading)
      ) {
        setHeading(anyE.webkitCompassHeading);
        return;
      }

      // Android: alpha w zakresie [0, 360), gdzie 0 = północ
      // (standard mówi: alpha = 360 - compassHeading)
      if (typeof e.alpha === 'number' && !Number.isNaN(e.alpha)) {
        const h = (360 - e.alpha) % 360;
        setHeading(h);
      }
    };

    listenerRef.current = handler;

    const attach = () => {
      window.addEventListener('deviceorientationabsolute', handler as EventListener);
      window.addEventListener('deviceorientation', handler as EventListener);
    };

    // iOS 13+ wymaga requestPermission w geście użytkownika
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
    };
  }, [enabled]);

  return heading;
}