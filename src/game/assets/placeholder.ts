import type { AnimName, CharacterDef, StageDef } from '../types';
import { ANIM_NAMES } from '../types';
import { LOGICAL_H, LOGICAL_W } from '../constants';
import { ROAD_WIDTH } from '../config/stages';

/** Wysokosc rysowania nieruchomego tla zastepczego. */
const BG_H = LOGICAL_H;
/** Szerokosc rysowania tla zastepczego - proporcja 3:2. */
const BG_W = Math.max(LOGICAL_W, Math.round((BG_H * 3) / 2));

/**
 * Proceduralne grafiki zastepcze.
 *
 * Dzieki nim gra dziala od razu, jeszcze przed dostarczeniem wlasnych
 * spritesheetow i tel. Kazda grafika jest generowana do <canvas>, ktory
 * renderer traktuje dokladnie tak samo jak <img>.
 *
 * Postac rysowana jest w jednostkach (unit) i skalowana do rozmiaru klatki,
 * dlatego ten sam kod obsluguje dowolny rozmiar spritesheeta.
 */

const px = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

interface Pose {
  bodyDx: number;
  bodyDy: number;
  headDy: number;
  armFrontDx: number;
  armFrontDy: number;
  armBackDx: number;
  armBackDy: number;
  legFrontDx: number;
  legBackDx: number;
  crouch: number;
  lying: boolean;
}

const neutralPose = (): Pose => ({
  bodyDx: 0,
  bodyDy: 0,
  headDy: 0,
  armFrontDx: 0,
  armFrontDy: 0,
  armBackDx: 0,
  armBackDy: 0,
  legFrontDx: 0,
  legBackDx: 0,
  crouch: 0,
  lying: false,
});

/** Zwraca pozy dla animacji i numeru klatki (jednostki: 1 = 1/48 wysokosci postaci). */
const poseFor = (anim: AnimName, frame: number, frames: number): Pose => {
  const p = neutralPose();
  const t = frames > 1 ? frame / (frames - 1) : 0;
  const wave = Math.sin(t * Math.PI * 2);

  switch (anim) {
    case 'idle':
      p.bodyDy = Math.round(wave * 1);
      p.headDy = Math.round(wave * 1);
      p.armFrontDy = Math.round(wave);
      break;
    case 'walkForward':
    case 'walkBack': {
      const dir = anim === 'walkForward' ? 1 : -1;
      const s = Math.sin(t * Math.PI * 2);
      p.bodyDy = -Math.abs(Math.round(s * 1.5));
      p.legFrontDx = Math.round(s * 5);
      p.legBackDx = Math.round(-s * 5);
      p.armFrontDx = Math.round(-s * 4 * dir);
      p.armBackDx = Math.round(s * 4 * dir);
      p.bodyDx = dir;
      break;
    }
    case 'crouch':
      p.crouch = frame === 0 ? 0.6 : 1;
      break;
    case 'jump':
      p.crouch = frame === 0 ? 0.5 : 0;
      p.legFrontDx = frame >= 2 ? 3 : 0;
      p.legBackDx = frame >= 2 ? -3 : 0;
      p.armFrontDy = frame >= 1 ? -4 : 0;
      p.armBackDy = frame >= 1 ? -4 : 0;
      break;
    case 'lightAttack': {
      const extend = frame <= 1 ? 0 : frame === 2 ? 12 : 6;
      p.armFrontDx = extend;
      p.armFrontDy = -2;
      p.bodyDx = frame >= 2 ? 2 : 0;
      p.legFrontDx = 2;
      break;
    }
    case 'heavyAttack': {
      const wind = frame <= 2 ? -6 : 0;
      const extend = frame >= 3 ? 15 : 0;
      p.armFrontDx = wind + extend;
      p.armFrontDy = frame <= 2 ? -6 : 2;
      p.bodyDx = frame >= 3 ? 4 : -2;
      p.armBackDx = frame <= 2 ? -5 : 3;
      p.legFrontDx = 3;
      break;
    }
    case 'special': {
      const charge = frame <= 3 ? frame * 1.5 : 0;
      p.armFrontDx = frame >= 4 ? 14 : 4 - charge;
      p.armBackDx = frame >= 4 ? 10 : 4 - charge;
      p.armFrontDy = frame >= 4 ? -3 : 0;
      p.armBackDy = frame >= 4 ? -3 : 0;
      p.bodyDx = frame >= 4 ? 3 : -1;
      break;
    }
    case 'block':
      p.armFrontDx = 6;
      p.armFrontDy = -8;
      p.armBackDx = 4;
      p.armBackDy = -6;
      p.bodyDx = -1;
      p.crouch = frame === 0 ? 0.2 : 0.35;
      break;
    case 'hit':
      p.bodyDx = -3 - frame;
      p.headDy = -1;
      p.armFrontDx = -4;
      p.armBackDx = -6;
      p.armFrontDy = -3;
      p.armBackDy = -5;
      break;
    case 'knockdown':
      p.lying = true;
      p.bodyDy = Math.round(t * 2);
      break;
    case 'victory':
      p.armFrontDy = -14 - Math.round(wave * 2);
      p.armBackDy = -14 + Math.round(wave * 2);
      p.bodyDy = Math.round(wave * 1);
      break;
    case 'defeat':
      p.crouch = 1;
      p.headDy = 2;
      p.armFrontDy = 3;
      p.armBackDy = 3;
      p.bodyDx = -1;
      break;
    default:
      break;
  }
  return p;
};

