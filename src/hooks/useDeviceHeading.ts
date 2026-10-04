import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { bearingDelta } from '../lib/geo';

const OFFSET_KEY = 'roadly.compassOffset.v1';

function getScreenAngle(): number {
  if (typeof window === 'undefined') return 0;
  const s = window.screen as Screen & { orientation?: { angle?: number } };
  const angle = s.orientation?.angle;
  if (typeof angle === 'number' && !Number.isNaN(angle)) return angle;
  const w = window as unknown as { orientation?: number };
  if (typeof w.orientation === 'number' && !Number.isNaN(w.orientation)) {
    return w.orientation;
  }
  return 0;
}

interface Options {
  enabled: boolean;
  /** Heading z GPS (0-360) gdy user się porusza, w przeciwnym razie null. */
  gpsHeading?: number | null;
  /** Prędkość GPS (m/s). */
  gpsSpeed?: number | null;
}

interface Result {
  /** Ref z najświeższą wartością — używaj w pętlach rAF bez re-renderów. */
  headingRef: MutableRefObject<number | null>;
  /** Aktualny offset (do UI). */
  offset: number;
  /** Traktuj aktualny kierunek patrzenia jako północ. */
  calibrate: () => void;
  /** Reset kalibracji. */
  reset: () => void;
  /** Ręczne ustawienie offsetu. */
  setOffset: (v: number) => void;
}

export function useDeviceHeading(opts: Options): Result {
  const [offset, setOffsetState] = useState<number>(() => {
    try {
      const v = localStorage.getItem(OFFSET_KEY);
      return v ? Number(v) : 0;
    } catch {
      return 0;
    }
  });

  const headingRef = useRef<number | null>(null);
  const rawRef = useRef<number | null>(null);
  const smoothedRef = useRef<number | null>(null);
  const lastEmitRef = useRef(0);
  const screenAngleRef = useRef(0);

  const offsetRef = useRef(offset);
  const manualOverrideRef = useRef(false);
  const calibSamplesRef = useRef<{ ts: number; delta: number }[]>([]);

  // Persist offset
  useEffect(() => {
    offsetRef.current = offset;
    try {
      localStorage.setItem(OFFSET_KEY, String(Math.round(offset)));
    } catch {
      /* ignore */
    }
  }, [offset]);

  // Screen orientation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const on = () => {
      screenAngleRef.current = getScreenAngle();
    };
    on();
    window.addEventListener('orientationchange', on);
    return () => window.removeEventListener('orientationchange', on);
  }, []);

  // Device orientation listener
  useEffect(() => {
    if (!opts.enabled) {
      headingRef.current = null;
      smoothedRef.current = null;
      return;
    }
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const handler = (e: DeviceOrientationEvent) => {
      const anyE = e as DeviceOrientationEvent & { webkitCompassHeading?: number };

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

      const correctedRaw = (((base + screenAngleRef.current) % 360) + 360) % 360;
      rawRef.current = correctedRaw;

      const corrected = (((correctedRaw + offsetRef.current) % 360) + 360) % 360;

      const prev = smoothedRef.current;
      const ALPHA = 0.3;
      const next = prev == null ? corrected : prev + bearingDelta(prev, corrected) * ALPHA;
      smoothedRef.current = next;
      headingRef.current = next;

      const now = performance.now();
      lastEmitRef.current = now;
    };

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
      const h = handler;
      window.removeEventListener('deviceorientationabsolute', h as EventListener);
      window.removeEventListener('deviceorientation', h as EventListener);
      headingRef.current = null;
      smoothedRef.current = null;
    };
  }, [opts.enabled]);

  // ─── Auto-kalibracja z GPS ────────────────────────────────────────
  useEffect(() => {
    if (!opts.enabled) return;
    if (manualOverrideRef.current) return;
    if (opts.gpsHeading == null) return;
    if (opts.gpsSpeed == null || opts.gpsSpeed < 1.5) return;
    if (rawRef.current == null) return;

    const delta = bearingDelta(rawRef.current, opts.gpsHeading);
    const now = Date.now();
    const samples = calibSamplesRef.current;
    samples.push({ ts: now, delta });

    // Utrzymuj ostatnie 15 s
    while (samples.length > 0 && now - samples[0].ts > 15000) samples.shift();

    if (samples.length >= 6 && now - samples[0].ts >= 5000) {
      const mean = samples.reduce((s, x) => s + x.delta, 0) / samples.length;
      const variance =
        samples.reduce((s, x) => s + (x.delta - mean) ** 2, 0) / samples.length;
      const stdDev = Math.sqrt(variance);

      // Stabilna różnica — dostosuj offset
      if (stdDev < 25 && Math.abs(mean) > 12) {
        const newOffset = offsetRef.current + mean;
        const normalized = ((((newOffset + 180) % 360) + 360) % 360) - 180;
        setOffsetState(Math.round(normalized));
        calibSamplesRef.current = [];
      }
    }
  }, [opts.enabled, opts.moving, opts.gpsHeading, opts.gpsSpeed]);

  const calibrate = useCallback(() => {
    if (rawRef.current == null) return;
    const target = ((((rawRef.current + 180) % 360) + 360) % 360) - 180;
    setOffsetState(-Math.round(target));
    manualOverrideRef.current = true;
    calibSamplesRef.current = [];
  }, []);

  const reset = useCallback(() => {
    setOffsetState(0);
    manualOverrideRef.current = false;
    calibSamplesRef.current = [];
  }, []);

  const setOffset = useCallback((v: number) => {
    setOffsetState(v);
    manualOverrideRef.current = true;
    calibSamplesRef.current = [];
  }, []);

  return { headingRef, offset, calibrate, reset, setOffset };
}