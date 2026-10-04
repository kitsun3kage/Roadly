import {
  AlertTriangle,
  ArrowDownUp,
  Calculator,
  LocateFixed,
  Navigation,
  Route as RouteIcon,
  Search,
  Trash2,
  X
} from 'lucide-react';
import type { Place, Route, TravelProfile } from '../../types';
import { formatDistance, formatDuration } from '../../lib/utils';
import {
  incidentIcon,
  incidentLabel,
  type TrafficIncident
} from '../../services/traffic';

interface Props {
  fromPlace: Place | null;
  toPlace: Place | null;
  profile: TravelProfile;
  onProfileChange: (p: TravelProfile) => void;
  onFromChange: (p: Place | null) => void;
  onToChange: (p: Place | null) => void;
  onSwap: () => void;
  onUseMyLocation: () => void;
  onPickFrom: () => void;
  onPickTo: () => void;
  routes: Route[];
  activeRouteId: string | null;
  onActiveRouteChange: (id: string) => void;
  onCalculate: () => void;
  onClear: () => void;
  loading: boolean;
  error: string | null;
  onStartNavigation: () => void;
  geoBusy: boolean;
  incidents?: TrafficIncident[];
}

const PROFILES: { id: TravelProfile; label: string }[] = [
  { id: 'driving', label: 'Samochód' },
  { id: 'cycling', label: 'Rower' },
  { id: 'walking', label: 'Pieszo' }
];

export default function RoutePanel(props: Props) {
  const {
    fromPlace,
    toPlace,
    profile,
    onProfileChange,
    onFromChange,
    onToChange,
    onSwap,
    onUseMyLocation,
    onPickFrom,
    onPickTo,
    routes,
    activeRouteId,
    onActiveRouteChange,
    onCalculate,
    onClear,
    loading,
    error,
    onStartNavigation,
    geoBusy,
    incidents = []
  } = props;

  const activeRoute = routes.find((r) => r.id === activeRouteId) ?? routes[0] ?? null;
  const canCalculate = Boolean(fromPlace && toPlace);

  return (
    <div className="panel">
      <div className="panel__header">
        <RouteIcon size={18} />
        <h2 className="panel__title">Trasa</h2>
      </div>

      <div
        className="panel__section"
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <div className="field">
          <span className="field__dot field__dot--from" aria-hidden />
          <input
            readOnly
            placeholder="Wybierz punkt startowy"
            value={fromPlace?.name ?? ''}
            aria-label="Punkt startowy"
          />
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="Wybierz punkt startowy"
            onClick={onPickFrom}
          >
            <Search size={15} />
          </button>
          {fromPlace ? (
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              aria-label="Wyczyść punkt startowy"
              onClick={() => onFromChange(null)}
            >
              <X size={15} />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              aria-label="Użyj mojej lokalizacji"
              onClick={onUseMyLocation}
              disabled={geoBusy}
            >
              <LocateFixed size={15} />
            </button>
          )}
        </div>

        <div className="field">
          <span className="field__dot field__dot--to" aria-hidden />
          <input
            readOnly
            placeholder="Wybierz punkt docelowy"
            value={toPlace?.name ?? ''}
            aria-label="Punkt docelowy"
          />
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="Wybierz punkt docelowy"
            onClick={onPickTo}
          >
            <Search size={15} />
          </button>
          {toPlace && (
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              aria-label="Wyczyść punkt docelowy"
              onClick={() => onToChange(null)}
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onSwap}
            aria-label="Zamień punkty"
          >
            <ArrowDownUp size={14} /> Zamień
          </button>
        </div>

        <div className="route-alt" style={{ marginTop: 4 }}>
          {PROFILES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`route-alt__chip${profile === p.id ? ' route-alt__chip--active' : ''}`}
              onClick={() => onProfileChange(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary"
          onClick={onCalculate}
          disabled={!canCalculate || loading}
        >
          <Calculator size={16} /> {loading ? 'Obliczanie…' : 'Oblicz trasę'}
        </button>
        {routes.length > 0 && (
          <button type="button" className="btn" onClick={onClear}>
            <Trash2 size={16} /> Wyczyść
          </button>
        )}
      </div>

      {error && (
        <div className="state" role="alert">
          <div className="state__title">Nie udało się obliczyć trasy</div>
          <div className="state__message">{error}</div>
        </div>
      )}

      {routes.length > 0 && activeRoute && (
        <>
          <div className="route-summary">
            <div className="route-summary__stat">
              <span className="route-summary__value">
                {formatDistance(activeRoute.distance)}
              </span>
              <span className="route-summary__label">Dystans</span>
            </div>
            <div className="route-summary__stat">
              <span className="route-summary__value">
                {formatDuration(activeRoute.duration)}
              </span>
              <span className="route-summary__label">Czas</span>
            </div>
          </div>

          {routes.length > 1 && (
            <>
              <div className="panel__section-title">Warianty trasy</div>
              <div className="route-alt">
                {routes.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`route-alt__chip${
                      r.id === activeRoute.id ? ' route-alt__chip--active' : ''
                    }`}
                    onClick={() => onActiveRouteChange(r.id)}
                  >
                    {i === 0 ? 'Główna' : `Wariant ${i + 1}`} ·{' '}
                    {formatDuration(r.duration)}
                  </button>
                ))}
              </div>
            </>
          )}

          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={onStartNavigation}
          >
            <Navigation size={16} /> Rozpocznij nawigację
          </button>

          {incidents.length > 0 && (
            <>
              <div className="panel__section-title" style={{ marginTop: 4 }}>
                Zdarzenia na trasie ({incidents.length})
              </div>
              <ul className="incidents-list">
                {incidents.map((inc) => (
                  <li key={inc.id} className="incident-row">
                    <span className="incident-row__icon" aria-hidden>
                      {incidentIcon(inc.category)}
                    </span>
                    <div className="incident-row__body">
                      <div className="incident-row__title">
                        {incidentLabel(inc.category)}
                      </div>
                      <div className="incident-row__desc">{inc.description}</div>
                      <div className="incident-row__meta">
                        {inc.roadNumbers.length > 0 && (
                          <span>{inc.roadNumbers.join(' / ')}</span>
                        )}
                        {inc.delay > 0 && (
                          <span>opóźnienie {Math.round(inc.delay / 60)} min</span>
                        )}
                        <span>
                          za {Math.round(inc.distanceFromStart / 100) / 10} km
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="panel__section-title" style={{ marginTop: 4 }}>
            Kroki trasy
          </div>
          <ol className="steps">
            {activeRoute.steps.map((s, i) => (
              <li className="step" key={i}>
                <span className="step__icon" aria-hidden>
                  {i + 1}
                </span>
                <div className="step__body">
                  <div className="step__instruction">{s.instruction}</div>
                  <div className="step__meta">
                    {formatDistance(s.distance)} · {formatDuration(s.duration)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {routes.length === 0 && !error && (
        <div className="state">
          <RouteIcon size={28} className="state__icon" aria-hidden />
          <div className="state__title">Zaplanuj trasę</div>
          <div className="state__message">
            Wybierz punkt startowy i docelowy, a następnie oblicz trasę.
          </div>
        </div>
      )}

      {incidents.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--text-tertiary)',
            padding: '4px 0'
          }}
        >
          <AlertTriangle size={14} />
          <span>Dane o zdarzeniach: TomTom Traffic Incidents</span>
        </div>
      )}
    </div>
  );
}