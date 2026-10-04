import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import maplibregl, { LngLatBounds, type Map as MLMap } from 'maplibre-gl';
import type { Coordinates, Place, Route } from '../../types';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  FALLBACK_STYLE,
  MAP_STYLES
} from '../../services/maps';
import {
  bearingDelta,
  closestPointOnPolyline,
  closestSegment,
  distanceAlongRouteTo,
  polylineLength
} from '../../lib/geo';
import {
  congestionLineColor,
  incidentColor,
  incidentIcon,
  incidentLabel,
  type TrafficIncident,
  type TrafficReport
} from '../../services/traffic';

export interface MapViewHandle {
  flyTo: (coord: Coordinates, zoom?: number) => void;
  fitBounds: (sw: Coordinates, ne: Coordinates) => void;
  fitRoute: (route: Route) => void;
  resetNorth: () => void;
  set3D: (enabled: boolean) => void;
  is3D: () => boolean;
  getMap: () => MLMap | null;
}

interface Props {
  styleId: string;
  selectedPlace?: Place | null;
  route?: Route | null;
  alternativeRoutes?: Route[];
  userLocation?: Coordinates | null;
  userAccuracy?: number | null;
  userHeading?: number | null;
  fromMarker?: Coordinates | null;
  toMarker?: Coordinates | null;
  savedPlaces?: Place[];
  followUser?: boolean;
  navigationMode?: boolean;
  traffic?: TrafficReport | null;
  incidents?: TrafficIncident[];
}

const ROUTE_SOURCE = 'roadly-route';
const ALT_SOURCE = 'roadly-alt-route';
const PROGRESS_SOURCE = 'roadly-route-progress';

const NAV_ZOOM = 17;
const NAV_PITCH = 60;

const FALLBACK_ROUTE_COLOR = '#ff6b00';
const ROUTE_OUTLINE_COLOR = '#ffffff';
const ROUTE_PROGRESS_COLOR = '#8e8e93';

const ARROW_FILL = '#ff6b00';
const ARROW_STROKE = '#ffffff';

// Wygładzanie — im mniejsze, tym wolniej kamera dogania.
const BEARING_LERP = 0.14;
const CENTER_LERP = 0.16;
const MIN_BEARING_DELTA = 0.05; // poniżej tego progu snapujemy (stopni)

