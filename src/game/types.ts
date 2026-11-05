import type { Rect } from './core/math';

/** Nazwy animacji - dokladnie te, ktore musza znalezc sie w spritesheecie. */
export type AnimName =
  | 'idle'
  | 'walkForward'
  | 'walkBack'
  | 'crouch'
  | 'jump'
  | 'lightAttack'
  | 'heavyAttack'
  | 'airAttack'
  | 'special'
  | 'block'
  | 'hit'
  | 'knockdown'
  | 'victory'
  | 'defeat';

export const ANIM_NAMES: readonly AnimName[] = [
  'idle',
  'walkForward',
  'walkBack',
  'crouch',
  'jump',
  'lightAttack',
  'heavyAttack',
  'special',
  'block',
  'hit',
  'knockdown',
  'victory',
  'defeat',
  'airAttack',
];

/** Opis jednej animacji wewnatrz siatki spritesheeta. */
export interface AnimDef {
  /** Wiersz w spritesheecie (0-based). */
  row: number;
  /** Kolumna, w ktorej zaczyna sie pierwsza klatka (0-based). */
  startCol?: number;
  /** Ile klatek animacji. */
  frames: number;
  /** Predkosc odtwarzania. */
  fps: number;
  /** Czy animacja zapetla sie. */
  loop: boolean;
}

/**
 * Arkusz zawierajacy jedna animacje (np. cykl chodu dostarczony osobno).
 *
 * Klatki moga lezec w siatce `columns` x `rows` - loader sklada je w jeden
 * poziomy rzad i skaluje do rozmiaru klatki postaci, wiec reszta kodu widzi
 * zwykly arkusz.
 */
export interface AnimSheetDef {
  /** Sciezka do grafiki wzgledem katalogu public. */
  sheet: string;
  /** Liczba kolumn w siatce klatek. */
  columns: number;
  /** Liczba wierszy w siatce klatek. */
  rows: number;
  /**
   * Wymusza skale rysowania. Bez tego skala jest wyliczana z obrysu sylwetki,
   * a postac wypelnia klatke. Podaj ta sama wartosc dla kilku arkuszy, jesli
   * postac ma zachowac identyczny rozmiar miedzy animacjami.
   */
  scale?: number;
  /**
   * Wedlug czego dopasowac rozmiar postaci, gdy skala nie jest podana.
   *
   * `height` (domyslnie) bierze wysokosc obrysu - dobre dla postaci stojacych.
   * `width` bierze szerokosc, co jest konieczne dla pozy lezacej: jej "wzrost"
   * to dlugosc ciala, wiec dopasowanie po wysokosci rozciagneloby postac na
   * cala szerokosc klatki.
   */
  fit?: 'height' | 'width';
  /**
   * Na czym zakotwiczyc klatke w poziomie.
   *
   * `hips` (domyslnie) stawia biodra na osi postaci - dobre dla postaci
   * stojacych i atakow. `center` stawia na osi srodek obrysu, co jest jedynym
   * sensownym wyborem dla pozy lezacej, gdzie nie da sie wskazac bioder.
   */
  anchor?: 'hips' | 'center';
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  /** Sciezka do glownego spritesheeta wzgledem katalogu public. */
  sheet: string;
  /** Portret do ekranu wyboru postaci. */
  portrait: string;
  /**
   * Arkusze dla pojedynczych animacji. Animacje bez wpisu korzystaja z `sheet`.
   * Pozwala dokladac animacje pojedynczo, bez czekania na pelny arkusz.
   */
  animationSheets?: Partial<Record<AnimName, AnimSheetDef>>;
  /**
   * W ktora strone patrzy postac na grafice. Domyslnie 'right'.
   *
   * Postac jest odbijana lustrzanie, gdy patrzy w strone przeciwna do tej
   * w arkuszu - bez tego przy zlym zalozeniu obie postacie stalyby plecami.
   */
  sheetFacing?: 'left' | 'right';
  /**
   * Portrety do paska zycia, od stanu nietknietego do najmocniej obitego.
   *
   * Indeks rosnie razem z otrzymanymi obrazeniami, wiec `[0]` to postac
   * w pelni sil, a ostatni element to postac bliska nokautu. Gdy wpisu brak
   * (albo grafiki sie nie wczytaja), HUD uzywa zwyklego `portrait`.
   */
  damagePortraits?: readonly string[];
  frameW: number;
  frameH: number;
  /** Ile klatek miesci sie w jednym wierszu arkusza. */
  columns: number;
  /** Punkt zaczepienia (stopy) wewnatrz klatki. */
  originX: number;
  originY: number;
  /** Pudelko kolizyjne liczace sie od stop. */
  bodyW: number;
  bodyH: number;
  /** Kolory uzywane przez proceduralny placeholder. */
  palette: {
    skin: string;
    primary: string;
    secondary: string;
    outline: string;
  };
  animations: Record<AnimName, AnimDef>;
}

