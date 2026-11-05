import { LOGICAL_H, LOGICAL_W } from '../constants';
import { imageSize } from './image';

/**
 * Renderer z zachowaniem ostrych pikseli.
 *
 * Gra rysowana jest w rozdzielczosci logicznej (LOGICAL_W x LOGICAL_H), a
 * nastepnie skalowana w gore tak, aby wypelnic kontener.
 *
 * Skala jest ulamkowa (np. 2.7), a nie zaokraglana w dol. Przy zaokragleniu
 * w dol na ekranie 1080p gra zajmowalaby 640x360 x3 = 1920x1080 tylko przy
 * dokladnie takim oknie; w kazdym innym rozmiarze zostawalaby czarna ramka,
 * a na ekranach o nizszej rozdzielczosci gra bylaby po prostu mniejsza.
 * Ulamkowa skala wypelnia kontener, a `image-rendering: pixelated` w CSS
 * utrzymuje ostre krawedzie pikseli.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Aktualny mnoznik skali (moze byc ulamkowy, np. 2.7). */
  scale = 1;
  /** Przesuniecie canvasu w CSS px, aby wysrodkowac obraz. */
  offsetX = 0;
  offsetY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = LOGICAL_W;
    canvas.height = LOGICAL_H;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Przegladarka nie udostepnia kontekstu Canvas 2D');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** Dopasowuje rozmiar canvasu do kontenera, zachowujac proporcje i ostre piksele. */
  resize(containerW: number, containerH: number): void {
    if (containerW <= 0 || containerH <= 0) return;
    const raw = Math.min(containerW / LOGICAL_W, containerH / LOGICAL_H);
    const scale = Math.max(1, raw);
    this.scale = scale;

    const cssW = LOGICAL_W * scale;
    const cssH = LOGICAL_H * scale;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.offsetX = Math.floor((containerW - cssW) / 2);
    this.offsetY = Math.floor((containerH - cssH) / 2);
  }

  clear(color = '#000'): void {
    const { ctx } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  }

  /**
   * Rysuje obraz z opcjonalnym odbiciem lustrzanym wokol osi pionowej.
   *
   * `smooth` wlacza wygladzanie dla tej jednej grafiki. Pixel art ma byc ostry
   * (domyslnie), ale ilustracje - jak portrety do paska zycia - sa rysowane
   * w duzo mniejszej rozdzielczosci niz zrodlo i przy nearest-neighbour
   * zamienialyby sie w szum.
   */
  drawImage(
    img: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    flip = false,
    smooth = false,
  ): void {
    const { ctx } = this;
    ctx.imageSmoothingEnabled = smooth;
    if (!flip) {
      ctx.drawImage(img, sx, sy, sw, sh, Math.round(dx), Math.round(dy), dw, dh);
      ctx.imageSmoothingEnabled = false;
      return;
    }
    ctx.save();
    ctx.translate(Math.round(dx) + dw, Math.round(dy));
    ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }

  /**
   * Rysuje widoczny fragment szerokiej grafiki (np. ulicy) przesuniety o kamere.
   *
   * `worldX`/`worldW` opisuja grafike w ukladzie swiata, `cameraX` to lewa
   * krawedz widoku. Rysujemy wylacznie widoczny wycinek, wiec nawet bardzo
   * szerokie grafiki nie obciazaja GPU.
   *
   * `smooth` wlacza wygladzanie - ulica jest ilustracja rozciagnieta na caly
   * swiat, wiec przy nearest-neighbour zamienialaby sie w szum.
   */
  drawWorldSlice(
    img: CanvasImageSource,
    worldX: number,
    worldW: number,
    worldY: number,
    worldH: number,
    cameraX: number,
    smooth = false,
  ): void {
    if (worldW <= 0) return;
    const screenX = worldX - cameraX;
    if (screenX >= LOGICAL_W || screenX + worldW <= 0) return;

    const { w: srcW, h: srcH } = imageSize(img);
    if (srcW <= 0 || srcH <= 0) return;

    // widoczny fragment w ukladzie swiata
    const visibleLeft = Math.max(worldX, cameraX);
    const visibleRight = Math.min(worldX + worldW, cameraX + LOGICAL_W);
    const visibleW = visibleRight - visibleLeft;
    if (visibleW <= 0) return;

    const sx = ((visibleLeft - worldX) / worldW) * srcW;
    const sw = (visibleW / worldW) * srcW;
    const dx = visibleLeft - cameraX;

    this.ctx.imageSmoothingEnabled = smooth;
    this.ctx.drawImage(
      img,
      Math.round(sx),
      0,
      Math.max(1, Math.round(sw)),
      srcH,
      Math.round(dx),
      Math.round(worldY),
      Math.round(visibleW),
      Math.round(worldH),
    );
    this.ctx.imageSmoothingEnabled = false;
  }

  fillRect(x: number, y: number, w: number, h: number, color: string): void {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  strokeRect(x: number, y: number, w: number, h: number, color: string, lineWidth = 1): void {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
  }
}
