"""
Konwersja grafik gry do WebP.

Zrodla to duze PNG/JPG (34 MB), a gra rysuje je w rozdzielczosci 640x360, wiec
zapas jakosci jest ogromny. WebP daje ~10x mniejszy plik przy nieodroznialnej
jakosci.

Kluczowa jest ALFA: krawedzie sprite'ow musza zostac czyste, dlatego alfa jest
bezstratna (`alpha_quality=100`), a kompresja dotyczy tylko koloru.

Uruchomienie:
    npm run compress          # konwersja + usuniecie zrodel
    npm run compress:check    # tylko raport, bez zapisu

Po konwersji zrodla sa usuwane, zeby repozytorium nie trzymalo 34 MB PNG-ow
obok 3 MB WebP. Uzyj `--keep-source`, jesli chcesz je zachowac.
"""

from __future__ import annotations

import argparse
import io
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "public" / "assets"

# Jakosc dobrana per kategoria. Sprite'y sa skalowane w dol mocniej niz tla,
# wiec dostaja najwiecej zapasu; tla sa rozciagane na caly ekran i wymagaja
# wiekszej wiernosci.
#
# `min_psnr` jest per kategoria, bo sufit jakosci zalezy od zrodla: tla sa
# fotograficznymi JPEG-ami, ktorych artefakty zostaja w obrazie na zawsze -
# `bgr.jpg` nie przekracza ~42 dB nawet przy jakosci 100. Sprite'y i portrety
# sa bezstratne, wiec moga trzymac wyzszy prog.
PROFILES = {
    "sprites": {"quality": 90, "alpha_quality": 100, "display": (224, 192), "min_psnr": 48.0},
    "portraits": {"quality": 88, "alpha_quality": 100, "display": (54, 81), "min_psnr": 48.0},
    "backgrounds": {"quality": 82, "alpha_quality": 100, "display": (640, 360), "min_psnr": 38.0},
}


def profile_for(path: Path) -> dict:
    rel = path.relative_to(ASSETS)
    return PROFILES.get(rel.parts[0], PROFILES["sprites"])


def visible_psnr(a: Image.Image, b: Image.Image) -> float:
    """PSNR koloru liczony tylko na widocznych pikselach.

    WebP nie przechowuje koloru pod alfa=0, wiec liczenie po calym obrazie
    zanizaloby wynik o piksele, ktorych i tak nie widac.
    """
    x = np.asarray(a.convert("RGBA"), dtype=np.float64)
    y = np.asarray(b.convert("RGBA"), dtype=np.float64)
    mask = (x[:, :, 3] > 8) | (y[:, :, 3] > 8)
    if mask.sum() == 0:
        return 99.0
    d = (x[:, :, :3] - y[:, :, :3])[mask]
    mse = (d**2).mean()
    return 99.0 if mse == 0 else 10 * math.log10(255 * 255 / mse)


def screen_psnr(a: Image.Image, b: Image.Image, size: tuple[int, int]) -> float:
    """PSNR tego, co faktycznie widac na ekranie.

    Gra rysuje grafiki znacznie mniejsze niz pliki zrodlowe (sprite 1024 px
    trafia do klatki 224 px, portret 1024 px do 54 px), wiec pomiar 1:1 mierzy
    szczegoly, ktore nigdy nie trafiaja na ekran. Dlatego skalujemy oba obrazy
    do rozmiaru docelowego i dopiero wtedy porownujemy.

    Postac skladamy na tle, bo przezroczystosc nie ma wlasnego koloru - bez
    tego alfa=0 liczylaby sie jako czern i zanizala wynik.
    """
    bg = (60, 40, 80)

    def prep(im: Image.Image) -> np.ndarray:
        rgba = im.convert("RGBA")
        base = Image.new("RGB", rgba.size, bg)
        base.paste(rgba, mask=rgba.split()[3])
        return np.asarray(base.resize(size, Image.LANCZOS), dtype=np.float64)

    x, y = prep(a), prep(b)
    mse = ((x - y) ** 2).mean()
    return 99.0 if mse == 0 else 10 * math.log10(255 * 255 / mse)


def alpha_psnr(a: Image.Image, b: Image.Image) -> float:
    x = np.asarray(a.convert("RGBA"))[:, :, 3].astype(np.float64)
    y = np.asarray(b.convert("RGBA"))[:, :, 3].astype(np.float64)
    mse = ((x - y) ** 2).mean()
    return 99.0 if mse == 0 else 10 * math.log10(255 * 255 / mse)


def convert(path: Path, dry_run: bool) -> tuple[int, int, float, float]:
    original_bytes = path.stat().st_size
    img = Image.open(path).convert("RGBA")
    opts = profile_for(path)

    buf = io.BytesIO()
    img.save(buf, "WEBP", method=6, **opts)
    new_bytes = buf.tell()

    buf.seek(0)
    decoded = Image.open(buf)
    rgb = screen_psnr(img, decoded, opts["display"])
    alpha = alpha_psnr(img, decoded)

    if not dry_run:
        path.with_suffix(".webp").write_bytes(buf.getvalue())

    return original_bytes, new_bytes, rgb, alpha


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--keep-source", action="store_true")
    parser.add_argument("--min-alpha-psnr", type=float, default=48.0)
    args = parser.parse_args()

    sources = sorted(p for p in ASSETS.rglob("*") if p.suffix.lower() in (".png", ".jpg"))
    if not sources:
        print("Brak plikow zrodlowych do konwersji.")
        return 0

    total_before = total_after = 0
    failures: list[str] = []

    print(f"{'plik':<40}{'przed':>10}{'po':>10}{'zysk':>8}{'ekran':>8}{'alfa':>8}")
    print("-" * 84)

    for path in sources:
        before, after, rgb, alpha = convert(path, args.dry_run)
        total_before += before
        total_after += after

        rel = path.relative_to(ASSETS).as_posix()
        print(
            f"{rel:<40}{before / 1024:>9.0f}K{after / 1024:>9.0f}K"
            f"{before / after:>7.1f}x{rgb:>8.1f}{alpha:>8.1f}"
        )

        limit = profile_for(path)["min_psnr"]
        if rgb < limit:
            failures.append(f"{rel}: PSNR na ekranie {rgb:.1f} < {limit}")
        if alpha < args.min_alpha_psnr:
            failures.append(f"{rel}: alfa PSNR {alpha:.1f} < {args.min_alpha_psnr}")

    print("-" * 84)
    print(
        f"{'RAZEM':<40}{total_before / 1048576:>9.1f}M{total_after / 1048576:>9.1f}M"
        f"{total_before / total_after:>7.1f}x"
    )

    if failures:
        print("\nJakosc ponizej progu:")
        for f in failures:
            print(f"  {f}")
        return 1

    if args.dry_run:
        return 0

    print(f"\nZapisano {len(sources)} plikow .webp")

    # Zrodla usuwamy dopiero po udanej konwersji i sprawdzeniu jakosci - gdyby
    # ktorys plik wypadl zle, `failures` przerwaloby wczesniej.
    if not args.keep_source:
        for path in sources:
            path.unlink()
        print(f"Usunieto {len(sources)} plikow zrodlowych (--keep-source zachowuje je)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
