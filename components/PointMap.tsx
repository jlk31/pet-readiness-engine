'use client';

import { useEffect, useRef, useState } from 'react';

// Minimal slice of the Google Maps JS API we use (no @types dependency).
type Pt = { lat: number; lng: number };
type Coord = number | (() => number);
interface GMap { panTo(p: Pt): void; setZoom(z: number): void; getZoom(): number | undefined; addListener(e: 'click', cb: (ev: { latLng?: { lat(): number; lng(): number } | null }) => void): unknown }
interface GMarker { position: { lat: Coord; lng: Coord } | null; addListener(e: 'dragend', cb: () => void): unknown }
interface Maps {
  importLibrary(n: 'maps'): Promise<{ Map: new (el: HTMLElement, o: object) => GMap; ColorScheme: { FOLLOW_SYSTEM: unknown } }>;
  importLibrary(n: 'marker'): Promise<{ AdvancedMarkerElement: new (o: object) => GMarker }>;
}
declare global { interface Window { google?: { maps: Maps }; __mapsReady?: () => void } }

const num = (c: Coord) => (typeof c === 'function' ? c() : c);

let loading: Promise<void> | undefined;
// Created by our nonce'd chunk, so 'strict-dynamic' trusts it; no nonce needed here.
const loadMaps = (key: string) => (loading ??= new Promise<void>((ok, fail) => {
  window.__mapsReady = ok;
  const s = document.createElement('script');
  s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&v=weekly&callback=__mapsReady`;
  s.async = true;
  s.onerror = () => { loading = undefined; fail(new Error('Google Maps failed to load')); };
  document.head.append(s);
}));

interface Props {
  point: { lat: number; lon: number } | null;
  /** Resolves true if the point was accepted; on false the pin snaps back. */
  onPick: (lat: number, lon: number) => Promise<boolean>;
}

function PointMap({ point, onPick }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<{ map: GMap; marker: GMarker } | null>(null);
  const pointRef = useRef(point);
  const pick = useRef(onPick);
  pointRef.current = point;
  pick.current = onPick;
  const [failed, setFailed] = useState(false);

  const show = (p: typeof point) => {
    if (!api.current) return;
    const { map, marker } = api.current;
    marker.position = p && { lat: p.lat, lng: p.lon };
    if (p) { map.panTo({ lat: p.lat, lng: p.lon }); if ((map.getZoom() ?? 0) < 13) map.setZoom(14); }
  };

  useEffect(() => {
    if (!el.current) return;
    let live = true;
    (async () => {
      await loadMaps(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!);
      const g = window.google!.maps;
      const [{ Map, ColorScheme }, { AdvancedMarkerElement }] = await Promise.all([g.importLibrary('maps'), g.importLibrary('marker')]);
      if (!live || !el.current) return;
      const p = pointRef.current;
      const map = new Map(el.current, {
        center: p ? { lat: p.lat, lng: p.lon } : { lat: 54, lng: -2.5 }, zoom: p ? 14 : 5, mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
        colorScheme: ColorScheme.FOLLOW_SYSTEM, disableDefaultUI: true, zoomControl: true, gestureHandling: 'cooperative',
      });
      const marker = new AdvancedMarkerElement({ map, gmpDraggable: true, title: 'Your exact spot', position: p && { lat: p.lat, lng: p.lon } });
      api.current = { map, marker };
      const choose = async (lat: number, lng: number) => {
        marker.position = { lat, lng };
        if (!(await pick.current(lat, lng))) show(pointRef.current);
      };
      map.addListener('click', (e) => e.latLng && choose(e.latLng.lat(), e.latLng.lng()));
      marker.addListener('dragend', () => marker.position && choose(num(marker.position.lat), num(marker.position.lng)));
    })().catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []);

  useEffect(() => show(point), [point]); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return null;
  return (
    <div className="flex flex-col gap-2">
      <div ref={el} role="region" aria-label="Map to set your exact location" className="h-56 w-full overflow-hidden rounded-[1.5rem] border border-line bg-bg" />
      <p className="text-xs text-muted">Click the map or drag the pin to your exact spot</p>
    </div>
  );
}

// No key, or the artifact preview: render nothing (and let the bundler drop the loader).
export default process.env.NEXT_PUBLIC_PREVIEW === '1' || !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? () => null : PointMap;
