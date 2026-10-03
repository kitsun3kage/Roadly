import { Route as RouteIcon, Search, Settings, Star } from 'lucide-react';

type View = 'search' | 'route' | 'collections' | 'settings';

interface Props {
  view: View;
  onView: (v: View) => void;
}

const ITEMS: { id: View; label: string; icon: typeof Search }[] = [
  { id: 'search', label: 'Szukaj', icon: Search },
  { id: 'route', label: 'Trasa', icon: RouteIcon },
  { id: 'collections', label: 'Zapisane', icon: Star },
  { id: 'settings', label: 'Ustawienia', icon: Settings }
];

export default function TabBar({ view, onView }: Props) {
  return (
    <nav className="tabbar" aria-label="Nawigacja główna">
      {ITEMS.map((it) => {
        const Icon = it.icon;
        return (
          <button
            key={it.id}
            className={`tabbar__btn${view === it.id ? ' tabbar__btn--active' : ''}`}
            onClick={() => onView(it.id)}
            aria-label={it.label}
            aria-current={view === it.id ? 'page' : undefined}
          >
            <Icon size={18} />
            <span>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}