import type { StageDef } from '../types';
import { WORLD_WIDTH } from '../constants';
import { assetUrl } from '../assets/url';

/**
 * Arena walki.
 *
 * `bgr.webp` to NIERUCHOME tlo - nie porusza sie przy przewijaniu kamery.
 * `road.webp` to ulica rozciagnieta na cala szerokosc swiata (WORLD_WIDTH);
 * kamera pokazuje jej fragment, wiec postacie ida w glab ulicy.
 *
 * Wymiary zrodlowe:
 *   bgr.webp  - 1536x1024 (proporcja 3:2)
 *   road.webp - 7646x1031 (dlugi pas, proporcja ~7.4:1)
 *
 * Wysokosc i pozycja ulicy nie sa zapisane na sztywno - loader wylicza je
 * z rzeczywistej proporcji grafiki, dzieki czemu podmiana pliku nie rozjedzie
 * ukladu.
 */
export const STAGE: StageDef = {
  id: 'street',
  name: 'Ulica',
  background: assetUrl('assets/backgrounds/bgr.webp'),
  road: assetUrl('assets/backgrounds/road.webp'),
  groundColor: '#1b1a20',
  groundAccent: '#33303a',
};

/** Szerokosc, na jaka rozciagana jest ulica. */
export const ROAD_WIDTH = WORLD_WIDTH;