/**
 * Rysuje postac w ukladzie jednostek (postac ma ~48 jednostek wzrostu).
 *
 * `unit` to skala w pikselach, `feetY` to linia stop w pikselach.
 */
const drawFighter = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  feetY: number,
  unit: number,
  pose: Pose,
  char: CharacterDef,
): void => {
  const { skin, primary, secondary, outline } = char.palette;
  const u = (v: number): number => v * unit;

  const crouchOffset = pose.crouch * u(12);
  const baseY = feetY + u(pose.bodyDy) + crouchOffset;
  const dx = u(pose.bodyDx);

  if (pose.lying) {
    ctx.save();
    ctx.translate(cx, feetY - u(6));
    ctx.rotate(-Math.PI / 2);
    ctx.translate(-cx, -(feetY - u(6)));
  }

  const legH = u(14 - pose.crouch * 5);
  const legTop = baseY - legH;

  // nogi
  px(ctx, cx - u(7) + u(pose.legBackDx) + dx, legTop, u(5), legH, secondary);
  px(ctx, cx + u(1) + u(pose.legFrontDx) + dx, legTop, u(5), legH, secondary);
  px(ctx, cx - u(8) + u(pose.legBackDx) + dx, baseY - u(3), u(7), u(3), outline);
  px(ctx, cx + u(1) + u(pose.legFrontDx) + dx, baseY - u(3), u(7), u(3), outline);

  // tors
  const torsoH = u(18);
  const torsoY = legTop - torsoH;
  px(ctx, cx - u(7) + dx, torsoY, u(14), torsoH, primary);
  px(ctx, cx - u(7) + dx, torsoY, u(14), u(3), secondary);
  px(ctx, cx - u(7) + dx, torsoY + torsoH - u(3), u(14), u(3), secondary);

  // rece
  const armY = torsoY + u(3);
  px(ctx, cx - u(11) + u(pose.armBackDx) + dx, armY + u(pose.armBackDy), u(4), u(13), secondary);
  px(ctx, cx + u(7) + u(pose.armFrontDx) + dx, armY + u(pose.armFrontDy), u(4), u(13), skin);

  // glowa
  const headY = torsoY - u(11) + u(pose.headDy);
  px(ctx, cx - u(6) + dx, headY, u(12), u(11), skin);
  px(ctx, cx - u(6) + dx, headY, u(12), u(3), secondary);
  px(ctx, cx - u(4) + dx, headY + u(5), u(2), u(2), outline);
  px(ctx, cx + u(1) + dx, headY + u(5), u(2), u(2), outline);

  if (pose.lying) ctx.restore();
};

/**
 * Buduje kompletny spritesheet zastepczy w ukladzie siatki opisanej w CharacterDef.
 */
