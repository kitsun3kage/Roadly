import { Download, Info, Palette, Trash2, Upload } from 'lucide-react';
import { useRef } from 'react';
import { MAP_STYLES } from '../../services/maps';
import { isSupabaseEnabled } from '../../lib/supabase';

interface Props {
  theme: 'light' | 'dark' | 'system';
  onThemeChange: (t: 'light' | 'dark' | 'system') => void;
  styleId: string;
  onStyleChange: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onClearAll: () => void;
}

export default function SettingsPanel(props: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="panel">
      <div className="panel__header">
        <Palette size={18} />
        <h2 className="panel__title">Ustawienia</h2>
      </div>

      <div className="panel__section">
        <div className="panel__section-title">Motyw</div>
        <div className="route-alt">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button
              key={t}
              className={`route-alt__chip${props.theme === t ? ' route-alt__chip--active' : ''}`}
              onClick={() => props.onThemeChange(t)}
            >
              {t === 'light' ? 'Jasny' : t === 'dark' ? 'Ciemny' : 'Systemowy'}
            </button>
          ))}
        </div>
      </div>

      <div className="panel__section">
        <div className="panel__section-title">Styl mapy</div>
        <div className="route-alt">
          {MAP_STYLES.map((s) => (
            <button
              key={s.id}
              className={`route-alt__chip${props.styleId === s.id ? ' route-alt__chip--active' : ''}`}
              onClick={() => props.onStyleChange(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="panel__section">
        <div className="panel__section-title">Dane lokalne</div>
        <div className="btn-row">
          <button className="btn" onClick={props.onExport}>
            <Download size={16} /> Eksportuj
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Importuj
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) props.onImport(f);
              e.target.value = '';
            }}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <button className="btn btn--danger" onClick={props.onClearAll}>
            <Trash2 size={16} /> Wyczyść wszystkie dane
          </button>
        </div>
      </div>

      <div className="panel__section">
        <div className="panel__section-title">O aplikacji</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
          Roadly korzysta z danych OpenStreetMap, geokodowania Nominatim oraz routingu OSRM.
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
          Synchronizacja w chmurze: {isSupabaseEnabled ? 'skonfigurowana' : 'niedostępna'}.
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
          <Info size={12} style={{ verticalAlign: -2 }} /> Nawigacja opiera się na geometrii trasy
          i aktualnej pozycji GPS. Aplikacja nie dostarcza danych o ruchu drogowym ani
          informacji o fotoradarach.
        </p>
      </div>
    </div>
  );
}