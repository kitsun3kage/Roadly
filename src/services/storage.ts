import type { Collection, RecentSearch, SavedPlace } from '../types';

const KEYS = {
  collections: 'roadly.collections.v1',
  savedPlaces: 'roadly.savedPlaces.v1',
  recentSearches: 'roadly.recentSearches.v1',
  theme: 'roadly.theme.v1'
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const storage = {
  getCollections(): Collection[] {
    return read<Collection[]>(KEYS.collections, []);
  },
  setCollections(list: Collection[]): boolean {
    return write(KEYS.collections, list);
  },

  getSavedPlaces(): SavedPlace[] {
    return read<SavedPlace[]>(KEYS.savedPlaces, []);
  },
  setSavedPlaces(list: SavedPlace[]): boolean {
    return write(KEYS.savedPlaces, list);
  },

  getRecentSearches(): RecentSearch[] {
    return read<RecentSearch[]>(KEYS.recentSearches, []);
  },
  setRecentSearches(list: RecentSearch[]): boolean {
    return write(KEYS.recentSearches, list.slice(0, 12));
  },

  getTheme(): 'light' | 'dark' | 'system' {
    return read<'light' | 'dark' | 'system'>(KEYS.theme, 'system');
  },
  setTheme(t: 'light' | 'dark' | 'system'): boolean {
    return write(KEYS.theme, t);
  },

  exportAll() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      collections: this.getCollections(),
      savedPlaces: this.getSavedPlaces(),
      recentSearches: this.getRecentSearches()
    };
  },

  importAll(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    let ok = true;
    if (Array.isArray(d.collections)) ok = this.setCollections(d.collections as Collection[]) && ok;
    if (Array.isArray(d.savedPlaces)) ok = this.setSavedPlaces(d.savedPlaces as SavedPlace[]) && ok;
    if (Array.isArray(d.recentSearches))
      ok = this.setRecentSearches(d.recentSearches as RecentSearch[]) && ok;
    return ok;
  },

  clearAll(): void {
    try {
      localStorage.removeItem(KEYS.collections);
      localStorage.removeItem(KEYS.savedPlaces);
      localStorage.removeItem(KEYS.recentSearches);
    } catch {
      /* ignore */
    }
  }
};