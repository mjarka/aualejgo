import type { Fighter } from '../entities/fighter';
import type { Projectile } from '../entities/projectile';
import type { LoadedStage } from '../assets/loader';
import type { Renderer } from '../core/renderer';
import { GROUND_Y, LOGICAL_H, LOGICAL_W, WORLD_WIDTH } from '../constants';
import { PROJECTILE } from '../config/balance';

/**
 * Rysuje arene.
 *
 * Tlo (`background`) jest nieruchome - nie reaguje na kamere. Ulica (`road`)
 * jest rozciagnieta na cala szerokosc swiata i przesuwana z kamera, dzieki
 * czemu postacie ida w glab ulicy.
 *
 * Obie grafiki zachowuja swoje proporcje: tlo jest skalowane tak, aby pokryc
 * caly ekran (nadmiar przycinany od gory), a ulica jest skalowana wzgledem
 * szerokosci swiata.
 */
export const drawStage = (r: Renderer, stage: LoadedStage, cameraX: number): void => {
  r.clear('#0b0b1f');

  // 1. nieruchome tlo - skala "cover", wyrownane do dolnej krawedzi
  const bgScale = Math.max(
    LOGICAL_W / stage.backgroundWidth,
    LOGICAL_H / stage.backgroundHeight,
  );
  const bgW = stage.backgroundWidth * bgScale;
  const bgH = stage.backgroundHeight * bgScale;
  // tlo to ilustracja - wygladzanie, zeby zmniejszenie nie zamienilo jej w szum
  r.drawImage(
    stage.background,
    0,
    0,
    stage.backgroundWidth,
    stage.backgroundHeight,
    (LOGICAL_W - bgW) / 2,
    LOGICAL_H - bgH,
    bgW,
    bgH,
    false,
    true,
  );

  // 2. ulica - rozciagnieta na swiat, przewijana z kamera
  const roadH = roadScreenHeight(stage);
  const roadY = LOGICAL_H - roadH;
  r.drawWorldSlice(stage.road, 0, WORLD_WIDTH, roadY, roadH, cameraX, true);

  // 3. ciemniejszy pas na pierwszym planie - kotwica dla stop postaci
  r.fillRect(0, GROUND_Y, LOGICAL_W, LOGICAL_H - GROUND_Y, 'rgba(10,8,16,0.35)');
  r.fillRect(0, GROUND_Y, LOGICAL_W, 2, stage.def.groundAccent);
};

/**
 * Wysokosc ulicy na ekranie, wyliczona z proporcji grafiki.
 *
 * Dzieki temu podmiana road.jpg na inny plik nie znieksztalci ulicy.
 */
export const roadScreenHeight = (stage: LoadedStage): number => {
  if (!stage.roadWidth || !stage.roadHeight) return LOGICAL_H / 2;
  const h = (WORLD_WIDTH * stage.roadHeight) / stage.roadWidth;
  return Math.max(60, Math.min(LOGICAL_H * 0.6, h));
};

/**
 * Czy klatke trzeba odbic lustrzanie.
 *
 * `facing` opisuje kierunek w SWIECIE (1 = w prawo), a arkusz moze byc
 * narysowany w dowolna strone - `sheetFacing`. Gdy te dwa sie nie zgadzaja,
 * postac trzeba odbic.
 */
const needsFlip = (f: Fighter): boolean => {
  const art = f.def.sheetFacing ?? 'right';
  return f.facing === 1 ? art === 'left' : art === 'right';
};

/** Rysuje pojedyncza postac, obracajac ja w strone przeciwnika. */
export const drawFighter = (r: Renderer, f: Fighter, cameraX: number): void => {
  const { def, loaded } = f;
  const animDef = def.animations[f.anim];
  if (!animDef) return;

  const sx = (f.animFrame + (animDef.startCol ?? 0)) * def.frameW;
  const sy = animDef.row * def.frameH;
  const dx = f.x - def.originX - cameraX;
  const dy = f.y - def.originY;

  // poza ekranem - nie marnujemy czasu na rysowanie
  if (dx + def.frameW < 0 || dx > LOGICAL_W) return;

  const flip = needsFlip(f);

  r.drawImage(loaded.sheet, sx, sy, def.frameW, def.frameH, dx, dy, def.frameW, def.frameH, flip);

  if (f.flash > 0) {
    // blysnienie po trafieniu
    const ctx = r.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(0.7, f.flash / 12);
    r.drawImage(
      loaded.sheet,
      sx,
      sy,
      def.frameW,
      def.frameH,
      dx,
      dy,
      def.frameW,
      def.frameH,
      flip,
    );
    ctx.restore();
  }
};

/** Rysuje pociski. */
export const drawProjectiles = (
  r: Renderer,
  projectiles: readonly Projectile[],
  cameraX: number,
): void => {
  for (const p of projectiles) {
    if (p.dead) continue;
    const x = p.x - cameraX;
    if (x < -40 || x > LOGICAL_W + 40) continue;

    const pulse = 1 + Math.sin(p.animTimer * 0.4) * 0.15;
    const radius = PROJECTILE.radius * pulse;
    const ctx = r.ctx;
    const grad = ctx.createRadialGradient(x, p.y, 1, x, p.y, radius);
    const color = p.owner === 'player' ? '90,180,255' : '255,120,90';
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.45, `rgba(${color},0.9)`);
    grad.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** Pasek energii pod paskiem HP. */
export const drawMeterBar = (
  r: Renderer,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
  max: number,
  color: string,
  alignRight: boolean,
): void => {
  r.fillRect(x, y, w, h, '#1a1424');
  const filled = Math.round((w - 2) * Math.max(0, Math.min(1, value / max)));
  if (filled > 0) {
    const fx = alignRight ? x + 1 + (w - 2 - filled) : x + 1;
    r.fillRect(fx, y + 1, filled, h - 2, color);
  }
  r.strokeRect(x, y, w, h, '#4a3d61');
};
