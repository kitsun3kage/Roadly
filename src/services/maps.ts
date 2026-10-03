export interface MapStyleOption {
  id: string;
  name: string;
  url: string;
}

export const MAP_STYLES: MapStyleOption[] = [
  {
    id: 'liberty',
    name: 'Domyślny',
    url: 'https://tiles.openfreemap.org/styles/liberty'
  },
  {
    id: 'bright',
    name: 'Jasny',
    url: 'https://tiles.openfreemap.org/styles/bright'
  },
  {
    id: 'positron',
    name: 'Minimalny',
    url: 'https://tiles.openfreemap.org/styles/positron'
  }
];

/**
 * Ostateczny fallback gdy główny styl mapy nie może zostać pobrany.
 * Używa rastrowych kafelków OpenStreetMap.
 */
export const FALLBACK_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors'
    }
  },
  layers: [
    {
      id: 'osm',
      type: 'raster' as const,
      source: 'osm'
    }
  ]
};

export const DEFAULT_CENTER: [number, number] = [19.456, 51.759]; // Łódź
export const DEFAULT_ZOOM = 6;