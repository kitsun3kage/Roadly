import type { Coordinates, Route, RouteStep, TravelProfile } from '../types';

/**
 * Publiczne demo OSRM (router.project-osrm.org) odpowiada danymi samochodowymi
 * na wszystkie profile. Dlatego używamy serwera FOSSGIS routing.openstreetmap.de,
 * który ma osobne grafy dla car / bike / foot.
 *
 * Profil rowerowy omija autostrady i drogi ekspresowe, preferuje ścieżki rowerowe.
 * Profil pieszy preferuje chodniki, ścieżki i przejścia dla pieszych.
 */
const PROFILE_ENDPOINTS: Record<
  TravelProfile,
  { base: string; path: string }
> = {
  driving: {
    base: 'https://routing.openstreetmap.de/routed-car',
    path: 'driving'
  },
  cycling: {
    base: 'https://routing.openstreetmap.de/routed-bike',
    path: 'cycling'
  },
  walking: {
    base: 'https://routing.openstreetmap.de/routed-foot',
    path: 'walking'
  }
};

const MANEUVER_LABELS: Record<string, string> = {
  turn: 'Skręć',
  'new name': 'Kontynuuj',
  depart: 'Rozpocznij',
  arrive: 'Dotrzyj do celu',
  merge: 'Włącz się do ruchu',
  'on ramp': 'Wjazd na drogę',
  'off ramp': 'Zjazd',
  fork: 'Na rozwidleniu',
  'end of road': 'Koniec drogi',
  continue: 'Kontynuuj',
  roundabout: 'Wjedź na rondo',
  rotary: 'Wjedź na rondo',
  'roundabout turn': 'Na rondzie',
  notification: 'Uwaga'
};

const MODIFIER_LABELS: Record<string, string> = {
  left: 'w lewo',
  right: 'w prawo',
  'slight left': 'lekko w lewo',
  'slight right': 'lekko w prawo',
  'sharp left': 'ostro w lewo',
  'sharp right': 'ostro w prawo',
  straight: 'prosto',
  uturn: 'zawróć'
};

function buildInstruction(step: any): string {
  const type = step?.maneuver?.type || 'continue';
  const modifier = step?.maneuver?.modifier;
  const roadName = step?.name ? ` w ${step.name}` : '';
  const base = MANEUVER_LABELS[type] || 'Kontynuuj';
  if (modifier && MODIFIER_LABELS[modifier]) {
    return `${base} ${MODIFIER_LABELS[modifier]}${roadName}`;
  }
  return `${base}${roadName}`;
}

export async function calculateRoute(
  from: Coordinates,
  to: Coordinates,
  profile: TravelProfile = 'driving',
  signal?: AbortSignal,
  alternatives = true
): Promise<Route[]> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const cfg = PROFILE_ENDPOINTS[profile];

  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    steps: 'true',
    alternatives: alternatives ? 'true' : 'false'
  });

  const url = `${cfg.base}/route/v1/${cfg.path}/${coords}?${params.toString()}`;
  const res = await fetch(url, { signal });

  if (!res.ok) {
    throw new Error(`Nie udało się obliczyć trasy (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as any;
  if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
    throw new Error(
      data.message ||
        'Nie znaleziono trasy dla podanych punktów. Spróbuj innego punktu startu lub celu.'
    );
  }

  const now = Date.now();
  return data.routes.map((r: any, idx: number): Route => {
    const steps: RouteStep[] = (r.legs?.[0]?.steps || []).map((s: any) => ({
      instruction: buildInstruction(s),
      distance: s.distance ?? 0,
      duration: s.duration ?? 0,
      maneuver: {
        type: s?.maneuver?.type || 'continue',
        modifier: s?.maneuver?.modifier,
        location: {
          lng: s?.maneuver?.location?.[0] ?? 0,
          lat: s?.maneuver?.location?.[1] ?? 0
        }
      },
      geometry: (s?.geometry?.coordinates as [number, number][]) || []
    }));

    return {
      id: `route-${now}-${idx}`,
      distance: r.distance ?? 0,
      duration: r.duration ?? 0,
      geometry: (r.geometry?.coordinates as [number, number][]) || [],
      profile,
      steps
    };
  });
}