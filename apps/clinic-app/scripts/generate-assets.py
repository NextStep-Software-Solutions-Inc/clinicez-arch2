"""Generates the clinic app's launcher assets (icon, adaptive icon layers, splash, favicon).

Run from apps/clinic-app:  python scripts/generate-assets.py
Brand colour is the teal-600 from constants/theme.ts. Output is deterministic, so re-running changes nothing.
"""
from pathlib import Path

from PIL import Image, ImageDraw

TEAL = (13, 105, 99, 255)  # palette.teal[600] = #0D6963
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)
SCALE = 4  # supersample, then downsample for smooth edges

OUT = Path(__file__).resolve().parent.parent / "assets"


def cross(draw: ImageDraw.ImageDraw, size: int, span: float, colour):
    """A medical cross whose longest dimension is `span` (fraction of the canvas), centred."""
    length = size * span
    thickness = length * 0.34
    cx = cy = size / 2
    radius = thickness * 0.28
    draw.rounded_rectangle(
        [cx - length / 2, cy - thickness / 2, cx + length / 2, cy + thickness / 2], radius=radius, fill=colour
    )
    draw.rounded_rectangle(
        [cx - thickness / 2, cy - length / 2, cx + thickness / 2, cy + length / 2], radius=radius, fill=colour
    )


def render(size: int, background, foreground, span: float, rounded: bool = False) -> Image.Image:
    big = size * SCALE
    img = Image.new("RGBA", (big, big), CLEAR)
    d = ImageDraw.Draw(img)
    if background is not None:
        if rounded:
            d.rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 0.22, fill=background)
        else:
            d.rectangle([0, 0, big, big], fill=background)
    if foreground is not None:
        cross(d, big, span, foreground)
    return img.resize((size, size), Image.LANCZOS)


def save(name: str, img: Image.Image):
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / name, optimize=True)
    print("wrote", OUT / name)


# Store icon: full-bleed square (stores apply their own mask), so no rounding and no transparency.
save("icon.png", render(1024, TEAL, WHITE, 0.52).convert("RGB"))
# Android adaptive icon: the launcher masks to a circle/squircle and keeps the central 66%.
save("android-icon-background.png", render(1024, TEAL, None, 0).convert("RGB"))
save("android-icon-foreground.png", render(1024, None, WHITE, 0.40))
save("android-icon-monochrome.png", render(1024, None, WHITE, 0.40))
save("splash-icon.png", render(512, None, TEAL, 0.62))
save("favicon.png", render(96, TEAL, WHITE, 0.58, rounded=True))
