/**
 * Pelny ekran i orientacja pozioma.
 *
 * Bijatyki nie da sie sensownie grac w pionie: postacie sa szersze niz wyzsze,
 * a przyciski dotykowe zabieraja pol ekranu. Dlatego na telefonie wchodzimy
 * w pelny ekran i probujemy zablokowac orientacje pozioma.
 *
 * Zadna z tych rzeczy nie jest dostepna wszedzie - iOS nie ma blokady
 * orientacji wcale, a poza pelnym ekranem odrzuca ja wiekszosc przegladarek.
 * Dlatego kazda proba jest "best effort" i nie moze przerwac gry.
 */

type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
};

type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
};

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);

/**
 * Czy urzadzenie jest sterowane palcem (telefon, tablet).
 *
 * Samo `ontouchstart` nie wystarcza - mają je tez laptopy z ekranem dotykowym,
 * ktore maja mysz i klawiature. Wymuszanie na nich pelnego ekranu i blokady
 * orientacji byloby niespodzianka, dlatego patrzymy na typ wskaznika.
 */
export const isCoarsePointer = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export const isFullscreen = (): boolean => {
  if (typeof document === 'undefined') return false;
  const d = document as WebkitDocument;
  return Boolean(d.fullscreenElement ?? d.webkitFullscreenElement);
};

/** Wchodzi w pelny ekran. Zwraca false, gdy przegladarka odmowi. */
export const requestFullscreen = async (): Promise<boolean> => {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement as WebkitElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
    return true;
  } catch {
    return false;
  }
};

export const exitFullscreen = async (): Promise<void> => {
  if (typeof document === 'undefined') return;
  const d = document as WebkitDocument;
  try {
    if (d.exitFullscreen) await d.exitFullscreen();
    else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
  } catch {
    /* ignorowane - brak pelnego ekranu nie jest bledem */
  }
};

/**
 * Blokuje orientacje pozioma.
 *
 * Wymaga pelnego ekranu, dlatego wolamy to dopiero po `requestFullscreen`.
 */
export const lockLandscape = async (): Promise<boolean> => {
  if (typeof screen === 'undefined') return false;
  const orientation = screen.orientation as LockableOrientation | undefined;
  if (!orientation?.lock) return false;
  try {
    await orientation.lock('landscape');
    return true;
  } catch {
    return false;
  }
};

export const unlockOrientation = (): void => {
  if (typeof screen === 'undefined') return;
  const orientation = screen.orientation as LockableOrientation | undefined;
  try {
    orientation?.unlock?.();
  } catch {
    /* ignorowane */
  }
};

/**
 * Wlacza tryb gry na pelnym ekranie: pelny ekran + orientacja pozioma.
 *
 * Musi byc wywolane z gestu uzytkownika (klikniecie), inaczej przegladarka
 * odrzuci prosbe.
 */
export const enterGameFullscreen = async (): Promise<boolean> => {
  const ok = await requestFullscreen();
  if (ok) await lockLandscape();
  return ok;
};

/** Wychodzi z trybu gry: zwalnia orientacje i zamyka pelny ekran. */
export const leaveGameFullscreen = async (): Promise<void> => {
  unlockOrientation();
  await exitFullscreen();
};
