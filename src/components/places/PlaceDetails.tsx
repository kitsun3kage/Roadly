import { memo } from 'react';
import {
  ArrowLeft,
  Copy,
  Globe,
  MapPin,
  Navigation,
  Phone,
  Share2,
  Star
} from 'lucide-react';
import type { Place } from '../../types';
import { formatCoords } from '../../lib/utils';

interface Props {
  place: Place;
  onClose: () => void;
  onSetOrigin: (p: Place) => void;
  onSetDestination: (p: Place) => void;
  onSave: (p: Place) => void;
  isSaved: boolean;
  onShowToast: (msg: string, kind?: 'info' | 'error') => void;
}

function PlaceDetailsInner({
  place,
  onClose,
  onSetOrigin,
  onSetDestination,
  onSave,
  isSaved,
  onShowToast
}: Props) {
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onShowToast(`Skopiowano ${label}`);
    } catch {
      onShowToast('Nie udało się skopiować', 'error');
    }
  };

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}?lat=${place.coordinates.lat}&lng=${place.coordinates.lng}&name=${encodeURIComponent(place.name)}`;
    const nav = navigator as Navigator & { share?: (data: any) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: place.name, text: place.address ?? place.name, url });
        return;
      } catch {
        /* anulowano */
      }
    }
    copy(url, 'link');
  };

  return (
    <div className="panel">
      <div className="panel__header">
        <button
          className="btn btn--ghost btn--icon"
          aria-label="Wróć"
          onClick={onClose}
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <button
            className="btn btn--ghost btn--icon"
            aria-label="Udostępnij"
            onClick={share}
          >
            <Share2 size={18} />
          </button>
        </div>
      </div>

      <div className="place-hero">
        <div className="place-hero__name">{place.name}</div>
        {place.address && <div className="place-hero__address">{place.address}</div>}
        {place.category && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {place.category}
          </div>
        )}
      </div>

      <div className="btn-row">
        <button className="btn btn--primary" onClick={() => onSetDestination(place)}>
          <Navigation size={16} /> Prowadź
        </button>
        <button className="btn" onClick={() => onSetOrigin(place)}>
          <MapPin size={16} /> Start tutaj
        </button>
        <button
          className="btn"
          onClick={() => onSave(place)}
          disabled={isSaved}
          aria-label="Zapisz miejsce"
        >
          <Star size={16} fill={isSaved ? 'currentColor' : 'none'} />
          {isSaved ? 'Zapisane' : 'Zapisz'}
        </button>
      </div>

      <div className="panel__section">
        <div className="panel__section-title">Współrzędne</div>
        <div className="kv">
          <span className="kv__k">Szerokość</span>
          <span>{place.coordinates.lat.toFixed(5)}</span>
          <span className="kv__k">Długość</span>
          <span>{place.coordinates.lng.toFixed(5)}</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <button
            className="btn btn--ghost"
            onClick={() =>
              copy(formatCoords(place.coordinates.lng, place.coordinates.lat), 'współrzędne')
            }
          >
            <Copy size={14} /> Kopiuj
          </button>
        </div>
      </div>

      {(place.website || place.phone || place.openingHours) && (
        <div className="panel__section">
          <div className="panel__section-title">Informacje</div>
          <div className="kv">
            {place.website && (
              <>
                <span className="kv__k" aria-hidden>
                  <Globe size={14} style={{ verticalAlign: -2 }} />
                </span>
                <a href={place.website} target="_blank" rel="noopener noreferrer">
                  {place.website}
                </a>
              </>
            )}
            {place.phone && (
              <>
                <span className="kv__k" aria-hidden>
                  <Phone size={14} style={{ verticalAlign: -2 }} />
                </span>
                <a href={`tel:${place.phone}`}>{place.phone}</a>
              </>
            )}
            {place.openingHours && (
              <>
                <span className="kv__k">Godziny</span>
                <span>{place.openingHours}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(PlaceDetailsInner);