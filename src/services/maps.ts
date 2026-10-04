export interface MapStyleOption {
  id: string;
  name: string;
  url?: string;
  style?: Record<string, unknown>;
}

/**
 * Klasyczny styl OpenStreetMap — żółte drogi drugorzędne,
 * czerwone/pomarańczowe główne, piaskowe tło.
 */
const OSM_RASTER_STYLE: Record<string, unknown> = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
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
      type: 'raster',
      source: 'osm'
    }
  ]
};

export const MAP_STYLES: MapStyleOption[] = [
  {
    id: 'osm',
    name: 'Klasyczny',
    style: OSM_RASTER_STYLE
  },
  {
    id: 'liberty',
    name: 'Liberty',
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

export const FALLBACK_STYLE = OSM_RASTER_STYLE;

export const DEFAULT_CENTER: [number, number] = [19.456, 51.759];
export const DEFAULT_ZOOM = 6;