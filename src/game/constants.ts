/**
 * Globalne stale gry.
 *
 * LOGICAL_W / LOGICAL_H to "rozdzielczosc logiczna" - wewnetrzna rozdzielczosc,
 * w ktorej rysujemy gre. Canvas jest potem skalowany w gore CALKOWITA
 * wielokrotnoscia (x2, x3, x4...), dzieki czemu pixel art pozostaje ostry.
 */

export const LOGICAL_W = 640;
export const LOGICAL_H = 360;

/**
 * Szerokosc swiata, po ktorej przewija sie kamera.
 *
 * Ulica (road.webp) jest rozciagana dokladnie na te szerokosc, a kamera pokazuje
 * jej fragment o szerokosci LOGICAL_W. Dzieki temu postacie ida w glab ulicy.
 */
export const WORLD_WIDTH = 1280;

/** Symulacja chodzi ze stalym krokiem 60 Hz, niezaleznie od odswiezania ekranu. */
export const FPS = 60;
export const FIXED_DT = 1 / FPS;

/**
 * Linia podlogi (y stop postaci).
 *
 * Ulica zajmuje dolna czesc ekranu; stopy stoja na jej przedniej czesci,
 * zostawiajac pas asfaltu na pierwszym planie.
 */
export const GROUND_Y = 330;

/** Granice areny, w ktorych moga poruszac sie postacie. */
export const STAGE_LEFT = 48;
export const STAGE_RIGHT = WORLD_WIDTH - 48;

/**
 * Docelowa wysokosc postaci na ekranie.
 *
 * Polowa wysokosci ekranu gry - tyle miejsca zajmuje postac od stop do czubka
 * glowy. Rzeczywisty rozmiar wynika z `frameH` i `originY` w konfiguracji
 * postaci, a ta stala jest punktem odniesienia dla grafik.
 */
export const CHARACTER_HEIGHT = LOGICAL_H / 2;

export const GRAVITY = 1.5;
export const MAX_FALL_SPEED = 30;
export const JUMP_VELOCITY = -20;

export const WALK_FORWARD_SPEED = 3.0;
export const WALK_BACK_SPEED = 2.4;
/**
 * Szybkosc ruchu w powietrzu.
 *
 * Skok trwa ok. 27 klatek, wiec przy tej predkosci postac przelatuje ok. 85 px.
 * To z zapasem wystarcza, aby przeskoczyc nad przeciwnikiem (MIN_SEPARATION = 56).
 */
export const AIR_SPEED = 3.2;

/** Minimalny dystans miedzy srodkami postaci (pushbox). */
export const MIN_SEPARATION = 56;

export const MAX_HP = 100;
export const MAX_METER = 100;
export const METER_PER_HIT_DEALT = 7;
export const METER_PER_HIT_TAKEN = 4;

export const ROUND_TIME_SECONDS = 60;
/** Ile rund trzeba wygrac, aby wygrac walke. 1 = pojedyncza runda. */
export const ROUNDS_TO_WIN = 1;

/** Maksymalna dlugosc animacji w klatkach, zabezpieczenie przed bledna konfiguracja. */
export const MAX_ANIM_FRAMES = 32;

/** Szybkosc doganiania przez kamere pozycji srodka walki (0..1 na klatke). */
export const CAMERA_LERP = 0.12;
