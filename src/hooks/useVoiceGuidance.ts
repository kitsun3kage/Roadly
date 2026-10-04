import { useEffect, useRef } from 'react';
import { speak, stopSpeaking } from '../services/speech';

interface UpcomingIncident {
  id: string;
  description: string;
  distance: number;
}

interface Params {
  active: boolean;
  enabled: boolean;
  stepIndex: number;
  instruction: string;
  distanceToManeuver: number;
  hasArrived: boolean;
  /** Najbliższe zdarzenie przed nami (jeśli w promieniu 500 m). */
  upcomingIncident: UpcomingIncident | null;
}

const THRESHOLDS = [800, 400, 200, 100, 50, 20];
const INCIDENT_WARN_DISTANCE = 500;

function bandOf(distance: number): number | null {
  if (!isFinite(distance) || distance < 0) return null;
  for (const t of THRESHOLDS) {
    if (distance <= t) return t;
  }
  return null;
}

function ttsText(distance: number, instruction: string): string {
  if (distance >= 1000) return `Za ${(distance / 1000).toFixed(1)} kilometra. ${instruction}`;
  if (distance <= 20) return `Teraz. ${instruction}`;
  return `Za ${Math.round(distance)} metrów. ${instruction}`;
}

export function useVoiceGuidance({
  active,
  enabled,
  stepIndex,
  instruction,
  distanceToManeuver,
  hasArrived,
  upcomingIncident
}: Params) {
  const highestAnnouncedRef = useRef<number>(-1);
  const lastBandRef = useRef<number | null>(null);
  const arrivedRef = useRef(false);
  const announcedIncidentsRef = useRef<Set<string>>(new Set());

  // Reset
  useEffect(() => {
    if (!active || !enabled) {
      stopSpeaking();
    }
    if (!active) {
      highestAnnouncedRef.current = -1;
      lastBandRef.current = null;
      arrivedRef.current = false;
      announcedIncidentsRef.current.clear();
    }
  }, [active, enabled]);

  // Manewry
  useEffect(() => {
    if (!active || !enabled) return;
    if (!instruction) return;

    const dist = isFinite(distanceToManeuver) ? distanceToManeuver : 0;

    if (stepIndex > highestAnnouncedRef.current) {
      highestAnnouncedRef.current = stepIndex;
      lastBandRef.current = bandOf(dist);
      speak(ttsText(Math.round(dist), instruction), { interrupt: true });
      return;
    }

    const band = bandOf(dist);
    if (band !== null && (lastBandRef.current === null || band < lastBandRef.current)) {
      lastBandRef.current = band;
      speak(ttsText(band, instruction), { interrupt: false });
    } else if (band === null && lastBandRef.current !== null) {
      lastBandRef.current = null;
    }
  }, [active, enabled, stepIndex, instruction, distanceToManeuver]);

  // Zdarzenia na trasie
  useEffect(() => {
    if (!active || !enabled) return;
    if (!upcomingIncident) return;
    if (upcomingIncident.distance > INCIDENT_WARN_DISTANCE) return;
    if (announcedIncidentsRef.current.has(upcomingIncident.id)) return;

    announcedIncidentsRef.current.add(upcomingIncident.id);
    const dist = Math.round(upcomingIncident.distance / 10) * 10;
    speak(`Uwaga. ${upcomingIncident.description}. Za ${dist} metrów.`, { interrupt: false });
  }, [active, enabled, upcomingIncident]);

  // Dojazd
  useEffect(() => {
    if (!active || !enabled) return;
    if (hasArrived && !arrivedRef.current) {
      arrivedRef.current = true;
      speak('Dojechałeś do celu.', { interrupt: true });
    }
  }, [active, enabled, hasArrived]);
}