const MapView = forwardRef<MapViewHandle, Props>(function MapView(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const placeMarkerRef = useRef<maplibregl.Marker | null>(null);
  const fromMarkerRef = useRef<maplibregl.Marker | null>(null);
  const toMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userAccMarkerRef = useRef<maplibregl.Marker | null>(null);
  const savedMarkersRef = useRef<maplibregl.Marker[]>([]);
  const incidentMarkersRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const firstStyleRenderRef = useRef(true);

  // ─── Refs dla pętli rAF (płynna kamera) ──────────────────────────
  const targetBearingRef = useRef<number>(0);
  const targetCenterRef = useRef<[number, number] | null>(null);
  const rafRef = useRef<number | null>(null);

  // ─── Inicjalizacja mapy ───────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const option = MAP_STYLES.find((s) => s.id === props.styleId) ?? MAP_STYLES[0];
    const mapStyle = option.url ?? option.style ?? FALLBACK_STYLE;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle as never,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
      dragRotate: true,
      pitchWithRotate: true,
      touchPitch: true
    });

    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }),
      'bottom-left'
    );

    map.on('styleimagemissing', (e) => {
      if (!map.hasImage(e.id)) {
        map.addImage(e.id, {
          width: 1,
          height: 1,
          data: new Uint8Array(4)
        });
      }
    });

    map.on('error', (e: any) => {
      const msg = e?.error?.message ?? '';
      if (/Failed to fetch|style/i.test(msg)) {
        try {
          map.setStyle(FALLBACK_STYLE as never);
        } catch {
          /* ignore */
        }
      }
    });

    mapRef.current = map;

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      incidentMarkersRef.current.forEach((m) => m.remove());
      incidentMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
      placeMarkerRef.current?.remove();
      fromMarkerRef.current?.remove();
      toMarkerRef.current?.remove();
      userMarkerRef.current?.remove();
      userAccMarkerRef.current?.remove();
      savedMarkersRef.current.forEach((m) => m.remove());
      savedMarkersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Warstwy trasy ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    const apply = () => {
      if (cancelled) return;
      ensureLayers(map);
      applyRouteData(map, props.route ?? null, props.alternativeRoutes ?? []);
      applyRouteGradient(map, props.route ?? null, props.traffic ?? null);
      applyProgressData(
        map,
        props.navigationMode ?? false,
        props.route ?? null,
        props.userLocation ?? null
      );
    };

    if (map.isStyleLoaded()) apply();
    map.on('style.load', apply);
    map.on('load', apply);

    return () => {
      cancelled = true;
      map.off('style.load', apply);
      map.off('load', apply);
    };
  }, [
    props.route,
    props.alternativeRoutes,
    props.navigationMode,
    props.userLocation,
    props.styleId,
    props.traffic
  ]);

  // ─── Markery incydentów (DOM) ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    incidentMarkersRef.current.forEach((m) => m.remove());
    incidentMarkersRef.current = [];

    const incidents = props.incidents ?? [];
    if (!incidents.length) return;

    const route = props.route;

    for (const inc of incidents) {
      if (!isFinite(inc.coordinates.lng) || !isFinite(inc.coordinates.lat)) continue;

      const coord: Coordinates =
        route && route.geometry.length >= 2
          ? closestPointOnPolyline(inc.coordinates, route.geometry)
          : inc.coordinates;

      const el = document.createElement('div');
      el.className = 'roadly-incident-marker';
      el.style.background = incidentColor(inc.category);
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', `${incidentLabel(inc.category)}: ${inc.description}`);
      el.title = `${incidentLabel(inc.category)} — ${inc.description}`;

      const span = document.createElement('span');
      span.textContent = incidentIcon(inc.category);
      el.appendChild(span);

      const openPopup = () => {
        popupRef.current?.remove();
        const cat = inc.category;
        const html = `
          <div style="min-width:200px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,sans-serif;">
            <div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:14px;">
              <span style="font-size:16px;">${incidentIcon(cat)}</span>
              <span>${escapeHtml(incidentLabel(cat))}</span>
            </div>
            <div style="margin-top:6px;font-size:13px;color:#444;">${escapeHtml(
              inc.description
            )}</div>
            ${
              inc.delay > 0
                ? `<div style="margin-top:6px;font-size:12px;color:#666;">Opóźnienie: ${Math.round(
                    inc.delay / 60
                  )} min</div>`
                : ''
            }
            ${
              inc.roadNumbers.length > 0
                ? `<div style="margin-top:4px;font-size:12px;color:#666;">Droga: ${escapeHtml(
                    inc.roadNumbers.join(' / ')
                  )}</div>`
                : ''
            }
          </div>
        `;
        popupRef.current = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          offset: 20
        })
          .setLngLat([coord.lng, coord.lat])
          .setHTML(html)
          .addTo(map);
      };

      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openPopup();
      });
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          openPopup();
        }
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([coord.lng, coord.lat])
        .addTo(map);

      incidentMarkersRef.current.push(marker);
    }
  }, [props.incidents, props.route]);

  // ─── Zmiana stylu (pomijamy pierwszy render) ─────────────────────
  useEffect(() => {
    if (firstStyleRenderRef.current) {
      firstStyleRenderRef.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    const option = MAP_STYLES.find((s) => s.id === props.styleId);
    if (!option) return;
    const mapStyle = option.url ?? option.style ?? FALLBACK_STYLE;
    try {
      map.setStyle(mapStyle as never);
    } catch {
      /* ignore */
    }
  }, [props.styleId]);

  // ─── PŁYNNA KAMERA W NAWIGACJI (pętla rAF) ───────────────────────
  // Wszystko dzieje się w jednej pętli ~60 fps, więc obrót jest idealnie
  // płynny — niezależny od tego jak często przychodzą aktualizacje GPS
  // i kompasu. Kamera "dogania" cel stopniowo, bez skoków.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!props.navigationMode || !props.followUser) {
      // Zatrzymaj pętlę poza nawigacją
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // Natychmiastowy skok do widoku nawigacji (pitch + zoom)
    map.stop();
    map.jumpTo({ pitch: NAV_PITCH, zoom: NAV_ZOOM });

    const tick = () => {
      const m = mapRef.current;
      if (!m) return;

      const update: maplibregl.JumpToOptions = {};
      let changed = false;

      // ─── Bearing: lerp w kierunku targetBearingRef ───
      const target = targetBearingRef.current;
      const currentBearing = m.getBearing();
      const d = bearingDelta(currentBearing, target);
      if (Math.abs(d) > MIN_BEARING_DELTA) {
        update.bearing = currentBearing + d * BEARING_LERP;
        changed = true;
      } else if (Math.abs(d) > 0.001) {
        update.bearing = target;
        changed = true;
      }

      // ─── Center: lerp w kierunku targetCenterRef ───
      const tc = targetCenterRef.current;
      if (tc) {
        const cc = m.getCenter();
        const dLng = tc[0] - cc.lng;
        const dLat = tc[1] - cc.lat;
        if (Math.abs(dLng) > 1e-8 || Math.abs(dLat) > 1e-8) {
          update.center = [cc.lng + dLng * CENTER_LERP, cc.lat + dLat * CENTER_LERP];
          changed = true;
        }
      }

      // ─── Pitch / zoom: dążą do stałych wartości nawigacji ───
      const currentPitch = m.getPitch();
      if (Math.abs(currentPitch - NAV_PITCH) > 0.3) {
        update.pitch = currentPitch + (NAV_PITCH - currentPitch) * 0.18;
        changed = true;
      }
      const currentZoom = m.getZoom();
      if (Math.abs(currentZoom - NAV_ZOOM) > 0.03) {
        update.zoom = currentZoom + (NAV_ZOOM - currentZoom) * 0.18;
        changed = true;
      }

      if (changed) {
        try {
          m.jumpTo(update);
        } catch {
          /* ignore */
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [props.navigationMode, props.followUser]);

  // ─── Aktualizacja celów kamery (bez wywoływania animacji) ────────
  useEffect(() => {
    if (!props.navigationMode) return;
    if (props.userHeading != null && !Number.isNaN(props.userHeading)) {
      targetBearingRef.current = props.userHeading;
    }
  }, [props.userHeading, props.navigationMode]);

  useEffect(() => {
    if (!props.navigationMode) return;
    if (props.userLocation) {
      targetCenterRef.current = [props.userLocation.lng, props.userLocation.lat];
    }
  }, [props.userLocation, props.navigationMode]);

  // ─── Markery: start / cel / wybrane / zapisane ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    placeMarkerRef.current?.remove();
    placeMarkerRef.current = null;
    if (!props.selectedPlace) return;
    const el = document.createElement('div');
    el.className = 'roadly-marker';
    placeMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([props.selectedPlace.coordinates.lng, props.selectedPlace.coordinates.lat])
      .addTo(map);
  }, [props.selectedPlace]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    fromMarkerRef.current?.remove();
    fromMarkerRef.current = null;
    if (!props.fromMarker) return;
    const el = document.createElement('div');
    el.className = 'roadly-marker roadly-marker--from';
    fromMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([props.fromMarker.lng, props.fromMarker.lat])
      .addTo(map);
  }, [props.fromMarker]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    toMarkerRef.current?.remove();
    toMarkerRef.current = null;
    if (!props.toMarker) return;
    const el = document.createElement('div');
    el.className = 'roadly-marker roadly-marker--to';
    toMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([props.toMarker.lng, props.toMarker.lat])
      .addTo(map);
  }, [props.toMarker]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    savedMarkersRef.current.forEach((m) => m.remove());
    savedMarkersRef.current = [];
    (props.savedPlaces ?? []).forEach((p) => {
      const el = document.createElement('div');
      el.className = 'roadly-marker';
      el.style.background = '#ff9f0a';
      const m = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([p.coordinates.lng, p.coordinates.lat])
        .addTo(map);
      savedMarkersRef.current.push(m);
    });
  }, [props.savedPlaces]);

  // ─── Marker użytkownika (strzałka SVG) ────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    userMarkerRef.current?.remove();
    userMarkerRef.current = null;
    userAccMarkerRef.current?.remove();
    userAccMarkerRef.current = null;

    if (!props.userLocation) return;

    const el = document.createElement('div');
    el.className = 'roadly-location';

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 40 40');
    svg.setAttribute('width', '40');
    svg.setAttribute('height', '40');
    svg.setAttribute('class', 'roadly-location__svg');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M20 4 L34 34 L20 27 L6 34 Z');
    path.setAttribute('fill', ARROW_FILL);
    path.setAttribute('stroke', ARROW_STROKE);
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);
    el.appendChild(svg);

    const marker = new maplibregl.Marker({
      element: el,
      anchor: 'center',
      rotationAlignment: 'map',
      pitchAlignment: 'viewport'
    })
      .setLngLat([props.userLocation.lng, props.userLocation.lat])
      .addTo(map);

    if (props.userHeading != null && !Number.isNaN(props.userHeading)) {
      marker.setRotation(props.userHeading);
    }
    userMarkerRef.current = marker;

    if (props.userAccuracy && props.userAccuracy > 5) {
      const accEl = document.createElement('div');
      accEl.className = 'roadly-location-accuracy';
      const size = Math.min(props.userAccuracy * 2, 400);
      accEl.style.width = `${size}px`;
      accEl.style.height = `${size}px`;
      userAccMarkerRef.current = new maplibregl.Marker({ element: accEl, anchor: 'center' })
        .setLngLat([props.userLocation.lng, props.userLocation.lat])
        .addTo(map);
    }
  }, [props.userLocation, props.userAccuracy, props.userHeading]);

  useEffect(() => {
    const marker = userMarkerRef.current;
    if (!marker) return;
    if (props.userHeading == null || Number.isNaN(props.userHeading)) return;
    try {
      marker.setRotation(props.userHeading);
    } catch {
      /* ignore */
    }
  }, [props.userHeading]);

  // ─── Follow user poza nawigacją ───────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (props.navigationMode) return;
    if (!props.followUser) return;
    if (!props.userLocation) return;
    map.easeTo({
      center: [props.userLocation.lng, props.userLocation.lat],
      duration: 600
    });
  }, [props.userLocation, props.followUser, props.navigationMode]);

  useImperativeHandle(
    ref,
    (): MapViewHandle => ({
      flyTo(coord, zoom) {
        const map = mapRef.current;
        if (!map) return;
        if (props.navigationMode) {
          map.jumpTo({ center: [coord.lng, coord.lat], zoom: zoom ?? map.getZoom() });
          return;
        }
        map.flyTo({
          center: [coord.lng, coord.lat],
          zoom: zoom ?? Math.max(map.getZoom(), 14),
          duration: 900
        });
      },
      fitBounds(sw, ne) {
        const map = mapRef.current;
        if (!map) return;
        const bounds = new LngLatBounds([sw.lng, sw.lat], [ne.lng, ne.lat]);
        map.fitBounds(bounds, { padding: 80, duration: 900 });
      },
      fitRoute(route) {
        const map = mapRef.current;
        if (!map || !route.geometry.length) return;
        const bounds = new LngLatBounds();
        route.geometry.forEach(([lng, lat]) => bounds.extend([lng, lat]));
        map.fitBounds(bounds, {
          padding: { top: 120, bottom: 180, left: 60, right: 60 },
          duration: 900
        });
      },
      resetNorth() {
        mapRef.current?.resetNorthPitch({ duration: 500 });
      },
      set3D(enabled) {
        const map = mapRef.current;
        if (!map) return;
        map.easeTo({
          pitch: enabled ? NAV_PITCH : 0,
          bearing: enabled ? map.getBearing() : 0,
          duration: 700
        });
      },
      is3D() {
        const map = mapRef.current;
        if (!map) return false;
        return map.getPitch() > 10;
      },
      getMap() {
        return mapRef.current;
      }
    }),
    [props.navigationMode]
  );

  return <div ref={containerRef} className="app__map" aria-label="Interaktywna mapa" />;
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function computeProgressLine(route: Route, user: Coordinates): [number, number][] {
  if (route.geometry.length < 2) return [];
  const proj = closestSegment(user, route.geometry);
  const out: [number, number][] = [];
  for (let i = 0; i <= proj.segmentIndex; i++) out.push(route.geometry[i]);
  if (proj.t > 0.001 && proj.segmentIndex < route.geometry.length - 1) {
    const [x1, y1] = route.geometry[proj.segmentIndex];
    const [x2, y2] = route.geometry[proj.segmentIndex + 1];
    out.push([x1 + (x2 - x1) * proj.t, y1 + (y2 - y1) * proj.t]);
  }
  return out;
}

