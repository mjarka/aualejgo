/**
 * Pomocnicze funkcje dla zrodel obrazu.
 *
 * `CanvasImageSource` obejmuje kilka typow (HTMLImageElement, HTMLCanvasElement,
 * ImageBitmap, VideoFrame...), ktore nie maja wspolnego interfejsu wymiarow.
 * Te funkcje normalizuja odczyt rozmiaru i rysowanie.
 */

export const imageSize = (img: CanvasImageSource): { w: number; h: number } => {
  if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) {
    return { w: img.naturalWidth, h: img.naturalHeight };
  }
  if (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) {
    return { w: img.width, h: img.height };
  }
  if (typeof HTMLVideoElement !== 'undefined' && img instanceof HTMLVideoElement) {
    return { w: img.videoWidth, h: img.videoHeight };
  }
  if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) {
    return { w: img.width, h: img.height };
  }
  if (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas) {
    return { w: img.width, h: img.height };
  }
  return { w: 0, h: 0 };
};
