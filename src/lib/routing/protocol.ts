import type { LonLat } from '../geo';

export interface PortPoint {
  id: string;
  lon: number;
  lat: number;
}

export interface RoutedPort {
  id: string;
  nm: number;
  route: LonLat[];
}

export type RouterRequest =
  | {
      id: number;
      type: 'explore';
      landUrl: string;
      origin: LonLat;
      radiusNm: number;
      /** keep ports whose sea distance falls in [min, max] nm */
      band: [number, number];
      ports: PortPoint[];
    }
  | { id: number; type: 'route'; landUrl: string; from: LonLat; to: LonLat };

export type RouterResponse =
  | { id: number; type: 'explore'; ports: RoutedPort[] }
  | { id: number; type: 'route'; route: LonLat[] | null; nm: number | null }
  | { id: number; type: 'error'; message: string };
