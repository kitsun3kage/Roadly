import { useState } from 'react';
import { FolderPlus, Navigation, Pencil, Star, Trash2 } from 'lucide-react';
import type { Collection, Place, SavedPlace } from '../../types';

interface Props {
  collections: Collection[];
  savedPlaces: SavedPlace[];
  onRemove: (savedId: string) => void;
  onCreateCollection: (name: string) => string;
  onRenameCollection: (id: string, name: string) => void;
  onDeleteCollection: (id: string) => void;
  onSelect: (place: Place) => void;
  onNavigate: (place: Place) => void;
  onShowToast: (msg: string, kind?: 'info' | 'error') => void;
}

export default function CollectionsPanel(props: Props) {
  const {
    collections,
    savedPlaces,
    onRemove,
    onCreateCollection,
    onRenameCollection,
    onDeleteCollection,
    onSelect,
    onNavigate
  } = props;

  const [newName, setNewName] = useState('');
  const [activeCollection, setActiveCollection] = useState<string | 'all'>('all');

  const visible =
    activeCollection === 'all'
      ? savedPlaces
      : savedPlaces.filter((p) => p.collectionId === activeCollection);

  return (
    <div className="panel">
      <div className="panel__header">
        <Star size={18} />
        <h2 className="panel__title">Zapisane</h2>
      </div>

      <div className="panel__section">
        <div className="panel__section-title">Kolekcje</div>
        <div className="route-alt">
          <button
            className={`route-alt__chip${activeCollection === 'all' ? ' route-alt__chip--active' : ''}`}
            onClick={() => setActiveCollection('all')}
          >
            Wszystkie ({savedPlaces.length})
          </button>
          {collections.map((c) => (
            <button
              key={c.id}
              className={`route-alt__chip${activeCollection === c.id ? ' route-alt__chip--active' : ''}`}
              onClick={() => setActiveCollection(c.id)}
            >
              {c.name} ({savedPlaces.filter((p) => p.collectionId === c.id).length})
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            className="search__input"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '0 12px',
              height: 38,
              flex: 1
            }}
            placeholder="Nowa kolekcja"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) {
                onCreateCollection(newName.trim());
                setNewName('');
              }
            }}
            aria-label="Nazwa nowej kolekcji"
          />
          <button
            className="btn"
            onClick={() => {
              if (!newName.trim()) return;
              onCreateCollection(newName.trim());
              setNewName('');
            }}
            disabled={!newName.trim()}
            aria-label="Utwórz kolekcję"
          >
            <FolderPlus size={16} />
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="state">
          <Star size={28} className="state__icon" aria-hidden />
          <div className="state__title">Brak zapisanych miejsc</div>
          <div className="state__message">
            Zapisz miejsca, aby mieć do nich szybki dostęp z dowolnego widoku.
          </div>
        </div>
      ) : (
        <ul>
          {visible.map((p) => (
            <li key={p.savedId} className="row">
              <button
                className="row__body"
                style={{ textAlign: 'left' }}
                onClick={() => onSelect(p)}
              >
                <div className="row__title">{p.name}</div>
                {p.address && <div className="row__sub">{p.address}</div>}
              </button>
              <button
                className="btn btn--ghost btn--icon"
                aria-label="Prowadź"
                onClick={() => onNavigate(p)}
              >
                <Navigation size={16} />
              </button>
              <button
                className="btn btn--ghost btn--icon"
                aria-label="Usuń"
                onClick={() => onRemove(p.savedId)}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {activeCollection !== 'all' && (
        <div className="btn-row">
          <button
            className="btn"
            onClick={() => {
              const name = prompt('Nowa nazwa kolekcji');
              if (name && name.trim()) onRenameCollection(activeCollection, name.trim());
            }}
          >
            <Pencil size={14} /> Zmień nazwę
          </button>
          <button
            className="btn btn--danger"
            onClick={() => {
              if (confirm('Usunąć kolekcję wraz z zapisanymi miejscami?')) {
                onDeleteCollection(activeCollection);
                setActiveCollection('all');
              }
            }}
          >
            <Trash2 size={14} /> Usuń kolekcję
          </button>
        </div>
      )}
    </div>
  );
}