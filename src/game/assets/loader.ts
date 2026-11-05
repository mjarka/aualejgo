import type { AnimName, AnimSheetDef, CharacterDef, StageDef } from '../types';
import { ANIM_NAMES } from '../types';
import {
  generateCharacterSheet,
  generateStageBackground,
  generateStageRoad,
} from './placeholder';
import { validateAnimLayout } from '../config/characters';
import { imageSize } from '../core/image';

export type ImageSource = HTMLImageElement | HTMLCanvasElement;

export interface LoadedCharacter {
  def: CharacterDef;
  sheet: ImageSource;
  portrait: ImageSource;
  /**
   * Portrety do paska zycia, od nietknietego do najmocniej obitego.
   *
   * Tablica jest wyrownana z `def.damagePortraits` - nieudane grafiki zastepuje
   * zwykly portret, wiec indeks zawsze odpowiada poziomowi obrazen.
   */
  damagePortraits: ImageSource[];
  /** true, gdy uzyto proceduralnej grafiki zastepczej. */
  isPlaceholder: boolean;
}
export interface LoadedStage {
  def: StageDef;
  background: ImageSource;
  road: ImageSource;
  backgroundWidth: number;
  backgroundHeight: number;
  roadWidth: number;
  roadHeight: number;
  isPlaceholder: boolean;
}

export interface LoadedAssets {
  characters: Record<string, LoadedCharacter>;
  stage: LoadedStage;
  audio: Map<string, AudioBuffer>;
  /** Sciezki grafik, ktorych nie udalo sie wczytac (podmienione placeholderem). */
  missingImages: string[];
  /** Sciezki dzwiekow, ktorych nie udalo sie wczytac. */
  missingAudio: string[];
  /** Problemy z konfiguracja siatki spritesheeta (np. klatki poza arkuszem). */
  configProblems: string[];
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Nie udalo sie wczytac obrazu: ${src}`));
    img.src = src;
  });

/** Kopiuje grafike do canvasu o zadanym rozmiarze, zeby mozna bylo ja doklejac. */
const toCanvas = (src: ImageSource, w: number, h: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, w, h);
  return canvas;
};

const loadAudioBuffer = async (ctx: AudioContext, src: string): Promise<AudioBuffer> => {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${src}`);
  const data = await res.arrayBuffer();
  return await ctx.decodeAudioData(data);
};

/**
 * Buduje "statyczny" arkusz z portretu.
 *
 * Gdy brakuje spritesheeta, ale portret jest dostepny, uzywamy portretu jako
 * grafiki postaci - kazda animacja pokazuje te sama pozy. Dzieki temu od razu
 * widac wlasciwe postacie w walce, a animacje dochodza po dostarczeniu arkuszy.
 */
const buildStaticSheetFromPortrait = (
  def: CharacterDef,
  portrait: ImageSource,
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = def.columns * def.frameW;
  canvas.height = ANIM_NAMES.length * def.frameH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;

  const { w: srcW, h: srcH } = imageSize(portrait);
  if (!srcW || !srcH) return canvas;

  for (const anim of ANIM_NAMES) {
    const animDef = def.animations[anim];
    const startCol = animDef.startCol ?? 0;
    for (let frame = 0; frame < animDef.frames; frame++) {
      const ox = (startCol + frame) * def.frameW;
      const oy = animDef.row * def.frameH;
      // portret ma te sama proporcje co klatka, wiec wypelnia ja dokladnie
      ctx.drawImage(portrait, 0, 0, srcW, srcH, ox, oy, def.frameW, def.frameH);
    }
  }
  return canvas;
};

/** Obrys nieprzezroczystych pikseli wewnatrz prostokata. */
interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Wyznacza obrys sylwetki na podstawie kanalu alfa.
 *
 * Komorka arkusza jest zwykle wieksza niz sama postac (duzo pustego marginesu),
 * dlatego rozmiar bierzemy z obrysu, a nie z komorki - inaczej postac wyszłaby
 * za mala.
 */