export const generateCharacterSheet = (char: CharacterDef): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = char.columns * char.frameW;
  canvas.height = ANIM_NAMES.length * char.frameH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = false;

  // postac ma ~48 jednostek wzrostu, wiec jednostka = wysokosc / 48
  const unit = char.frameH / 48;

  for (const anim of ANIM_NAMES) {
    const def = char.animations[anim];
    const startCol = def.startCol ?? 0;
    for (let frame = 0; frame < def.frames; frame++) {
      const ox = (startCol + frame) * char.frameW;
      const oy = def.row * char.frameH;
      ctx.save();
      ctx.translate(ox, oy);
      drawFighter(ctx, char.originX, char.originY, unit, poseFor(anim, frame, def.frames), char);
      ctx.restore();
    }
  }
  return canvas;
};

// ------------------------------------------------------------------ tlo

const makeCanvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Brak kontekstu 2D dla grafiki zastepczej');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
};

/** Nieruchome tlo zastepcze - nocne niebo z panorama miasta. */
export const generateStageBackground = (_stage: StageDef): HTMLCanvasElement => {
  const w = BG_W;
  const h = BG_H;
  const [canvas, ctx] = makeCanvas(w, h);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0b0b1f');
  grad.addColorStop(0.45, '#241a3d');
  grad.addColorStop(0.75, '#5b2a4a');
  grad.addColorStop(1, '#8a3f52');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 120; i++) {
    const x = (i * 137) % w;
    const y = (i * 53) % (h * 0.5);
    const bright = i % 5 === 0;
    px(ctx, x, y, bright ? 3 : 2, bright ? 3 : 2, bright ? '#fff6d5' : '#c9c4e0');
  }

  ctx.fillStyle = '#f6e7b4';
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.2, h * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b0b1f';
  ctx.beginPath();
  ctx.arc(w * 0.78 - h * 0.04, h * 0.2 - h * 0.025, h * 0.08, 0, Math.PI * 2);
  ctx.fill();

  // panorama
  const baseY = h * 0.86;
  let x = 0;
  let i = 0;
  const widths = [70, 54, 88, 62, 76, 50, 82, 66, 72, 58, 86, 62];
  const heights = [0.36, 0.24, 0.46, 0.3, 0.4, 0.22, 0.5, 0.32, 0.34, 0.26, 0.42, 0.28];
  while (x < w) {
    const bw = widths[i % widths.length];
    const bh = h * heights[i % heights.length];
    px(ctx, x, baseY - bh, bw, bh, '#1d1830');
    for (let wy = baseY - bh + 12; wy < baseY - 12; wy += 18) {
      for (let wx = x + 10; wx < x + bw - 10; wx += 16) {
        const lit = (wx * 7 + wy * 13) % 5 === 0;
        px(ctx, wx, wy, 6, 8, lit ? '#ffcf6b' : '#2b2440');
      }
    }
    x += bw + 12;
    i++;
  }
  return canvas;
};

/** Ulica zastepcza - dlugi pas asfaltu rozciagniety na cala szerokosc swiata. */
export const generateStageRoad = (_stage: StageDef): HTMLCanvasElement => {
  const w = ROAD_WIDTH;
  const h = 150;
  const [canvas, ctx] = makeCanvas(w, h);

  px(ctx, 0, 0, w, h, '#2b2233');
  px(ctx, 0, 0, w, 6, '#3d3149');

  // krawedz chodnika
  px(ctx, 0, 6, w, 4, '#4a4258');

  // pasy na jezdni
  for (let x = 0; x < w; x += 90) {
    px(ctx, x, Math.round(h * 0.45), 46, 5, '#c9c2a8');
  }

  // faktura asfaltu
  for (let x = 0; x < w; x += 34) {
    px(ctx, x, Math.round(h * 0.72), 18, 3, '#332a3d');
    px(ctx, x + 16, Math.round(h * 0.88), 12, 3, '#332a3d');
  }
  return canvas;
};

/** Tlo zastepcze dla ekranu wyboru postaci. */
export const generateSelectBackground = (): HTMLCanvasElement => {
  const [canvas, ctx] = makeCanvas(LOGICAL_W, LOGICAL_H);
  const grad = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
  grad.addColorStop(0, '#120d1e');
  grad.addColorStop(1, '#2a1b33');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  return canvas;
};
