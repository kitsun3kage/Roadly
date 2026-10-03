import { useEffect, useRef, useState } from 'react';
import { Clock, MapPin, Navigation, Search, X } from 'lucide-react';
import { searchPlaces } from '../../services/geocoding';
import { useDebounce } from '../../hooks/useDebounce';
import type { Coordinates, Place, RecentSearch } from '../../types';

interface Props {
  recentSearches: RecentSearch[];
  onSelect: (p: Place) => void;
  onClearRecent: () => void;
  userLocation: Coordinates | null;
}

export default function SearchPanel({
  recentSearches,
  onSelect,
  onClearRecent,
  userLocation
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounced = useDebounce(query, 320);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    searchPlaces(q, { signal: ctrl.signal, near: userLocation ?? undefined, limit: 8 })
      .then((res) => {
        setResults(res);
        setActiveIndex(res.length ? 0 : -1);
      })
      .catch((e: any) => {
        if (e?.name === 'AbortError') return;
        setError('Nie udało się wyszukać. Sprawdź połączenie i spróbuj ponownie.');
        setResults([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [debounced, userLocation]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && results[activeIndex]) {
        onSelect(results[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  return (
    <>
      <div className="search">
        <div className="search__field">
          <Search size={18} aria-hidden style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="search__input"
            type="search"
            placeholder="Szukaj miejsc, adresów…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            aria-label="Szukaj miejsc"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && <div className="search__spinner" aria-label="Ładowanie" role="status" />}
          {query && !loading && (
            <button
              className="search__clear"
              aria-label="Wyczyść"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="results" role="listbox" aria-label="Wyniki wyszukiwania">
        {error && (
          <div className="state" role="alert">
            <div className="state__title">Błąd wyszukiwania</div>
            <div className="state__message">{error}</div>
          </div>
        )}

        {!error && query.trim().length >= 2 && results.length === 0 && !loading && (
          <div className="state">
            <MapPin size={28} className="state__icon" aria-hidden />
            <div className="state__title">Brak wyników</div>
            <div className="state__message">Spróbuj innej frazy lub sprawdź pisownię.</div>
          </div>
        )}

        {!error && results.length > 0 && (
          <>
            <div className="results__group-title">Wyniki</div>
            {results.map((p, i) => (
              <button
                key={p.id}
                role="option"
                aria-selected={i === activeIndex}
                className={`result-item${i === activeIndex ? ' result-item--active' : ''}`}
                onClick={() => onSelect(p)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className="result-item__icon" aria-hidden>
                  <MapPin size={16} />
                </span>
                <span className="result-item__body">
                  <span className="result-item__name">{p.name}</span>
                  {p.address && <span className="result-item__address">{p.address}</span>}
                </span>
              </button>
            ))}
          </>
        )}

        {!query && recentSearches.length > 0 && (
          <>
            <div
              className="results__group-title"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>Ostatnie</span>
              <button
                className="btn btn--ghost"
                style={{ fontSize: 12, padding: '2px 8px' }}
                onClick={onClearRecent}
              >
                Wyczyść
              </button>
            </div>
            {recentSearches.map((r) => (
              <button
                key={`${r.id}-${r.searchedAt}`}
                className="result-item"
                onClick={() =>
                  onSelect({
                    id: r.id,
                    name: r.name,
                    address: r.address,
                    coordinates: r.coordinates
                  })
                }
              >
                <span className="result-item__icon" aria-hidden>
                  <Clock size={16} />
                </span>
                <span className="result-item__body">
                  <span className="result-item__name">{r.name}</span>
                  {r.address && <span className="result-item__address">{r.address}</span>}
                </span>
              </button>
            ))}
          </>
        )}

        {!query && recentSearches.length === 0 && (
          <div className="state">
            <Navigation size={28} className="state__icon" aria-hidden />
            <div className="state__title">Zacznij od wyszukania miejsca</div>
            <div className="state__message">
              Wpisz adres, miasto lub nazwę miejsca, aby zobaczyć je na mapie.
            </div>
          </div>
        )}
      </div>
    </>
  );
}