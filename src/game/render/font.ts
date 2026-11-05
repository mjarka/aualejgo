/**
 * Wspolna rodzina fontow dla calej gry.
 *
 * Pixelify Sans to font pixel-artowy - trzyma sie go zarowno UI (CSS),
 * jak i tekst rysowany bezposrednio na canvasie (HUD, komunikaty rundy).
 * Pliki .woff2 leza lokalnie w public/assets/fonts, wiec gra nie zalezy
 * od polaczenia z Google Fonts.
 */
export const FONT_FAMILY = '"Pixelify Sans", "Courier New", monospace';

/** Buduje skrot fontu w formacie akceptowanym przez CanvasRenderingContext2D. */
export const gameFont = (size: number, weight: number | 'bold' = 'bold'): string =>
  `${weight} ${size}px ${FONT_FAMILY}`;

/**
 * Rozmiary, w ktorych tekst trafia na canvas. Wypisane jawnie, bo przegladarka
 * wczytuje kroj tylko dla konkretnych wariantow uzytych w `document.fonts.load`.
 */
export const CANVAS_FONT_SIZES = [9, 12, 13, 22, 30] as const;

/**
 * Czeka, az kroj bedzie gotowy do rysowania na canvasie.
 *
 * Bez tego pierwsze klatki HUD-u moga zostac narysowane fontem zapasowym,
 * zanim przegladarka skonczy ladowac .woff2.
 */
export const ensureGameFont = async (): Promise<void> => {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all(CANVAS_FONT_SIZES.map((size) => document.fonts.load(gameFont(size))));
    await document.fonts.ready;
  } catch {
    // brak fontu nie jest bledem krytycznym - zostaje kroj zapasowy
  }
};
