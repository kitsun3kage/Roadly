import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import maplibregl, { LngLatBounds, type Map as MLMap } from 'maplibre-gl';
import type { Coordinates, Place, Route } from '../../types';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  FALLBACK_STYLE,
  MAP_STYLES
} from '../../services/maps';
import { bearingDelta, closestSegment } from '../../lib/geo';

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
}

const ROUTE_SOURCE = 'roadly-route';
const ALT_SOURCE = 'roadly-alt-route';
const PROGRESS_SOURCE = 'roadly-route-progress';

const NAV_ZOOM = 17;
const NAV_PITCH = 60;
const CAMERA_DURATION_MS = 900;
const BEARING_DEAD_ZONE_DEG = 2;

/**
 * Kolory motywu Roadly — czerwono-pomarańczowo-żółty.
 * Używane dla markera użytkownika, żeby pasował do logo i akcentu UI.
 */
const ARROW_FILL = '#ff6b00';
const ARROW_STROKE = '#ffffff';

const MapView = forwardRef<MapViewHandle, Props>(function MapView(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const placeMarkerRef = useRef<maplibregl.Marker | null>(null);
  const fromMarkerRef = useRef<maplibregl.Marker | null>(null);
  const toMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userAccMarkerRef = useRef<maplibregl.Marker | null>(null);
  const savedMarkersRef = useRef<maplibregl.Marker[]>([]);

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

    // Wyciszenie ostrzeżeń o brakujących ikonach
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

    map.on('load', () => ensureLayers(map));
    map.on('style.load', () => ensureLayers(map));

    mapRef.current = map;

    return () => {
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

  // ─── Zmiana stylu ─────────────────────────────────────────────────
  useEffect(() => {
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

  // ─── Wejście/wyjście z trybu nawigacji ────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (props.navigationMode) {
      map.stop();
      map.jumpTo({ pitch: NAV_PITCH, zoom: NAV_ZOOM });
    } else {
      map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    }
  }, [props.navigationMode]);

  // ─── Marker wybranego miejsca ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    placeMarkerRef.current?.remove();
    placeMarkerRef.current = null;
    if (!props.selectedPlace) return;
    const el = document.createElement('div');
    el.className = 'roadly-marker';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', props.selectedPlace.name);
    placeMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([props.selectedPlace.coordinates.lng, props.selectedPlace.coordinates.lat])
      .addTo(map);
  }, [props.selectedPlace]);

  // ─── Marker startu ────────────────────────────────────────────────
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

  // ─── Marker celu ──────────────────────────────────────────────────
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
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Twoja lokalizacja');

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

  // ─── Obrót markera wg heading ─────────────────────────────────────
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

  // ─── Kamera w trybie nawigacji ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!props.navigationMode) return;
    if (!props.followUser) return;
    if (!props.userLocation) return;

    const center: [number, number] = [props.userLocation.lng, props.userLocation.lat];
    const currentBearing = map.getBearing();

    let targetBearing = currentBearing;
    if (props.userHeading != null && !Number.isNaN(props.userHeading)) {
      const delta = bearingDelta(currentBearing, props.userHeading);
      if (Math.abs(delta) > BEARING_DEAD_ZONE_DEG) {
        targetBearing = currentBearing + delta;
      }
    }

    map.easeTo({
      center,
      bearing: targetBearing,
      pitch: NAV_PITCH,
      zoom: NAV_ZOOM,
      duration: CAMERA_DURATION_MS,
      easing: (t) => t,
      essential: true
    });
  }, [props.userLocation, props.userHeading, props.followUser, props.navigationMode]);

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

  // ─── Szara linia pokonanego odcinka trasy ─────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) return;

    const src = map.getSource(PROGRESS_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (
      !props.navigationMode ||
      !props.route ||
      !props.userLocation ||
      props.route.geometry.length < 2
    ) {
      src.setData(emptyFC());
      return;
    }

    const line = computeProgressLine(props.route, props.userLocation);
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
  }, [props.navigationMode, props.route, props.userLocation]);

  // ─── Markery zapisanych miejsc ────────────────────────────────────
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

  // ─── Warstwy trasy ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    updateRouteLayers(map, props.route ?? null, props.alternativeRoutes ?? []);
  }, [props.route, props.alternativeRoutes]);

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

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

/**
 * Fragment geometrii od startu do aktualnej pozycji (rzut na najbliższy segment).
 */
function computeProgressLine(
  route: Route,
  user: Coordinates
): [number, number][] {
  if (route.geometry.length < 2) return [];
  const proj = closestSegment(user, route.geometry);
  const out: [number, number][] = [];
  for (let i = 0; i <= proj.segmentIndex; i++) {
    out.push(route.geometry[i]);
  }
  if (proj.t > 0.001 && proj.segmentIndex < route.geometry.length - 1) {
    const [x1, y1] = route.geometry[proj.segmentIndex];
    const [x2, y2] = route.geometry[proj.segmentIndex + 1];
    out.push([x1 + (x2 - x1) * proj.t, y1 + (y2 - y1) * proj.t]);
  }
  return out;
}

function ensureLayers(map: MLMap) {
  if (!map.isStyleLoaded()) return;

  // Alternatywne trasy (pod spodem, szare)
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

  // Główna trasa (pomarańczowa z białą obwódką, dopasowana do motywu)
  if (!map.getSource(ROUTE_SOURCE)) {
    map.addSource(ROUTE_SOURCE, { type: 'geojson', data: emptyFC() });
  }
  if (!map.getLayer('roadly-route-outline')) {
    map.addLayer({
      id: 'roadly-route-outline',
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.9 }
    });
  }
  if (!map.getLayer('roadly-route-line')) {
    map.addLayer({
      id: 'roadly-route-line',
      type: 'line',
      source: ROUTE_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ff6b00', 'line-width': 6 }
    });
  }

  // Szara linia pokonanego odcinka
  if (!map.getSource(PROGRESS_SOURCE)) {
    map.addSource(PROGRESS_SOURCE, { type: 'geojson', data: emptyFC() });
  }
  if (!map.getLayer('roadly-route-progress-line')) {
    map.addLayer({
      id: 'roadly-route-progress-line',
      type: 'line',
      source: PROGRESS_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#8e8e93', 'line-width': 6, 'line-opacity': 0.95 }
    });
  }
}

function updateRouteLayers(map: MLMap, primary: Route | null, alternatives: Route[]) {
  if (!map.isStyleLoaded()) return;
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

  const alts = alternatives.filter(
    (r) => r.id !== primary?.id && r.geometry.length > 1
  );
  altSrc.setData({
    type: 'FeatureCollection',
    features: alts.map((r) => ({
      type: 'Feature' as const,
      properties: { id: r.id },
      geometry: { type: 'LineString' as const, coordinates: r.geometry }
    }))
  });
}

export default MapView;