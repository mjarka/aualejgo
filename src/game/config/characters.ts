import type { AnimName, AnimDef, CharacterDef, CharacterId } from '../types';
import { CHARACTER_HEIGHT, MAX_ANIM_FRAMES } from '../constants';

/**
 * Domyslny uklad siatki spritesheeta.
 *
 * Kazdy WIERSZ to jedna animacja, klatki ida od lewej do prawej.
 * Kolumna 0 = pierwsza klatka. Puste miejsca po prawej sa ignorowane.
 *
 * Kolejnosc wierszy (row):
 *   0 idle          1 walkForward   2 walkBack      3 crouch
 *   4 jump          5 lightAttack   6 heavyAttack   7 special
 *   8 block         9 hit          10 knockdown    11 victory
 *  12 defeat       13 airAttack
 */
export const ANIM_LAYOUT: Record<AnimName, AnimDef> = {
  idle: { row: 0, frames: 4, fps: 8, loop: true },
  walkForward: { row: 1, frames: 4, fps: 9, loop: true },
  walkBack: { row: 2, frames: 4, fps: 9, loop: true },
  crouch: { row: 3, frames: 2, fps: 6, loop: true },
  jump: { row: 4, frames: 1, fps: 10, loop: false },
  lightAttack: { row: 5, frames: 1, fps: 14, loop: false },
  heavyAttack: { row: 6, frames: 1, fps: 12, loop: false },
  special: { row: 7, frames: 6, fps: 12, loop: false },
  block: { row: 8, frames: 1, fps: 6, loop: true },
  hit: { row: 9, frames: 1, fps: 12, loop: false },
  knockdown: { row: 10, frames: 5, fps: 8, loop: false },
  victory: { row: 11, frames: 6, fps: 8, loop: true },
  defeat: { row: 12, frames: 4, fps: 6, loop: true },
  airAttack: { row: 13, frames: 1, fps: 12, loop: false },
};

export const SHEET_COLUMNS = 8;
export const SHEET_ROWS = 14;

/**
 * Rozmiar klatki.
 *
 * Postac ma zajmowac polowe wysokosci ekranu gry (CHARACTER_HEIGHT = 180 px),
 * dlatego klatka ma 192 px wysokosci, a stopy leza 4 px nad dolna krawedzia.
 *
 * Szerokosc musi pomiescic NAJSZERSZA poze - wyciagniety cios siega ok. 104 px
 * od nog (patrz `pasteAnimationSheet`, ktory kotwiczy klatke na nogach).
 * 224 px daje na to zapas i sprawia, ze klatka jest symetryczna wzgledem
 * `originX`, dzieki czemu odbicie lustrzane nie przesuwa postaci.
 */
export const FRAME_W = 224;
export const FRAME_H = 192;
/** Margines miedzy stopami a dolna krawedzia klatki. */
export const FOOT_MARGIN = 4;

/** Sprawdza, czy konfiguracja animacji jest sensowna. */
export const validateAnimLayout = (
  layout: Record<AnimName, AnimDef>,
  columns = SHEET_COLUMNS,
  rows = SHEET_ROWS,
): string[] => {
  const problems: string[] = [];
  for (const [name, def] of Object.entries(layout)) {
    const startCol = def.startCol ?? 0;
    if (def.frames < 1) problems.push(`${name}: frames musi byc >= 1`);
    if (def.frames > MAX_ANIM_FRAMES) problems.push(`${name}: frames > ${MAX_ANIM_FRAMES}`);
    if (startCol + def.frames > columns) {
      problems.push(
        `${name}: klatki ${startCol}..${startCol + def.frames - 1} wychodza poza ${columns} kolumn`,
      );
    }
    if (def.row < 0 || def.row >= rows) problems.push(`${name}: row poza zakresem arkusza`);
    if (def.fps <= 0) problems.push(`${name}: fps musi byc > 0`);
  }
  return problems;
};

const baseCharacter = {
  frameW: FRAME_W,
  frameH: FRAME_H,
  columns: SHEET_COLUMNS,
  originX: FRAME_W / 2,
  originY: FRAME_H - FOOT_MARGIN,
  bodyW: 46,
  bodyH: CHARACTER_HEIGHT,
  animations: ANIM_LAYOUT,
} as const;

