import { useEffect, useState } from 'react';
import { Locate, Navigation as NavIcon, X } from 'lucide-react';
import type { Coordinates, Route } from '../../types';
import { formatDistance, formatDuration, formatETA } from '../../lib/utils';

interface Props {
  route: Route;
  userLocation: Coordinates | null;
  onExit: () => void;
  onRecenter: () => void;
  geoError: string | null;
  is3D: boolean;
  onToggle3D: () => void;
}

interface Progress {
  remainingDistance: number;
  remainingDuration: number;
  nextStepIndex: number;
  distanceToRoute: number;
}

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function computeProgress(route: Route, user: Coordinates): Progress {
  const coords = route.geometry;
  if (coords.length < 2) {
    return {
      remainingDistance: route.distance,
      remainingDuration: route.duration,
      nextStepIndex: 0,
      distanceToRoute: Infinity
    };
  }

  let best = { idx: 0, t: 0, dist: Infinity };
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) {
      t = ((user.lng - x1) * dx + (user.lat - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
    }
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    const d = Math.hypot(user.lng - px, user.lat - py);
    if (d < best.dist) best = { idx: i, t, dist: d };
  }

  const startPt: [number, number] = [
    coords[best.idx][0] + best.t * (coords[best.idx + 1][0] - coords[best.idx][0]),
    coords[best.idx][1] + best.t * (coords[best.idx + 1][1] - coords[best.idx][1])
  ];
  let remaining = haversine(startPt, coords[best.idx + 1]);
  for (let i = best.idx + 1; i < coords.length - 1; i++) {
    remaining += haversine(coords[i], coords[i + 1]);
  }

  let nextStepIndex = route.steps.length - 1;
  for (let i = 0; i < route.steps.length; i++) {
    const loc = route.steps[i].maneuver.location;
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let j = 0; j < coords.length; j++) {
      const d = Math.hypot(coords[j][0] - loc.lng, coords[j][1] - loc.lat);
      if (d < closestDist) {
        closestDist = d;
        closestIdx = j;
      }
    }
    if (closestIdx > best.idx) {
      nextStepIndex = i;
      break;
    }
  }

  const remainingDuration =
    route.distance > 0 ? (remaining / route.distance) * route.duration : 0;

  return {
    remainingDistance: remaining,
    remainingDuration,
    nextStepIndex,
    distanceToRoute: best.dist * 111320
  };
}

export default function NavigationOverlay({
  route,
  userLocation,
  onExit,
  onRecenter,
  geoError,
  is3D,
  onToggle3D
}: Props) {
  const fallback: Coordinates = userLocation ?? {
    lat: route.geometry[0]?.[1] ?? 0,
    lng: route.geometry[0]?.[0] ?? 0
  };
  const [progress, setProgress] = useState<Progress>(() => computeProgress(route, fallback));

  useEffect(() => {
    if (!userLocation) return;
    setProgress(computeProgress(route, userLocation));
  }, [route, userLocation]);

  const nextStep =
    route.steps[progress.nextStepIndex] ?? route.steps[route.steps.length - 1];

  return (
    <>
      <div className="nav-banner" role="status" aria-live="polite">
        <div className="nav-banner__icon" aria-hidden>
          <NavIcon size={22} />
        </div>
        <div className="nav-banner__body">
          <div className="nav-banner__instruction">
            {nextStep?.instruction ?? 'Kontynuuj trasę'}
          </div>
          <div className="nav-banner__meta">
            {nextStep ? `za ${formatDistance(nextStep.distance)}` : ''}
            {!userLocation && ' · oczekiwanie na GPS…'}
            {geoError && ` · ${geoError}`}
          </div>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          aria-label="Zakończ nawigację"
          onClick={onExit}
        >
          <X size={18} />
        </button>
      </div>

      <button
        type="button"
        className="nav-3d-toggle"
        onClick={onToggle3D}
        aria-label={is3D ? 'Przełącz na widok 2D' : 'Przełącz na widok 3D'}
        title={is3D ? 'Widok 2D' : 'Widok 3D'}
      >
        {is3D ? '2D' : '3D'}
      </button>

      <div className="nav-progress">
        <div className="nav-progress__card">
          <div className="nav-stat">
            <span className="nav-stat__value">
              {formatDistance(progress.remainingDistance)}
            </span>
            <span className="nav-stat__label">Pozostało</span>
          </div>
          <div className="nav-stat">
            <span className="nav-stat__value">
              {formatDuration(progress.remainingDuration)}
            </span>
            <span className="nav-stat__label">Czas</span>
          </div>
          <div className="nav-stat">
            <span className="nav-stat__value">{formatETA(progress.remainingDuration)}</span>
            <span className="nav-stat__label">Przyjazd</span>
          </div>
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