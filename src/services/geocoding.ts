import type { Coordinates, Place } from '../types';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
const PHOTON_URL = 'https://photon.komoot.io';

const provider =
  (import.meta.env.VITE_GEOCODING_PROVIDER as string | undefined) || 'nominatim';

export interface SearchOptions {
  signal?: AbortSignal;
  limit?: number;
  near?: Coordinates;
}

async function nominatimSearch(query: string, opts: SearchOptions): Promise<Place[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    extratags: '1',
    limit: String(opts.limit ?? 8),
    'accept-language': 'pl,en'
  });
  const res = await fetch(`${NOMINATIM_URL}/search?${params.toString()}`, {
    signal: opts.signal,
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`Nominatim: ${res.status}`);
  const data = (await res.json()) as any[];
  return data.map((item, i) => {
    const bb = item.boundingbox;
    return {
      id: `nom-${item.osm_type || 'x'}-${item.osm_id || i}`,
      name: item.name || item.display_name?.split(',')[0] || 'Bez nazwy',
      address: item.display_name,
      coordinates: {
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon)
      },
      category: item.type || item.class,
      website: item.extratags?.website,
      phone: item.extratags?.phone,
      openingHours: item.extratags?.opening_hours,
      boundingBox: bb
        ? [parseFloat(bb[0]), parseFloat(bb[1]), parseFloat(bb[2]), parseFloat(bb[3])]
        : undefined,
      raw: item
    } as Place;
  });
}

async function photonSearch(query: string, opts: SearchOptions): Promise<Place[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(opts.limit ?? 8),
    lang: 'pl'
  });
  if (opts.near) {
    params.set('lat', String(opts.near.lat));
    params.set('lon', String(opts.near.lng));
  }
  const res = await fetch(`${PHOTON_URL}/api/?${params.toString()}`, {
    signal: opts.signal
  });
  if (!res.ok) throw new Error(`Photon: ${res.status}`);
  const data = (await res.json()) as { features: any[] };
  return (data.features || []).map((f, i) => {
    const p = f.properties || {};
    const [lng, lat] = f.geometry.coordinates;
    const addressParts = [p.street, p.housenumber, p.postcode, p.city, p.country].filter(
      Boolean
    );
    return {
      id: `photon-${p.osm_id || i}`,
      name: p.name || addressParts[0] || 'Bez nazwy',
      address: addressParts.join(', '),
      coordinates: { lat, lng },
      category: p.osm_value,
      website: p.website,
      phone: p.phone
    } as Place;
  });
}

export async function searchPlaces(
  query: string,
  opts: SearchOptions = {}
): Promise<Place[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (provider === 'photon') return photonSearch(trimmed, opts);
  return nominatimSearch(trimmed, opts);
}

export async function reverseGeocode(
  coord: Coordinates,
  signal?: AbortSignal
): Promise<Place | null> {
  if (provider === 'photon') {
    const res = await fetch(
      `${PHOTON_URL}/reverse?lat=${coord.lat}&lon=${coord.lng}&lang=pl`,
      { signal }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const f = data.features?.[0];
    if (!f) return null;
    const p = f.properties || {};
    return {
      id: `photon-rev-${p.osm_id}`,
      name: p.name || p.street || 'Lokalizacja',
      address: [p.street, p.housenumber, p.postcode, p.city].filter(Boolean).join(', '),
      coordinates: coord
    };
  }
  const params = new URLSearchParams({
    lat: String(coord.lat),
    lon: String(coord.lng),
    format: 'jsonv2',
    'accept-language': 'pl,en'
  });
  const res = await fetch(`${NOMINATIM_URL}/reverse?${params.toString()}`, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  return {
    id: `nom-rev-${data.osm_type}-${data.osm_id}`,
    name: data.name || data.display_name?.split(',')[0] || 'Lokalizacja',
    address: data.display_name,
    coordinates: coord,
    category: data.type
  };
}