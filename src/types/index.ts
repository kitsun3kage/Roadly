export interface Coordinates {
  lng: number;
  lat: number;
}

export interface Place {
  id: string;
  name: string;
  address?: string;
  coordinates: Coordinates;
  category?: string;
  website?: string;
  phone?: string;
  openingHours?: string;
  boundingBox?: [number, number, number, number];
  raw?: unknown;
}

export type TravelProfile = 'driving' | 'cycling' | 'walking';

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  maneuver: {
    type: string;
    modifier?: string;
    location: Coordinates;
  };
  geometry: [number, number][];
}

export interface Route {
  id: string;
  distance: number;
  duration: number;
  geometry: [number, number][];
  steps: RouteStep[];
  profile: TravelProfile;
}

export interface SavedPlace extends Place {
  savedId: string;
  collectionId: string;
  note?: string;
  savedAt: number;
}

export interface Collection {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface RecentSearch {
  id: string;
  name: string;
  address?: string;
  coordinates: Coordinates;
  searchedAt: number;
}