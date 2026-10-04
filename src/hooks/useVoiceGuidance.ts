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

/**
 * Progi, przy których wypowiadamy komunikat. Malejąco.
 * Wypowiedź następuje raz na próg na dany krok.
 */
const THRESHOLDS = [800, 400, 200, 100, 50, 20];

function ttsText(distance: number, instruction: string): string {
  if (distance > 1000) return `Za ${(distance / 1000).toFixed(1)} kilometra. ${instruction}`;
  if (distance <= 20) return `Teraz. ${instruction}`;
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
  const lastStepRef = useRef<number>(-1);
  const spokenRef = useRef<Set<number>>(new Set());
  const arrivedRef = useRef(false);

  // Wyłączenie — reset + przerwij mowę
  useEffect(() => {
    if (!active || !enabled) {
      stopSpeaking();
      if (!active) {
        lastStepRef.current = -1;
        spokenRef.current.clear();
        arrivedRef.current = false;
      }
      return;
    }
  }, [active, enabled]);

  // Nowy krok / progi
  useEffect(() => {
    if (!active || !enabled) return;
    if (!instruction) return;

    if (stepIndex !== lastStepRef.current) {
      lastStepRef.current = stepIndex;
      spokenRef.current.clear();
      speak(instruction);
      return;
    }

    for (const t of THRESHOLDS) {
      if (distanceToManeuver <= t && !spokenRef.current.has(t)) {
        spokenRef.current.add(t);
        speak(ttsText(t, instruction), { interrupt: false });
        break;
      }
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