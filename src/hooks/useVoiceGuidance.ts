import { useEffect, useRef } from 'react';
import { speak, stopSpeaking } from '../services/speech';

interface Params {
  active: boolean;
  enabled: boolean;
  stepIndex: number;
  instruction: string;
  distanceToManeuver: number;
  hasArrived: boolean;
}

/** Progi malejąco. Wypowiadamy przy przejściu z góry na dół. */
const THRESHOLDS = [800, 400, 200, 100, 50, 20];

/**
 * Zwraca próg, w którym aktualnie jesteśmy (największy próg ≥ distance),
 * albo null jeśli jesteśmy dalej niż 800 m.
 */
function bandOf(distance: number): number | null {
  if (!isFinite(distance) || distance < 0) return null;
  for (const t of THRESHOLDS) {
    if (distance <= t) return t;
  }
  return null;
}

function ttsText(distance: number, instruction: string): string {
  if (distance >= 1000) {
    return `Za ${(distance / 1000).toFixed(1)} kilometra. ${instruction}`;
  }
  if (distance <= 20) {
    return `Teraz. ${instruction}`;
  }
  return `Za ${Math.round(distance)} metrów. ${instruction}`;
}

export function useVoiceGuidance({
  active,
  enabled,
  stepIndex,
  instruction,
  distanceToManeuver,
  hasArrived
}: Params) {
  const highestAnnouncedRef = useRef<number>(-1);
  const lastBandRef = useRef<number | null>(null);
  const arrivedRef = useRef(false);

  // Wyłączenie / restart
  useEffect(() => {
    if (!active || !enabled) {
      stopSpeaking();
    }
    if (!active) {
      highestAnnouncedRef.current = -1;
      lastBandRef.current = null;
      arrivedRef.current = false;
    }
  }, [active, enabled]);

  // Ogłaszanie kroków i progów
  useEffect(() => {
    if (!active || !enabled) return;
    if (!instruction) return;

    const dist = isFinite(distanceToManeuver) ? distanceToManeuver : 0;

    // ── Nowy krok: ogłaszamy raz, tylko gdy idziemy do przodu ──
    if (stepIndex > highestAnnouncedRef.current) {
      highestAnnouncedRef.current = stepIndex;
      lastBandRef.current = bandOf(dist);
      speak(ttsText(Math.round(dist), instruction), { interrupt: true });
      return;
    }

    // ── Ten sam krok: sprawdzamy przejście progu w dół ──
    const band = bandOf(dist);
    if (
      band !== null &&
      (lastBandRef.current === null || band < lastBandRef.current)
    ) {
      lastBandRef.current = band;
      speak(ttsText(band, instruction), { interrupt: false });
    } else if (band === null && lastBandRef.current !== null) {
      // Zwiększyliśmy dystans ponad najwyższy próg (np. po zawróceniu)
      lastBandRef.current = null;
    }
  }, [active, enabled, stepIndex, instruction, distanceToManeuver]);

  // Dojazd
  useEffect(() => {
    if (!active || !enabled) return;
    if (hasArrived && !arrivedRef.current) {
      arrivedRef.current = true;
      speak('Dojechałeś do celu.', { interrupt: true });
    }
  }, [active, enabled, hasArrived]);
}