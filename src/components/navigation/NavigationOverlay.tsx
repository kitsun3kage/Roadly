import { memo, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Locate,
  Navigation as NavIcon,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import type { Coordinates, Route, RouteStep } from '../../types';
import { formatDistance, formatDuration, formatETA } from '../../lib/utils';
import {
  closestSegment,
  distanceMeters,
  remainingDistanceAlongRoute
} from '../../lib/geo';
import { useVoiceGuidance } from '../../hooks/useVoiceGuidance';
import type { TrafficIncident, TrafficReport } from '../../services/traffic';

interface Props {
  route: Route;
  userLocation: Coordinates | null;
  onExit: () => void;
  onRecenter: () => void;
  geoError: string | null;
  hasArrived: boolean;
  destinationName: string | null;
  traffic: TrafficReport | null;
  incidents: TrafficIncident[];
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  upcomingIncident: { id: string; description: string; distance: number } | null;
}

interface NavState {
  step: RouteStep | null;
  stepIndex: number;
  distanceToManeuver: number;
  remainingM: number;
  remainingS: number;
}

function computeNavState(route: Route, user: Coordinates | null): NavState {
  if (!user || route.geometry.length < 2) {
    const first = route.steps[0] ?? null;
    return {
      step: first,
      stepIndex: 0,
      distanceToManeuver: first?.distance ?? 0,
      remainingM: route.distance,
      remainingS: route.duration
    };
  }

  const userProj = closestSegment(user, route.geometry);

  let step: RouteStep | null = null;
  let stepIndex = route.steps.length - 1;
  let bestDist = Infinity;

  for (let i = 1; i < route.steps.length; i++) {
    const s = route.steps[i];
    const mProj = closestSegment(s.maneuver.location, route.geometry);
    if (mProj.segmentIndex < userProj.segmentIndex) continue;
    const d = distanceMeters(user, s.maneuver.location);
    if (d < bestDist) {
      bestDist = d;
      step = s;
      stepIndex = i;
    }
  }

  if (!step) {
    step = route.steps[route.steps.length - 1] ?? null;
    bestDist = 0;
  }

  const remainingM = remainingDistanceAlongRoute(user, route.geometry);
  const remainingS =
    route.distance > 0 ? (remainingM / route.distance) * route.duration : 0;

  return {
    step,
    stepIndex,
    distanceToManeuver: bestDist,
    remainingM,
    remainingS
  };
}

function formatManeuverDistance(m: number): string {
  if (m < 10) return `za ${Math.max(0, Math.round(m))} m`;
  if (m < 100) return `za ${Math.round(m / 10) * 10} m`;
  if (m < 1000) return `za ${Math.round(m / 50) * 50} m`;
  return `za ${(m / 1000).toFixed(1)} km`;
}

function NavigationOverlayInner({
  route,
  userLocation,
  onExit,
  onRecenter,
  geoError,
  hasArrived,
  destinationName,
  traffic,
  incidents,
  voiceEnabled,
  onToggleVoice,
  upcomingIncident
}: Props) {
  const nav = useMemo(() => computeNavState(route, userLocation), [route, userLocation]);

  useVoiceGuidance({
    active: !hasArrived,
    enabled: voiceEnabled,
    stepIndex: nav.stepIndex,
    instruction: nav.step?.instruction ?? '',
    distanceToManeuver: nav.distanceToManeuver,
    hasArrived,
    upcomingIncident
  });

  const remainingS = traffic
    ? nav.remainingS * traffic.durationMultiplier
    : nav.remainingS;

  const incidentCount = incidents.length;

  return (
    <>
      {hasArrived ? (
        <div className="nav-arrived" role="status" aria-live="polite">
          <div className="nav-arrived__icon" aria-hidden>
            <CheckCircle2 size={34} />
          </div>
          <div className="nav-arrived__title">Jesteś u celu</div>
          {destinationName && <div className="nav-arrived__sub">{destinationName}</div>}
          <button type="button" className="btn btn--primary" onClick={onExit}>
            Zakończ nawigację
          </button>
        </div>
      ) : (
        <div className="nav-banner" role="status" aria-live="polite">
          <div className="nav-banner__icon" aria-hidden>
            <NavIcon size={22} />
          </div>
          <div className="nav-banner__body">
            <div className="nav-banner__instruction">
              {nav.step?.instruction ?? 'Kontynuuj trasę'}
            </div>
            <div className="nav-banner__meta">
              {nav.step ? formatManeuverDistance(nav.distanceToManeuver) : ''}
              {!userLocation && ' · oczekiwanie na GPS…'}
              {geoError && ` · ${geoError}`}
            </div>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label={voiceEnabled ? 'Wycisz nawigację głosową' : 'Włącz nawigację głosową'}
            onClick={onToggleVoice}
          >
            {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="Zakończ nawigację"
            onClick={onExit}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {upcomingIncident && upcomingIncident.distance < 1000 && (
        <div className="nav-alert" role="alert">
          <AlertTriangle size={18} />
          <div className="nav-alert__body">
            <div className="nav-alert__title">{upcomingIncident.description}</div>
            <div className="nav-alert__sub">
              za {formatDistance(upcomingIncident.distance)}
            </div>
          </div>
        </div>
      )}

      <div className="nav-progress">
        <div className="nav-progress__card">
          <div className="nav-stat">
            <span className="nav-stat__value">{formatDistance(nav.remainingM)}</span>
            <span className="nav-stat__label">Pozostało</span>
          </div>
          <div className="nav-stat">
            <span className="nav-stat__value">{formatDuration(remainingS)}</span>
            <span className="nav-stat__label">Czas</span>
          </div>
          <div className="nav-stat">
            <span className="nav-stat__value">{formatETA(remainingS)}</span>
            <span className="nav-stat__label">Przyjazd</span>
          </div>
          {incidentCount > 0 && (
            <div className="nav-stat nav-stat--incidents" title="Zdarzenia na trasie">
              <AlertTriangle size={14} />
              <span className="nav-stat__label nav-stat__label--inline">
                {incidentCount}
              </span>
            </div>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="Wyśrodkuj na mojej pozycji"
            onClick={onRecenter}
          >
            <Locate size={18} />
          </button>
        </div>
      </div>
    </>
  );
}

export default memo(NavigationOverlayInner);