function ensureLayers(map: MLMap) {
  if (!map.getSource(ALT_SOURCE)) {
    map.addSource(ALT_SOURCE, { type: 'geojson', data: emptyFC() });
  }
  if (!map.getLayer('roadly-alt-line')) {
    map.addLayer({
      id: 'roadly-alt-line',
      type: 'line',
      source: ALT_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#9aa0a6', 'line-width': 5, 'line-opacity': 0.7 }
    });
  }

  if (!map.getSource(ROUTE_SOURCE)) {
    map.addSource(ROUTE_SOURCE, {
      type: 'geojson',
      data: emptyFC(),
      lineMetrics: true
    });
  }
  if (!map.getLayer('roadly-route-outline')) {
    map.addLayer({
      id: 'roadly-route-outline',
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ROUTE_OUTLINE_COLOR,
        'line-width': 11,
        'line-opacity': 0.95
      }
    });
  }
  if (!map.getLayer('roadly-route-gradient-line')) {
    map.addLayer({
      id: 'roadly-route-gradient-line',
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': FALLBACK_ROUTE_COLOR, 'line-width': 7 }
    });
  }

  if (!map.getSource(PROGRESS_SOURCE)) {
    map.addSource(PROGRESS_SOURCE, { type: 'geojson', data: emptyFC() });
  }
  if (!map.getLayer('roadly-route-progress-line')) {
    map.addLayer({
      id: 'roadly-route-progress-line',
      type: 'line',
      source: PROGRESS_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ROUTE_PROGRESS_COLOR, 'line-width': 7, 'line-opacity': 0.95 }
    });
  }
}