export interface AttackDef {
  anim: AnimName;
  /** Klatki bezczynnosci przed pojawieniem sie hitboxa. */
  startup: number;
  /** Klatki, w ktorych hitbox jest aktywny. */
  active: number;
  /** Klatki powrotu do neutralnej pozycji. */
  recovery: number;
  damage: number;
  /** Hitbox wzgledem stop postaci; x rosnie w kierunku, w ktorym patrzy postac. */
  hitbox: Rect;
  hitstun: number;
  blockstun: number;
  knockback: { x: number; y: number };
  hitstop: number;
  /** Atak wypuszcza pocisk zamiast zadawac cios bezposrednio. */
  projectile?: boolean;
  /** Koszt paska energii. */
  meterCost?: number;
  /** Atak nie da sie zablokowac. */
  unblockable?: boolean;
}

export type AttackKind = 'light' | 'heavy' | 'special' | 'air';

export interface StageLayer {
  /** Sciezka do grafiki warstwy wzgledem katalogu public. */
  image: string;
  /** 0 = nieruchome (niebo), 1 = porusza sie z kamera. */
  parallax: number;
  /** Pozycja Y gornej krawedzi warstwy w rozdzielczosci logicznej. */
  y: number;
  /** Wysokosc rysowania; brak = naturalna wysokosc grafiki. */
  height?: number;
  /** Warstwa zapetla sie poziomo. */
  repeat: boolean;
}

/**
 * Arena walki.
 *
 * `background` to NIERUCHOME tlo (parallax 0) - nie rusza sie przy przewijaniu.
 * `road` to ulica rozciagniieta na cala szerokosc swiata (WORLD_WIDTH); kamera
 * pokazuje jej fragment, wiec postacie ida w glab ulicy.
 */
export interface StageDef {
  id: string;
  name: string;
  background: string;
  road: string;
  groundColor: string;
  groundAccent: string;
}

export type FighterState =
  | 'idle'
  | 'walkForward'
  | 'walkBack'
  | 'crouch'
  | 'jump'
  | 'attack'
  | 'block'
  | 'hit'
  | 'knockdown'
  | 'victory'
  | 'defeat';

export type Side = 'player' | 'bot';

/** Identyfikatory wybieralnych postaci. */
export type CharacterId = 'c1' | 'c2';

export const CHARACTER_IDS: readonly CharacterId[] = ['c1', 'c2'];

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  light: boolean;
  heavy: boolean;
  special: boolean;
  block: boolean;
}

export const emptyInput = (): InputState => ({
  left: false,
  right: false,
  up: false,
  down: false,
  light: false,
  heavy: false,
  special: false,
  block: false,
});

/** Jednorazowe wcisniecia w danej klatce (klawiatura/gamepad/touch). */
export interface InputEdges {
  up: boolean;
  light: boolean;
  heavy: boolean;
  special: boolean;
}

export interface GameSnapshot {
  phase: 'fight' | 'paused' | 'ko' | 'result';
  winner: Side | null;
  playerHp: number;
  botHp: number;
  playerMeter: number;
  botMeter: number;
  timer: number;
  round: number;
  wins: { player: number; bot: number };
}