/**
 * Postacie wybieralne na ekranie wyboru.
 *
 * Podmien `sheet` na wlasny spritesheet (patrz README - uklad siatki).
 * `portrait` to portret wyswietlany na ekranie wyboru.
 */
export const CHARACTER_LIST: readonly CharacterDef[] = [
  {
    ...baseCharacter,
    id: 'c1',
    name: 'Sheeva',
    sheet: '/assets/sprites/c1.png',
    portrait: '/assets/portraits/c1.png',
    damagePortraits: [
      '/assets/portraits/c1_0.png',
      '/assets/portraits/c1_1.png',
      '/assets/portraits/c1_2.png',
      '/assets/portraits/c1_3.png',
    ],
    // cykl chodu dostarczony osobno, klatki ulozone w siatce 2x2
    // grafika jest narysowana w lewo, wiec przy patrzeniu w prawo jest odbijana
    sheetFacing: 'left',
    animationSheets: {
      idle: { sheet: '/assets/sprites/c1/idle.png', columns: 2, rows: 2 },
      walkForward: { sheet: '/assets/sprites/c1/walk.png', columns: 2, rows: 2 },
      walkBack: { sheet: '/assets/sprites/c1/walk.png', columns: 2, rows: 2 },
      jump: { sheet: '/assets/sprites/c1/jump.png', columns: 1, rows: 1 },
      block: { sheet: '/assets/sprites/c1/block.png', columns: 1, rows: 1 },
      lightAttack: { sheet: '/assets/sprites/c1/punch1.png', columns: 1, rows: 1 },
      heavyAttack: { sheet: '/assets/sprites/c1/punch2.png', columns: 1, rows: 1 },
      hit: { sheet: '/assets/sprites/c1/hit.png', columns: 1, rows: 1 },
      airAttack: { sheet: '/assets/sprites/c1/airkickc1.png', columns: 1, rows: 1 },
    },
    palette: {
      skin: '#d9a06a',
      primary: '#c0392b',
      secondary: '#6d1f16',
      outline: '#1a0d0d',
    },
  },
  {
    ...baseCharacter,
    id: 'c2',
    name: 'Jade',
    sheet: '/assets/sprites/c2.png',
    portrait: '/assets/portraits/c2.png',
    damagePortraits: [
      '/assets/portraits/c2_0.png',
      '/assets/portraits/c2_1.png',
      '/assets/portraits/c2_2.png',
      '/assets/portraits/c2_3.png',
    ],
    // cykl chodu dostarczony osobno, klatki ulozone w siatce 2x2
    // grafika jest narysowana w lewo, wiec przy patrzeniu w prawo jest odbijana
    sheetFacing: 'left',
    animationSheets: {
      idle: { sheet: '/assets/sprites/c2/idle.png', columns: 2, rows: 2 },
      walkForward: { sheet: '/assets/sprites/c2/walk.png', columns: 2, rows: 2 },
      walkBack: { sheet: '/assets/sprites/c2/walk.png', columns: 2, rows: 2 },
      jump: { sheet: '/assets/sprites/c2/jump.png', columns: 1, rows: 1 },
      block: { sheet: '/assets/sprites/c2/block.png', columns: 1, rows: 1 },
      lightAttack: { sheet: '/assets/sprites/c2/punch1.png', columns: 1, rows: 1 },
      heavyAttack: { sheet: '/assets/sprites/c2/punch2.png', columns: 1, rows: 1 },
      hit: { sheet: '/assets/sprites/c2/hit.png', columns: 1, rows: 1 },
      airAttack: { sheet: '/assets/sprites/c2/airkickc2.png', columns: 1, rows: 1 },
    },
    palette: {
      skin: '#e8b98f',
      primary: '#2e9e5b',
      secondary: '#175c33',
      outline: '#0d1a12',
    },
  },
];

export const getCharacter = (id: CharacterId): CharacterDef => {
  const found = CHARACTER_LIST.find((c) => c.id === id);
  if (!found) throw new Error(`Nieznana postac: ${id}`);
  return found;
};
