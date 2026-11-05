import type { Renderer } from '../core/renderer';
import type { Fighter } from '../entities/fighter';
import { LOGICAL_W, MAX_HP, MAX_METER } from '../constants';
import { drawMeterBar } from './draw';
import { gameFont } from './font';
import { imageSize } from '../core/image';

const FONT = gameFont(12);
const SMALL_FONT = gameFont(9);

/** Ramka portretu przy pasku zycia. Proporcja 2:3 jak grafiki portretow. */
const PORTRAIT_W = 54;
const PORTRAIT_H = 81;
const PORTRAIT_Y = 14;
const EDGE = 16;
const GAP = 6;

const BAR_W = 200;
const BAR_H = 14;
const BAR_Y = 14;

const PLAYER_BAR_X = EDGE + PORTRAIT_W + GAP;
const BOT_BAR_X = LOGICAL_W - EDGE - PORTRAIT_W - GAP - BAR_W;

const drawText = (
  r: Renderer,
  text: string,
  x: number,
  y: number,
  color: string,
  font = FONT,
  align: CanvasTextAlign = 'left',
): void => {
  const ctx = r.ctx;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#000000';
  ctx.fillText(text, Math.round(x) + 1, Math.round(y) + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, Math.round(x), Math.round(y));
};

const drawHealthBar = (
  r: Renderer,
  x: number,
  y: number,
  w: number,
  h: number,
  hp: number,
  alignRight: boolean,
): void => {
  r.fillRect(x - 1, y - 1, w + 2, h + 2, '#0d0a14');
  r.fillRect(x, y, w, h, '#3a2b2b');

  const ratio = Math.max(0, Math.min(1, hp / MAX_HP));
  const full = Math.round(w * ratio);
  if (full > 0) {
    const fx = alignRight ? x + w - full : x;
    const color = ratio > 0.5 ? '#4fd66a' : ratio > 0.22 ? '#e8c33c' : '#e05252';
    r.fillRect(fx, y, full, h, color);
    r.fillRect(fx, y, full, 2, 'rgba(255,255,255,0.35)');
  }
  r.strokeRect(x - 1, y - 1, w + 2, h + 2, '#6b5a86');
};

/**
 * Portret odpowiadajacy aktualnemu stanowi postaci.
 *
 * Numery grafik rosna razem z otrzymanymi obrazeniami, wiec pasek zycia
 * dzielimy na tyle progow, ile jest portretow - twarz zmienia sie dopiero po
 * przekroczeniu kolejnej cwiartki zdrowia.
 */
const pickPortrait = (f: Fighter): CanvasImageSource => {
  const variants = f.loaded.damagePortraits;
  if (!variants || variants.length === 0) return f.loaded.portrait;
  const ratio = Math.max(0, Math.min(1, f.hp / MAX_HP));
  const index = Math.min(variants.length - 1, Math.floor((1 - ratio) * variants.length));
  return variants[index] ?? f.loaded.portrait;
};

/**
 * Rysuje portret w ramce przy pasku zycia.
 *
 * Pokazujemy cala grafie, dlatego rysujemy ja dokladnie w prostokacie ramki -
 * portrety maja te sama proporcje, wiec nic sie nie znieksztalca. `flip`
 * obraca twarz bota w strone jego paska.
 */
const drawPortrait = (r: Renderer, f: Fighter, x: number, flip: boolean): void => {
  r.fillRect(x - 1, PORTRAIT_Y - 1, PORTRAIT_W + 2, PORTRAIT_H + 2, '#0d0a14');

  const img = pickPortrait(f);
  const { w: srcW, h: srcH } = imageSize(img);
  if (srcW > 0 && srcH > 0) {
    // portrety to ilustracje, a nie pixel art - bez wygladzania
    // zmniejszenie 1024 px do 54 px zamienialoby je w szum
    r.drawImage(img, 0, 0, srcW, srcH, x, PORTRAIT_Y, PORTRAIT_W, PORTRAIT_H, flip, true);
  }

  r.strokeRect(x - 1, PORTRAIT_Y - 1, PORTRAIT_W + 2, PORTRAIT_H + 2, '#6b5a86');
};

export interface HudData {
  player: Fighter;
  bot: Fighter;
  timer: number;
  wins: { player: number; bot: number };
  roundsToWin: number;
  message: string | null;
  subMessage: string | null;
}

/** Rysuje HUD: portrety, paski HP, energie, zegar, numer rundy i komunikaty. */
export const drawHud = (r: Renderer, data: HudData): void => {
  const { player, bot } = data;
  const botPortraitX = LOGICAL_W - EDGE - PORTRAIT_W;

  drawPortrait(r, player, EDGE, false);
  drawPortrait(r, bot, botPortraitX, true);

  drawHealthBar(r, PLAYER_BAR_X, BAR_Y, BAR_W, BAR_H, player.hp, false);
  drawHealthBar(r, BOT_BAR_X, BAR_Y, BAR_W, BAR_H, bot.hp, true);

  const meterY = BAR_Y + BAR_H + 5;
  drawMeterBar(r, PLAYER_BAR_X, meterY, BAR_W, 6, player.meter, MAX_METER, '#3fa9f5', false);
  drawMeterBar(r, BOT_BAR_X, meterY, BAR_W, 6, bot.meter, MAX_METER, '#f58a3f', true);

  const nameY = BAR_Y + BAR_H + 15;
  drawText(r, player.def.name.toUpperCase(), PLAYER_BAR_X, nameY, '#cbb8e8', SMALL_FONT);
  drawText(
    r,
    bot.def.name.toUpperCase(),
    BOT_BAR_X + BAR_W,
    nameY,
    '#cbb8e8',
    SMALL_FONT,
    'right',
  );

  // zegar
  const cx = LOGICAL_W / 2;
  r.fillRect(cx - 30, BAR_Y - 3, 60, 36, '#0d0a14');
  r.strokeRect(cx - 30, BAR_Y - 3, 60, 36, '#6b5a86');
  const seconds = Math.max(0, Math.ceil(data.timer));
  drawText(
    r,
    String(seconds).padStart(2, '0'),
    cx,
    BAR_Y + 2,
    seconds <= 10 ? '#ff6b6b' : '#ffe9a8',
    gameFont(22),
    'center',
  );
  drawText(
    r,
    `RUNDA ${data.wins.player + data.wins.bot + 1}`,
    cx,
    BAR_Y + 26,
    '#8f7fb0',
    SMALL_FONT,
    'center',
  );

  // pipsy wygranych rund - pod zegarem, zeby nie wchodzily na paski HP
  const pipY = BAR_Y + 38;
  for (let i = 0; i < data.roundsToWin; i++) {
    const px = cx - 11 - i * 11;
    r.fillRect(px, pipY, 7, 7, data.wins.player > i ? '#4fd66a' : '#2a2338');
    const qx = cx + 4 + i * 11;
    r.fillRect(qx, pipY, 7, 7, data.wins.bot > i ? '#e05252' : '#2a2338');
  }

  if (data.message) {
    const ctx = r.ctx;
    ctx.font = gameFont(30);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillText(data.message, cx + 3, 150);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(data.message, cx, 147);
  }
  if (data.subMessage) {
    drawText(r, data.subMessage, cx, 176, '#cbb8e8', gameFont(13), 'center');
  }
};
