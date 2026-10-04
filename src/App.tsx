import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Locate, Map as MapIcon, Minus, Plus, X } from 'lucide-react';
import MapView, { type MapViewHandle } from './components/map/MapView';
import SearchPanel from './components/search/SearchPanel';
import PlaceDetails from './components/places/PlaceDetails';
import RoutePanel from './components/routes/RoutePanel';
import CollectionsPanel from './components/collections/CollectionsPanel';
import SettingsPanel from './components/settings/SettingsPanel';
import NavigationOverlay from './components/navigation/NavigationOverlay';
import TabBar from './components/layout/TabBar';
import { useGeolocation } from './hooks/useGeolocation';
import { useDeviceHeading } from './hooks/useDeviceHeading';
import { useTraffic } from './hooks/useTraffic';
import { calculateRoute } from './services/routing';
import { storage } from './services/storage';
import { uid } from './lib/utils';
import { distanceMeters, distanceToPolyline } from './lib/geo';
import { stopSpeaking } from './services/speech';
import type {
  Collection,
  Place,
  RecentSearch,
  Route,
  SavedPlace,
  TravelProfile
} from './types';

type View = 'search' | 'route' | 'collections' | 'settings';
type PickTarget = 'from' | 'to' | null;

const ARRIVAL_THRESHOLD_M = 30;
const OFF_ROUTE_THRESHOLD_M = 50;
const OFF_ROUTE_DELAY_MS = 4000;
const REROUTE_COOLDOWN_MS = 8000;
const VOICE_PREF_KEY = 'roadly.voiceEnabled.v1';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => storage.getTheme());
  const [styleId, setStyleId] = useState('liberty');
  const [view, setView] = useState<View>('search');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pickTarget, setPickTarget] = useState<PickTarget>(null);

  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [fromPlace, setFromPlace] = useState<Place | null>(null);
  const [toPlace, setToPlace] = useState<Place | null>(null);
  const [profile, setProfile] = useState<TravelProfile>('driving');

  const [routes, setRoutes] = useState<Route[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [routing, setRouting] = useState(false);
  const [routingError, setRoutingError] = useState<string | null>(null);

  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(() =>
    storage.getRecentSearches()
  );
  const [collections, setCollections] = useState<Collection[]>(() => storage.getCollections());
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>(() => storage.getSavedPlaces());

  const [navigationActive, setNavigationActive] = useState(false);
  const [hasArrived, setHasArrived] = useState(false);
  const [followUser, setFollowUser] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(VOICE_PREF_KEY);
      return v === null ? true : v === '1';
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState<{ message: string; kind: 'info' | 'error' } | null>(null);

  const mapRef = useRef<MapViewHandle>(null);
  const geo = useGeolocation();
  const routingAbortRef = useRef<AbortController | null>(null);
  const recalcRef = useRef<{ from?: string; to?: string; profile?: TravelProfile }>({});
  const offRouteSinceRef = useRef<number | null>(null);
  const lastRerouteRef = useRef<number>(0);
  const reroutingRef = useRef(false);

  const activeRoute = useMemo(
    () => routes.find((r) => r.id === activeRouteId) ?? routes[0] ?? null,
    [routes, activeRouteId]
  );

  const inNavMode = navigationActive && activeRoute !== null;
  const deviceHeading = useDeviceHeading(inNavMode);
  const displayHeading = geo.heading ?? deviceHeading;

  const { report: trafficReport } = useTraffic(activeRoute, inNavMode);

  // Zapamiętaj preferencję TTS
  useEffect(() => {
    try {
      localStorage.setItem(VOICE_PREF_KEY, voiceEnabled ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [voiceEnabled]);

  // ─── Motyw ─────────────────────────────────────────────────────────
  useEffect(() => {
    storage.setTheme(theme);
    const apply = () => {
      const resolved =
        theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : theme;
      document.documentElement.setAttribute('data-theme', resolved);
    };
    apply();
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);

  useEffect(() => { storage.setRecentSearches(recentSearches); }, [recentSearches]);
  useEffect(() => { storage.setCollections(collections); }, [collections]);
  useEffect(() => { storage.setSavedPlaces(savedPlaces); }, [savedPlaces]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const showToast = useCallback((message: string, kind: 'info' | 'error' = 'info') => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  // ─── Wybór miejsca ─────────────────────────────────────────────────
  const handleSelectPlace = useCallback(
    (place: Place, opts: { keepSidebar?: boolean } = {}) => {
      if (pickTarget === 'from') {
        setFromPlace(place);
        setPickTarget(null);
        setView('route');
        mapRef.current?.flyTo(place.coordinates, 14);
        return;
      }
      if (pickTarget === 'to') {
        setToPlace(place);
        setPickTarget(null);
        setView('route');
        mapRef.current?.flyTo(place.coordinates, 14);
        return;
      }
      setSelectedPlace(place);
      mapRef.current?.flyTo(place.coordinates, 15);
      setRecentSearches((prev) => {
        const filtered = prev.filter((r) => r.id !== place.id);
        return [
          {
            id: place.id,
            name: place.name,
            address: place.address,
            coordinates: place.coordinates,
            searchedAt: Date.now()
          },
          ...filtered
        ].slice(0, 12);
      });
      if (!opts.keepSidebar) setView('search');
      setSidebarOpen(true);
    },
    [pickTarget]
  );

  const handlePickFrom = useCallback(() => {
    setPickTarget('from');
    setView('search');
    setSidebarOpen(true);
  }, []);

  const handlePickTo = useCallback(() => {
    setPickTarget('to');
    setView('search');
    setSidebarOpen(true);
  }, []);

  // ─── Routing ───────────────────────────────────────────────────────
  const handleCalculateRoute = useCallback(
    async (opts?: { silent?: boolean }) => {
      const from = fromPlace;
      const to = toPlace;
      if (!from || !to) return;

      routingAbortRef.current?.abort();
      const ctrl = new AbortController();
      routingAbortRef.current = ctrl;

      setRouting(true);
      setRoutingError(null);

      try {
        const result = await calculateRoute(
          from.coordinates,
          to.coordinates,
          profile,
          ctrl.signal,
          true
        );
        setRoutes(result);
        setActiveRouteId(result[0]?.id ?? null);
        if (result[0]) mapRef.current?.fitRoute(result[0]);
        if (!opts?.silent) setView('route');
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        const msg = e instanceof Error ? e.message : 'Nie udało się obliczyć trasy.';
        setRoutingError(msg);
        setRoutes([]);
        showToast(msg, 'error');
      } finally {
        setRouting(false);
      }
    },
    [fromPlace, toPlace, profile, showToast]
  );

  useEffect(() => {
    if (!fromPlace || !toPlace) return;
    if (routes.length === 0) return;
    const prev = recalcRef.current;
    const changed =
      prev.from !== fromPlace.id || prev.to !== toPlace.id || prev.profile !== profile;
    recalcRef.current = { from: fromPlace.id, to: toPlace.id, profile };
    if (changed) handleCalculateRoute({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromPlace?.id, toPlace?.id, profile]);

  // ─── Reroute ───────────────────────────────────────────────────────
  const handleReroute = useCallback(async () => {
    if (!geo.position || !toPlace || !activeRoute) return;
    if (reroutingRef.current) return;

    reroutingRef.current = true;
    showToast('Przeliczam trasę…');

    try {
      const result = await calculateRoute(
        geo.position.coordinates,
        toPlace.coordinates,
        activeRoute.profile,
        undefined,
        false
      );
      if (result[0]) {
        setRoutes(result);
        setActiveRouteId(result[0].id);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Reroute failed', e);
    } finally {
      reroutingRef.current = false;
    }
  }, [geo.position, toPlace, activeRoute, showToast]);

  useEffect(() => {
    if (!inNavMode) {
      offRouteSinceRef.current = null;
      return;
    }
    if (!activeRoute || !geo.position) return;
    if (hasArrived) return;

    const d = distanceToPolyline(geo.position.coordinates, activeRoute.geometry);

    if (d > OFF_ROUTE_THRESHOLD_M) {
      if (offRouteSinceRef.current === null) {
        offRouteSinceRef.current = Date.now();
      } else if (Date.now() - offRouteSinceRef.current > OFF_ROUTE_DELAY_MS) {
        const now = Date.now();
        if (now - lastRerouteRef.current < REROUTE_COOLDOWN_MS) return;
        lastRerouteRef.current = now;
        offRouteSinceRef.current = null;
        void handleReroute();
      }
    } else {
      offRouteSinceRef.current = null;
    }
  }, [inNavMode, activeRoute, geo.position, hasArrived, handleReroute]);

  // ─── Dojazd ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!inNavMode) return;
    if (!toPlace || !geo.position) return;
    if (hasArrived) return;

    const d = distanceMeters(geo.position.coordinates, toPlace.coordinates);
    if (d < ARRIVAL_THRESHOLD_M) {
      setHasArrived(true);
      setFollowUser(false);
      setIs3D(false);
      mapRef.current?.set3D(false);
      showToast('Dojechałeś do celu.');
    }
  }, [inNavMode, toPlace, geo.position, hasArrived, showToast]);

  // ─── Lokalizacja ───────────────────────────────────────────────────
  const handleUseMyLocationAsFrom = useCallback(async () => {
    const loc = geo.position ?? (await geo.ensurePosition());
    if (!loc) {
      showToast(geo.error || 'Nie udało się pobrać lokalizacji.', 'error');
      return;
    }
    setFromPlace({
      id: 'my-location',
      name: 'Moja lokalizacja',
      coordinates: loc.coordinates
    });
    setView('route');
  }, [geo, showToast]);

  const handleGoToMyLocation = useCallback(async () => {
    if (geo.position) {
      mapRef.current?.flyTo(geo.position.coordinates, 16);
      return;
    }
    if (geo.permission === 'denied') {
      showToast(
        'Lokalizacja jest zablokowana w przeglądarce. Kliknij ikonę zamka przy adresie i zezwól na lokalizację, następnie odśwież stronę.',
        'error'
      );
      return;
    }
    const loc = await geo.request();
    if (!loc) {
      showToast(geo.error || 'Nie udało się pobrać lokalizacji.', 'error');
      return;
    }
    mapRef.current?.flyTo(loc.coordinates, 16);
  }, [geo, showToast]);

  const handleSetAsDestination = useCallback((place: Place) => {
    setToPlace(place);
    setSelectedPlace(null);
    setView('route');
    setSidebarOpen(true);
  }, []);

  const handleSetAsOrigin = useCallback((place: Place) => {
    setFromPlace(place);
    setSelectedPlace(null);
    setView('route');
    setSidebarOpen(true);
  }, []);

  const handleSwap = useCallback(() => {
    setFromPlace(toPlace);
    setToPlace(fromPlace);
  }, [fromPlace, toPlace]);

  const handleClearRoute = useCallback(() => {
    routingAbortRef.current?.abort();
    stopSpeaking();
    setRoutes([]);
    setActiveRouteId(null);
    setFromPlace(null);
    setToPlace(null);
    setRoutingError(null);
    setNavigationActive(false);
    setHasArrived(false);
    setFollowUser(false);
    setIs3D(false);
    offRouteSinceRef.current = null;
  }, []);

  // ─── Nawigacja ─────────────────────────────────────────────────────
  const handleStartNavigation = useCallback(() => {
    if (!activeRoute) return;

    setNavigationActive(true);
    setHasArrived(false);
    setFollowUser(true);
    setIs3D(true);
    setSidebarOpen(false);
    setSelectedPlace(null);
    offRouteSinceRef.current = null;
    lastRerouteRef.current = 0;

    if (!geo.position) {
      void geo.ensurePosition();
    }
  }, [activeRoute, geo]);

  const handleExitNavigation = useCallback(() => {
    stopSpeaking();
    setNavigationActive(false);
    setHasArrived(false);
    setFollowUser(false);
    setIs3D(false);
    offRouteSinceRef.current = null;
    if (activeRoute) {
      window.setTimeout(() => mapRef.current?.fitRoute(activeRoute), 700);
    }
    setSidebarOpen(true);
    setView('route');
  }, [activeRoute]);

  const handleToggle3D = useCallback(() => {
    setIs3D((prev) => {
      const next = !prev;
      mapRef.current?.set3D(next);
      return next;
    });
  }, []);

  const handleToggleVoice = useCallback(() => {
    setVoiceEnabled((v) => {
      if (v) stopSpeaking();
      return !v;
    });
  }, []);

  const handleRecenterNavigation = useCallback(() => {
    setFollowUser(true);
    if (geo.position) {
      mapRef.current?.flyTo(geo.position.coordinates, 17);
    }
  }, [geo.position]);

  // ─── Zapisane miejsca ──────────────────────────────────────────────
  const ensureDefaultCollection = useCallback((): string => {
    if (collections.length > 0) return collections[0].id;
    const c: Collection = {
      id: uid(),
      name: 'Ulubione',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setCollections([c]);
    return c.id;
  }, [collections]);

  const handleSavePlace = useCallback(
    (place: Place) => {
      const cid = ensureDefaultCollection();
      const existing = savedPlaces.find((p) => p.id === place.id && p.collectionId === cid);
      if (existing) {
        showToast('Miejsce jest już zapisane.');
        return;
      }
      const sp: SavedPlace = {
        ...place,
        savedId: uid(),
        collectionId: cid,
        savedAt: Date.now()
      };
      setSavedPlaces((prev) => [sp, ...prev]);
      showToast('Zapisano miejsce.');
    },
    [savedPlaces, ensureDefaultCollection, showToast]
  );

  const handleRemoveSaved = useCallback((savedId: string) => {
    setSavedPlaces((prev) => prev.filter((p) => p.savedId !== savedId));
  }, []);

  const handleCreateCollection = useCallback((name: string) => {
    const c: Collection = {
      id: uid(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    setCollections((prev) => [...prev, c]);
    return c.id;
  }, []);

  const handleRenameCollection = useCallback((id: string, name: string) => {
    setCollections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name, updatedAt: Date.now() } : c))
    );
  }, []);

  const handleDeleteCollection = useCallback((id: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
    setSavedPlaces((prev) => prev.filter((p) => p.collectionId !== id));
  }, []);

  const handleClearRecent = useCallback(() => setRecentSearches([]), []);
  const handleClosePlaceDetails = useCallback(() => setSelectedPlace(null), []);

  // ─── WIDOK ─────────────────────────────────────────────────────────
  return (
    <div className={`app${inNavMode ? ' app--navigating' : ''}`}>
      <MapView
        ref={mapRef}
        styleId={styleId}
        selectedPlace={selectedPlace}
        route={activeRoute}
        alternativeRoutes={routes}
        userLocation={geo.position?.coordinates ?? null}
        userAccuracy={geo.position?.accuracy ?? null}
        userHeading={displayHeading}
        fromMarker={fromPlace?.coordinates ?? null}
        toMarker={toPlace?.coordinates ?? null}
        savedPlaces={savedPlaces}
        followUser={followUser}
        navigationMode={inNavMode}
      />

      {!inNavMode && (
        <aside
          className={`app__sidebar${sidebarOpen ? '' : ' app__sidebar--closed'}`}
          aria-hidden={!sidebarOpen}
          aria-label="Panel główny"
        >
          <div className="app__sidebar-inner">
            <header className="topbar">
              <div className="brand">
                <span className="brand__logo" aria-hidden>
                  <MapIcon size={16} />
                </span>
                <span>Roadly</span>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--icon"
                  aria-label="Zamknij panel"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {selectedPlace ? (
                <PlaceDetails
                  place={selectedPlace}
                  onClose={handleClosePlaceDetails}
                  onSetOrigin={handleSetAsOrigin}
                  onSetDestination={handleSetAsDestination}
                  onSave={handleSavePlace}
                  isSaved={savedPlaces.some((p) => p.id === selectedPlace.id)}
                  onShowToast={showToast}
                />
              ) : view === 'search' ? (
                <SearchPanel
                  recentSearches={recentSearches}
                  onSelect={handleSelectPlace}
                  onClearRecent={handleClearRecent}
                  userLocation={geo.position?.coordinates ?? null}
                />
              ) : view === 'route' ? (
                <RoutePanel
                  fromPlace={fromPlace}
                  toPlace={toPlace}
                  profile={profile}
                  onProfileChange={setProfile}
                  onFromChange={setFromPlace}
                  onToChange={setToPlace}
                  onSwap={handleSwap}
                  onUseMyLocation={handleUseMyLocationAsFrom}
                  onPickFrom={handlePickFrom}
                  onPickTo={handlePickTo}
                  routes={routes}
                  activeRouteId={activeRouteId}
                  onActiveRouteChange={(id) => {
                    setActiveRouteId(id);
                    const r = routes.find((x) => x.id === id);
                    if (r) mapRef.current?.fitRoute(r);
                  }}
                  onCalculate={() => handleCalculateRoute()}
                  onClear={handleClearRoute}
                  loading={routing}
                  error={routingError}
                  onStartNavigation={handleStartNavigation}
                  geoBusy={geo.loading}
                />
              ) : view === 'collections' ? (
                <CollectionsPanel
                  collections={collections}
                  savedPlaces={savedPlaces}
                  onRemove={handleRemoveSaved}
                  onCreateCollection={handleCreateCollection}
                  onRenameCollection={handleRenameCollection}
                  onDeleteCollection={handleDeleteCollection}
                  onSelect={(place) => handleSelectPlace(place, { keepSidebar: true })}
                  onNavigate={(place) => {
                    setToPlace(place);
                    setView('route');
                  }}
                  onShowToast={showToast}
                />
              ) : (
                <SettingsPanel
                  theme={theme}
                  onThemeChange={setTheme}
                  styleId={styleId}
                  onStyleChange={setStyleId}
                  onExport={() => {
                    const data = storage.exportAll();
                    const blob = new Blob([JSON.stringify(data, null, 2)], {
                      type: 'application/json'
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `roadly-export-${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast('Wyeksportowano dane.');
                  }}
                  onImport={async (file) => {
                    try {
                      const text = await file.text();
                      const data = JSON.parse(text);
                      const ok = storage.importAll(data);
                      if (!ok) throw new Error('Nieprawidłowy plik');
                      setCollections(storage.getCollections());
                      setSavedPlaces(storage.getSavedPlaces());
                      setRecentSearches(storage.getRecentSearches());
                      showToast('Zaimportowano dane.');
                    } catch {
                      showToast('Nie udało się zaimportować pliku.', 'error');
                    }
                  }}
                  onClearAll={() => {
                    if (
                      !window.confirm(
                        'Usunąć wszystkie zapisane miejsca, kolekcje i historię wyszukiwań?'
                      )
                    )
                      return;
                    storage.clearAll();
                    setCollections([]);
                    setSavedPlaces([]);
                    setRecentSearches([]);
                    showToast('Wyczyszczono dane.');
                  }}
                />
              )}
            </div>
          </div>
        </aside>
      )}

      {!inNavMode && !sidebarOpen && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            top: 'calc(12px + env(safe-area-inset-top, 0px))',
            zIndex: 20
          }}
        >
          <button
            type="button"
            className="map-control"
            aria-label="Otwórz panel"
            onClick={() => setSidebarOpen(true)}
          >
            <MapIcon size={18} />
          </button>
        </div>
      )}

      {!inNavMode && (
        <div className="map-controls" role="group" aria-label="Sterowanie mapą">
          <button
            type="button"
            className="map-control"
            aria-label="Przybliż"
            onClick={() => mapRef.current?.getMap()?.zoomIn()}
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            className="map-control"
            aria-label="Oddal"
            onClick={() => mapRef.current?.getMap()?.zoomOut()}
          >
            <Minus size={18} />
          </button>
          <button
            type="button"
            className={`map-control${geo.watching ? ' map-control--active' : ''}`}
            aria-label="Moja lokalizacja"
            onClick={handleGoToMyLocation}
            disabled={geo.loading}
          >
            {geo.loading ? (
              <span
                style={{
                  width: 16,
                  height: 16,
                  border: '2px solid currentColor',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'spin 0.8s linear infinite'
                }}
              />
            ) : (
              <Locate size={18} color={geo.permission === 'denied' ? 'var(--danger)' : undefined} />
            )}
          </button>
          <button
            type="button"
            className="map-control"
            aria-label="Przywróć kierunek północny"
            onClick={() => mapRef.current?.resetNorth()}
          >
            <Compass size={18} />
          </button>
        </div>
      )}

      {!inNavMode && (
        <TabBar
          view={view}
          onView={(v) => {
            setView(v);
            setSelectedPlace(null);
            setPickTarget(null);
            setSidebarOpen(true);
          }}
        />
      )}

      {inNavMode && activeRoute && (
        <NavigationOverlay
          route={activeRoute}
          userLocation={geo.position?.coordinates ?? null}
          onExit={handleExitNavigation}
          onRecenter={handleRecenterNavigation}
          geoError={geo.error}
          is3D={is3D}
          onToggle3D={handleToggle3D}
          hasArrived={hasArrived}
          destinationName={toPlace?.name ?? null}
          traffic={trafficReport}
          voiceEnabled={voiceEnabled}
          onToggleVoice={handleToggleVoice}
        />
      )}

      {toast && (
        <div
          className={`toast${toast.kind === 'error' ? ' toast--error' : ''}`}
          role="status"
          aria-live="polite"
          style={{
            maxWidth: 'min(520px, calc(100vw - 24px))',
            whiteSpace: 'pre-wrap',
            textAlign: 'left'
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}