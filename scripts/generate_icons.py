#!/usr/bin/env python3
"""Generate the Piano Studio app icons with Pillow (PIL) only.

Run from the repository root::

    python scripts/generate_icons.py

Design
------
Minimalist piano keyboard on a blue (#208AEF) background: two octaves
(14 white keys, 10 black keys) using the canonical C#, D#, F#, G#, A# layout.

Every measurement is derived from the keyboard *width*, expressed as a ratio of
the canonical 1024px composition (keyboard block x 128..896, y 280..728), so all
outputs keep identical proportions at their own scale.

Outputs (assets/images/, overwritten):
    icon.png                     1024x1024  full app icon (opaque)
    android-icon-background.png   512x512   adaptive-icon background (solid)
    android-icon-foreground.png   512x512   adaptive-icon foreground (transparent)
    android-icon-monochrome.png   432x432   adaptive-icon monochrome (transparent)
    favicon.png                    48x48    web favicon (simplified)
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

# --------------------------------------------------------------------------- #
# Palette (brand blue + Tailwind zinc scale)
# --------------------------------------------------------------------------- #
BRAND_BLUE = (0x20, 0x8A, 0xEF, 255)  # background (matches the splash #208AEF)
ZINC_100 = (0xF4, 0xF4, 0xF5, 255)  # white keys
ZINC_900 = (0x18, 0x18, 0x1B, 255)  # black keys
ZINC_800 = (0x27, 0x27, 0x2A, 255)  # keyboard base / shadow line
WHITE = (0xFF, 0xFF, 0xFF, 255)
CLEAR = (0, 0, 0, 0)

# --------------------------------------------------------------------------- #
# Canonical geometry, relative to a 1024px canvas / 768px keyboard
# --------------------------------------------------------------------------- #
CANVAS = 1024
KB_WIDTH_FRAC = 768 / CANVAS  # keyboard width / canvas width
KB_ASPECT = 448 / 768  # keyboard height / keyboard width
KB_CENTER_OFFSET = (504 - 512) / CANVAS  # block center, slightly above center

KEY_GAP_RATIO = 6 / 768  # gap between white keys
WHITE_RADIUS_RATIO = 12 / 768  # white key corner radius
BLACK_RADIUS_RATIO = 10 / 768  # black key corner radius
BASE_RATIO = 6 / 768  # shadow line height

BLACK_HEIGHT_RATIO = 0.62  # black key height / keyboard height
BLACK_WIDTH_RATIO = 0.60  # black key width / white key width

KEYS_PER_OCTAVE = 7
BLACK_KEY_OFFSETS = (0, 1, 3, 4, 5)  # C#, D#, F#, G#, A#
WHITE_KEY_COUNT = 14  # two octaves

BOTTOM_CORNERS = (False, False, True, True)  # round only the key bottoms

# Adaptive-icon layers keep the artwork inside the 66% safe zone.
SAFE_ZONE = 0.66
ADAPTIVE_ZOOM = SAFE_ZONE / KB_WIDTH_FRAC  # 0.88 -> keyboard = 66% of canvas

ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets" / "images"


# --------------------------------------------------------------------------- #
# Geometry
# --------------------------------------------------------------------------- #
def keyboard_box(size: int, zoom: float = 1.0, vertical_offset: float = KB_CENTER_OFFSET):
    """Return the (x0, y0, x1, y1) keyboard block for a canvas of `size` px."""
    width = size * KB_WIDTH_FRAC * zoom
    height = width * KB_ASPECT
    center_x = size / 2
    center_y = size * (0.5 + vertical_offset)
    return (center_x - width / 2, center_y - height / 2, center_x + width / 2, center_y + height / 2)


def white_key_boxes(box, count: int, gap: float):
    """Lay out `count` white keys left to right, separated by `gap` px."""
    x0, y0, x1, y1 = box
    key_width = (x1 - x0 - gap * (count - 1)) / count
    step = key_width + gap
    boxes = [(x0 + i * step, y0, x0 + i * step + key_width, y1) for i in range(count)]
    return boxes, key_width


def black_key_boxes(box, white_boxes, key_width: float):
    """Place black keys on the octave pattern, centred on the white-key seams."""
    x0, y0, x1, y1 = box
    height = y0 + (y1 - y0) * BLACK_HEIGHT_RATIO
    half_width = key_width * BLACK_WIDTH_RATIO / 2
    boxes = []
    for octave in range(len(white_boxes) // KEYS_PER_OCTAVE):
        for offset in BLACK_KEY_OFFSETS:
            index = octave * KEYS_PER_OCTAVE + offset
            seam = (white_boxes[index][2] + white_boxes[index + 1][0]) / 2
            boxes.append((seam - half_width, y0, seam + half_width, height))
    return boxes


def clamped_radius(radius: float, rect) -> int:
    """Keep rounded-rect radii sane for very small shapes (e.g. the base line)."""
    x0, y0, x1, y1 = rect
    limit = int(min(x1 - x0, y1 - y0) / 2)
    return max(1, min(int(round(radius)), limit))


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #
def keyboard_layer(size, box, *, white_count, gap, base_height, white_fill, black_fill, base_fill, punch_black):
    """Draw the keyboard on a transparent RGBA layer of `size` square."""
    layer = Image.new("RGBA", (size, size), CLEAR)
    draw = ImageDraw.Draw(layer)

    block_width = box[2] - box[0]
    white_radius = clamped_radius(block_width * WHITE_RADIUS_RATIO, box)
    black_radius = clamped_radius(block_width * BLACK_RADIUS_RATIO, box)

    white_boxes, key_width = white_key_boxes(box, white_count, gap)
    black_boxes = black_key_boxes(box, white_boxes, key_width)

    for key in white_boxes:
        draw.rounded_rectangle(key, radius=white_radius, fill=white_fill, corners=BOTTOM_CORNERS)

    if base_fill is not None and base_height > 0:
        x0, _, x1, y1 = box
        base = (x0, y1 - base_height, x1, y1)
        draw.rounded_rectangle(base, radius=clamped_radius(white_radius, base), fill=base_fill, corners=BOTTOM_CORNERS)

    if punch_black:
        # Monochrome avatar: punch the black keys out of the silhouette so the
        # keyboard stays readable as a single tinted glyph.
        mask = Image.new("L", (size, size), 255)
        mask_draw = ImageDraw.Draw(mask)
        for key in black_boxes:
            mask_draw.rounded_rectangle(key, radius=black_radius, fill=0, corners=BOTTOM_CORNERS)
        layer.putalpha(ImageChops.multiply(layer.getchannel("A"), mask))
    else:
        for key in black_boxes:
            draw.rounded_rectangle(key, radius=black_radius, fill=black_fill, corners=BOTTOM_CORNERS)

    return layer


def supersample(size: int) -> int:
    """Draw large icons at 2x and small ones at 4x, then downsample (AA)."""
    return 2 if size >= 1024 else 4


def downsample(image: Image.Image, size: int) -> Image.Image:
    """Box-filter downscale: exact area averaging for our integer SSAA factors.

    Preferred over LANCZOS here because flat-colour art does not benefit from
    LANCZOS sharpening, while its negative lobes leave a faint alpha halo a few
    pixels outside the artwork.
    """
    return image.resize((size, size), Image.Resampling.BOX)


def compose(
    size: int,
    *,
    background=BRAND_BLUE,
    zoom: float = 1.0,
    vertical_offset: float = KB_CENTER_OFFSET,
    white_count: int = WHITE_KEY_COUNT,
    min_gap: float = 0.0,
    min_base: float = 0.0,
    white_fill=ZINC_100,
    black_fill=ZINC_900,
    base_fill=ZINC_800,
    punch_black: bool = False,
) -> Image.Image:
    """Render one icon of `size` px (RGBA). `min_*` are floors in final px."""
    scale = supersample(size)
    canvas = size * scale
    box = keyboard_box(canvas, zoom=zoom, vertical_offset=vertical_offset)
    block_width = box[2] - box[0]

    gap = max(1, int(round(block_width * KEY_GAP_RATIO)), int(round(min_gap * scale)))
    base_height = max(0, int(round(block_width * BASE_RATIO)), int(round(min_base * scale)))

    image = Image.new("RGBA", (canvas, canvas), CLEAR if background is None else background)
    image.alpha_composite(
        keyboard_layer(
            canvas,
            box,
            white_count=white_count,
            gap=gap,
            base_height=base_height,
            white_fill=white_fill,
            black_fill=black_fill,
            base_fill=base_fill,
            punch_black=punch_black,
        )
    )
    return downsample(image, size)


# --------------------------------------------------------------------------- #
# Outputs
# --------------------------------------------------------------------------- #
def build_targets():
    """Return {filename: image} for every icon that must be written."""
    return {
        # Full app icon: complete composition on a solid background.
        "icon.png": compose(CANVAS, background=BRAND_BLUE),
        # Adaptive background: solid brand blue.
        "android-icon-background.png": Image.new("RGBA", (512, 512), BRAND_BLUE),
        # Adaptive foreground: keyboard only, inside the 66% safe zone.
        "android-icon-foreground.png": compose(512, background=None, zoom=ADAPTIVE_ZOOM),
        # Adaptive monochrome: white silhouette, black keys punched out.
        "android-icon-monochrome.png": compose(
            432,
            background=None,
            zoom=ADAPTIVE_ZOOM,
            white_fill=WHITE,
            black_fill=WHITE,
            base_fill=WHITE,
            punch_black=True,
        ),
        # Web favicon: simplified, one octave, 1px minimum features.
        "favicon.png": compose(48, background=BRAND_BLUE, white_count=KEYS_PER_OCTAVE, min_gap=1, min_base=1),
    }


def main() -> int:
    targets = build_targets()
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    for name, image in targets.items():
        image.save(ASSETS_DIR / name, format="PNG", optimize=True)

    print(f"Wrote {len(targets)} icons to {ASSETS_DIR}")
    for name in targets:
        path = ASSETS_DIR / name
        with Image.open(path) as check:
            check.load()
            width, height = check.size
            print(f"  {name:<30} {width}x{height}  {check.mode:<5} {path.stat().st_size:>8,} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
