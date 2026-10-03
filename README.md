# Roadly

Nowoczesna aplikacja mapowa w przeglądarce: wyszukiwanie miejsc, planowanie tras
i nawigacja oparta na rzeczywistych danych OpenStreetMap.

Inspirowana prostotą i płynnością Apple Maps, ale zbudowana w całości
na otwartych technologiach i otwartych danych.

## Funkcje

- **Interaktywna mapa** (MapLibre GL JS) — panoramowanie, zoom, obrót, pochylenie.
- **Wyszukiwanie miejsc** — adresy, miasta, ulice, POI (Nominatim lub Photon).
- **Planowanie tras** — OSRM, dystans, czas, kroki dojazdu, warianty alternatywne.
- **Tryb nawigacji** — śledzenie pozycji GPS, pozostały dystans, ETA, następny manewr.
- **Geolokalizacja** — przycisk „Moja lokalizacja”, wskaźnik dokładności, obsługa błędów.
- **Zapisane miejsca** — kolekcje, notatki, eksport/import JSON.
- **Motywy** — jasny, ciemny, systemowy.
- **Responsywność** — telefon, tablet, laptop, desktop.

## Wymagania

- Node.js 18+ i npm
- Nowoczesna przeglądarka (Safari, Chrome, Firefox, Edge)
- HTTPS w produkcji (wymóg Geolocation API)

## Instalacja

```bash
npm install
npm run dev