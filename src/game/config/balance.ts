import type { AttackDef, AttackKind } from '../types';

/**
 * Frame data atakow.
 *
 * Wszystkie wartosci podane w klatkach przy 60 Hz. Hitbox liczony jest
 * wzgledem stop postaci - x dodatni to kierunek patrzenia, y ujemny to gora.
 *
 * Postac ma ~180 px wzrostu, dlatego hitboxy siegaja od pasa (-128) do
 * wysokosci klatki piersiowej (-140).
 */
export const ATTACKS: Record<AttackKind, AttackDef> = {
  light: {
    anim: 'lightAttack',
    startup: 4,
    active: 3,
    recovery: 8,
    damage: 5,
    hitbox: { x: 22, y: -128, w: 52, h: 34 },
    hitstun: 12,
    blockstun: 8,
    knockback: { x: 2.2, y: 0 },
    hitstop: 3,
  },
  heavy: {
    anim: 'heavyAttack',
    startup: 9,
    active: 4,
    recovery: 17,
    damage: 11,
    hitbox: { x: 24, y: -140, w: 66, h: 44 },
    hitstun: 20,
    blockstun: 13,
    knockback: { x: 5.2, y: -2.4 },
    hitstop: 6,
  },
  special: {
    anim: 'special',
    startup: 13,
    active: 2,
    recovery: 24,
    damage: 0,
    hitbox: { x: 0, y: 0, w: 0, h: 0 },
    hitstun: 0,
    blockstun: 0,
    knockback: { x: 0, y: 0 },
    hitstop: 0,
    projectile: true,
    meterCost: 25,
  },
  air: {
    anim: 'airAttack',
    startup: 3,
    active: 6,
    recovery: 6,
    damage: 8,
    /**
     * Kopniecie z powietrza musi siegac w dol, do stojacego przeciwnika.
     *
     * W locie stopy sa nawet 133 px nad ziemia (szczyt skoku), a przeciwnik
     * ma 180 px wzrostu - hitbox zaczepiony wysoko minalby go zawsze.
     * Dlatego pudelko jest wysokie i schodzi ponizej stop: przy szczycie skoku
     * lapie jeszcze glowe i tors, a przy ladowaniu cala sylwetke.
     */
    hitbox: { x: 20, y: -120, w: 62, h: 90 },
    hitstun: 16,
    blockstun: 10,
    knockback: { x: 3.4, y: -1.6 },
    hitstop: 5,
  },
};

/** Parametry pocisku (atak specjalny). */
export const PROJECTILE = {
  speed: 6.4,
  damage: 9,
  hitstun: 16,
  blockstun: 10,
  knockback: { x: 4.0, y: -1.4 },
  hitstop: 4,
  /** Klatki zycia pocisku. */
  life: 140,
  radius: 14,
};

export const DIFFICULTY = {
  easy: {
    label: 'Latwy',
    /** Klatki opoznienia reakcji bota. */
    reaction: 16,
    /** Szansa na poprawna decyzje obronna. */
    defense: 0.35,
    aggression: 0.35,
    comboChance: 0.2,
  },
  normal: {
    label: 'Normalny',
    reaction: 10,
    defense: 0.6,
    aggression: 0.55,
    comboChance: 0.45,
  },
  hard: {
    label: 'Trudny',
    reaction: 6,
    defense: 0.82,
    aggression: 0.75,
    comboChance: 0.7,
  },
} as const;

export type DifficultyKey = keyof typeof DIFFICULTY;