function applyRouteData(map: MLMap, primary: Route | null, alternatives: Route[]) {
  const primarySrc = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
  const altSrc = map.getSource(ALT_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!primarySrc || !altSrc) return;

  if (primary && primary.geometry.length > 1) {
    primarySrc.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: primary.geometry }
        }
      ]
    });
  } else {
    primarySrc.setData(emptyFC());
  }

  const alts = alternatives.filter((r) => r.id !== primary?.id && r.geometry.length > 1);
  altSrc.setData({
    type: 'FeatureCollection',
    features: alts.map((r) => ({
      type: 'Feature' as const,
      properties: { id: r.id },
      geometry: { type: 'LineString' as const, coordinates: r.geometry }
    }))
  });
}

function applyRouteGradient(
  map: MLMap,
  route: Route | null,
  traffic: TrafficReport | null
) {
  if (!map.getLayer('roadly-route-gradient-line')) return;

  if (!route || route.geometry.length < 2 || !traffic || traffic.samples.length < 2) {
    const flatGradient: any = [
      'interpolate',
      ['linear'],
      ['line-progress'],
      0,
      FALLBACK_ROUTE_COLOR,
      1,
      FALLBACK_ROUTE_COLOR
    ];
    try {
      map.setPaintProperty('roadly-route-gradient-line', 'line-gradient', flatGradient);
    } catch {
      /* ignore */
    }
    return;
  }

  const total = polylineLength(route.geometry) || 1;
  const samples = traffic.samples;

  const points = samples.map((s) => {
    const proj = closestSegment(s.coordinates, route.geometry);
    const dist = distanceAlongRouteTo(route.geometry, proj.segmentIndex, proj.t);
    return {
      progress: Math.max(0, Math.min(1, dist / total)),
      color: congestionLineColor(s.congestion)
    };
  });

  points.sort((a, b) => a.progress - b.progress);

  if (points[0].progress > 0.001) {
    points.unshift({ progress: 0, color: points[0].color });
  }
  if (points[points.length - 1].progress < 0.999) {
    points.push({ progress: 1, color: points[points.length - 1].color });
  }

  const maxStops = 20;
  let stops = points;
  if (points.length > maxStops) {
    const step = Math.ceil(points.length / maxStops);
    stops = points.filter((_, i) => i % step === 0);
    if (stops[stops.length - 1].progress < 0.999) {
      stops.push(points[points.length - 1]);
    }
  }

  const gradient: any[] = ['interpolate', ['linear'], ['line-progress']];
  for (const p of stops) {
    gradient.push(p.progress, p.color);
  }

  try {
    map.setPaintProperty('roadly-route-gradient-line', 'line-gradient', gradient);
  } catch {
    /* ignore */
  }
}

function applyProgressData(
  map: MLMap,
  navigationMode: boolean,
  route: Route | null,
  userLocation: Coordinates | null
) {
  const src = map.getSource(PROGRESS_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (!src) return;

  if (!navigationMode || !route || !userLocation || route.geometry.length < 2) {
    src.setData(emptyFC());
    return;
  }

  const line = computeProgressLine(route, userLocation);
  if (line.length < 2) {
    src.setData(emptyFC());
    return;
  }

  src.setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: line }
      }
    ]
  });
}

export default MapView;