const alphaBounds = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Bounds | null => {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[rowOffset + x * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
};

/**
 * Poziome przesuniecie srodka ciezkosci bioder wzgledem lewej krawedzi obrysu.
 *
 * Klatka jest kotwiczona na biodrach, a nie na srodku obrysu, bo wyciagniety
 * cios albo kopniecie przesuwa obrys o ponad 100 px w bok - postac "uciekalaby"
 * z klatki i konczyna wychodzilaby poza nia. Biodra stoja w miejscu niezaleznie
 * od pozy, wiec to one sa stabilnym punktem odniesienia.
 *
 * Pas bioder lezy w okolicy 45-58% wysokosci obrysu (liczac od czubka glowy).
 * Dolny pas (nogi) odpada, bo przy kopnieciu z powietrza trafia w wyciagnieta
 * noge i przesuwa kotwice razem z nia. Gorna czesc (tulow) jest za waska przy
 * ciosie, gdzie obrys zdominowany jest przez ramie.
 */
const bodyAnchorX = (data: Uint8ClampedArray, width: number, bounds: Bounds): number => {
  const bandTop = bounds.y + Math.floor(bounds.h * 0.45);
  const bandBottom = bounds.y + Math.floor(bounds.h * 0.58);
  let minX = width;
  let maxX = -1;
  for (let y = bandTop; y < bandBottom; y++) {
    const rowOffset = y * width * 4;
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      if (data[rowOffset + x * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (maxX < 0) return bounds.w / 2;
  return (minX + maxX) / 2 - bounds.x;
};

/**
 * Wkleja jedna animacje z osobnego arkusza do glownego arkusza postaci.
 *
 * Klatki moga lezec w siatce `columns` x `rows` (np. 2x2) - czytamy je wiersz
 * po wierszu i wpisujemy do jednego poziomego rzedu, dzieki czemu dalszy kod
 * widzi zwykly arkusz.
 *
 * Skala jest dobierana tak, aby najwieksza klatka cyklu miala rozmiar postaci
 * (`fit`: wysokosc dla postaci stojacych, szerokosc dla lezacych), a jej
 * najnizszy punkt trafial na `originY`. Wszystkie klatki dostaja te sama skale,
 * wiec postac nie "skacze" w trakcie animacji.
 */
const pasteAnimationSheet = (
  target: HTMLCanvasElement,
  def: CharacterDef,
  anim: AnimName,
  source: ImageSource,
  grid: AnimSheetDef,
): void => {
  const ctx = target.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  const animDef = def.animations[anim];
  const { w: srcW, h: srcH } = imageSize(source);
  const cellW = srcW / grid.columns;
  const cellH = srcH / grid.rows;
  if (!cellW || !cellH) return;

  // wycinamy klatki do osobnych canvasow, zeby zmierzyc ich obrysy
  const cells: { canvas: HTMLCanvasElement; bounds: Bounds; anchorX: number }[] = [];
  for (let frame = 0; frame < animDef.frames; frame++) {
    const col = frame % grid.columns;
    const row = Math.floor(frame / grid.columns);
    if (row >= grid.rows) break;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(cellW);
    canvas.height = Math.round(cellH);
    const cctx = canvas.getContext('2d');
    if (!cctx) break;
    cctx.imageSmoothingEnabled = false;
    cctx.drawImage(
      source,
      col * cellW,
      row * cellH,
      cellW,
      cellH,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const data = cctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const bounds = alphaBounds(data, canvas.width, canvas.height);
    if (bounds) {
      const anchorX =
        grid.anchor === 'center' ? bounds.w / 2 : bodyAnchorX(data, canvas.width, bounds);
      cells.push({ canvas, bounds, anchorX });
    }
  }
  if (cells.length === 0) return;

  // najwieksza klatka wyznacza skale - reszta jest rysowana w tej samej skali.
  // Pozy lezace mierzymy po szerokosci, bo ich "wzrost" to dlugosc ciala.
  const fitWidth = grid.fit === 'width';
  const extent = (b: Bounds): number => (fitWidth ? b.w : b.h);
  const largest = cells.reduce((a, b) => (extent(b.bounds) > extent(a.bounds) ? b : a));
  const scale = grid.scale ?? def.bodyH / extent(largest.bounds);

  const startCol = animDef.startCol ?? 0;
  for (let frame = 0; frame < cells.length; frame++) {
    const { canvas, bounds, anchorX } = cells[frame];
    const ox = (startCol + frame) * def.frameW;
    const oy = animDef.row * def.frameH;
    const drawW = bounds.w * scale;
    const drawH = bounds.h * scale;

    ctx.clearRect(ox, oy, def.frameW, def.frameH);
    ctx.drawImage(
      canvas,
      bounds.x,
      bounds.y,
      bounds.w,
      bounds.h,
      // biodra na osi postaci, stopy na linii podlogi
      ox + def.originX - anchorX * scale,
      oy + def.originY - drawH,
      drawW,
      drawH,
    );
  }
};

/** Portret zastepczy - powiekszenie sylwetki postaci z wygenerowanego arkusza. */
const generateCharacterPortrait = (def: CharacterDef): HTMLCanvasElement => {
  const sheet = generateCharacterSheet(def);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#241a3d');
  grad.addColorStop(1, '#0d0a14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // klatka idle, wyrownana do dolu portretu
  const scale = 2;
  ctx.drawImage(
    sheet,
    0,
    0,
    def.frameW,
    def.frameH,
    (canvas.width - def.frameW * scale) / 2,
    canvas.height - def.frameH * scale,
    def.frameW * scale,
    def.frameH * scale,
  );
  return canvas;
};

export interface LoadProgress {
  loaded: number;
  total: number;
  label: string;
}

/**
 * Wczytuje wszystkie zasoby gry.
 *
 * Kazda grafika ma proceduralny odpowiednik, wiec brak plikow nie przerywa
 * dzialania gry - zamiast tego zasob jest zastepowany i raportowany w
 * `missingImages`. Dzieki temu mozna grac jeszcze przed dostarczeniem grafik.
 */
export const loadAssets = async (
  characterDefs: readonly CharacterDef[],
  stage: StageDef,
  audioCtx: AudioContext | null,
  audioFiles: readonly string[],
  onProgress?: (p: LoadProgress) => void,
): Promise<LoadedAssets> => {
  const missingImages: string[] = [];
  const missingAudio: string[] = [];
  const configProblems: string[] = [];

  for (const def of characterDefs) {
    const problems = validateAnimLayout(def.animations, def.columns);
    for (const p of problems) configProblems.push(`${def.name}: ${p}`);
  }

  const imageTargets: string[] = [
    ...characterDefs.flatMap((c) => [
      c.sheet,
      c.portrait,
      ...(c.damagePortraits ?? []),
      ...Object.values(c.animationSheets ?? {}).map((s) => s.sheet),
    ]),
    stage.background,
    stage.road,
  ];
  const total = imageTargets.length + audioFiles.length;
  let loaded = 0;
  const tick = (label: string): void => {
    loaded++;
    onProgress?.({ loaded, total, label });
  };

  /** Wczytuje obraz, a przy bledzie zwraca proceduralna grafike zastepcza. */
  const loadOrFallback = async (
    src: string,
    fallback: () => ImageSource,
    label: string,
  ): Promise<{ image: ImageSource; placeholder: boolean }> => {
    try {
      const img = await loadImage(src);
      tick(label);
      return { image: img, placeholder: false };
    } catch {
      missingImages.push(src);
      tick(`${label} (placeholder)`);
      return { image: fallback(), placeholder: true };
    }
  };

  const characters: Record<string, LoadedCharacter> = {};
  for (const def of characterDefs) {
    // portret wczytujemy pierwszy - sluzy tez jako zapasowa grafika postaci
    const portrait = await loadOrFallback(
      def.portrait,
      () => generateCharacterPortrait(def),
      `${def.name} (portret)`,
    );
    const sheet = await loadOrFallback(
      def.sheet,
      () =>
        portrait.placeholder
          ? generateCharacterSheet(def)
          : buildStaticSheetFromPortrait(def, portrait.image),
      def.name,
    );

    // Animacje dostarczone jako osobne arkusze doklejamy na wierzch arkusza
    // glownego. Rysowanie postaci zostaje bez zmian - nadal czyta jeden arkusz.
    const animationSheets = def.animationSheets ?? {};
    const animNames = Object.keys(animationSheets) as AnimName[];
    let sheetImage: ImageSource = sheet.image;
    let usedAnimSheet = false;

    if (animNames.length > 0) {
      const composed = toCanvas(
        sheet.image,
        def.columns * def.frameW,
        ANIM_NAMES.length * def.frameH,
      );
      for (const anim of animNames) {
        const grid = animationSheets[anim];
        if (!grid) continue;
        try {
          const img = await loadImage(grid.sheet);
          pasteAnimationSheet(composed, def, anim, img, grid);
          usedAnimSheet = true;
          tick(`${def.name} (${anim})`);
        } catch {
          missingImages.push(grid.sheet);
          tick(`${def.name} (${anim}) (placeholder)`);
        }
      }
      if (usedAnimSheet) sheetImage = composed;
    }

    // portrety obrazen wgrywamy po arkuszu - kazdy nieudany wpis zastepujemy
    // zwyklym portretem, zeby HUD mial komplet stanow
    const damagePortraits: ImageSource[] = [];
    for (const src of def.damagePortraits ?? []) {
      const variant = await loadOrFallback(src, () => portrait.image, `${def.name} (portret)`);
      damagePortraits.push(variant.image);
    }

    characters[def.id] = {
      def,
      sheet: sheetImage,
      portrait: portrait.image,
      damagePortraits,
      isPlaceholder: (sheet.placeholder || portrait.placeholder) && !usedAnimSheet,
    };
  }

  const bg = await loadOrFallback(stage.background, () => generateStageBackground(stage), 'Tlo');
  const road = await loadOrFallback(stage.road, () => generateStageRoad(stage), 'Ulica');

  const bgSize = imageSize(bg.image);
  const roadSize = imageSize(road.image);

  const loadedStage: LoadedStage = {
    def: stage,
    background: bg.image,
    road: road.image,
    backgroundWidth: bgSize.w,
    backgroundHeight: bgSize.h,
    roadWidth: roadSize.w,
    roadHeight: roadSize.h,
    isPlaceholder: bg.placeholder || road.placeholder,
  };

  const audio = new Map<string, AudioBuffer>();
  if (audioCtx) {
    for (const file of audioFiles) {
      try {
        const buffer = await loadAudioBuffer(audioCtx, file);
        audio.set(file, buffer);
        tick(file);
      } catch {
        missingAudio.push(file);
        tick(`${file} (pominieto)`);
      }
    }
  } else {
    loaded += audioFiles.length;
    onProgress?.({ loaded, total, label: 'audio' });
  }

  return {
    characters,
    stage: loadedStage,
    audio,
    missingImages,
    missingAudio,
    configProblems,
  };
};
