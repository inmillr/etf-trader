#!/usr/bin/env python3
"""Generate abstract Gruvbox Dark Hard multi-monitor wallpapers."""

from __future__ import annotations

import argparse
import math
import random
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw

COLORS = {
    "bg_dim": (0x14, 0x16, 0x17),
    "bg": (0x1D, 0x20, 0x21),
    "panel": (0x28, 0x28, 0x28),
    "panel_alt": (0x3C, 0x38, 0x36),
    "border": (0x50, 0x49, 0x45),
    "accent": (0xFE, 0x80, 0x19),
    "aqua": (0x8E, 0xC0, 0x7C),
    "yellow": (0xFA, 0xBD, 0x2F),
    "purple": (0xD3, 0x86, 0x9B),
    "blue": (0x83, 0xA5, 0x98),
}


@dataclass(frozen=True)
class Layout:
    name: str
    width: int
    height: int
    monitor_width: int
    labels: tuple[str, ...]
    outputs: tuple[str, ...]
    master_name: str
    apply_cosmic: bool


TRIPLE = Layout(
    name="triple",
    width=7680,
    height=1440,
    monitor_width=2560,
    labels=("left", "center", "right"),
    outputs=("DP-4", "DP-5", "DP-6"),
    master_name="etf-trader-gruvbox-triple-7680x1440.png",
    apply_cosmic=True,
)

# 16" 2K laptop + portable monitor, side by side (2560x1600 each).
DUAL = Layout(
    name="dual",
    width=5120,
    height=1600,
    monitor_width=2560,
    labels=("laptop", "portable"),
    outputs=("eDP-1", "DP-1"),
    master_name="etf-trader-gruvbox-dual-5120x1600.png",
    apply_cosmic=False,
)


def lerp_color(
    c1: tuple[int, int, int], c2: tuple[int, int, int], t: float
) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return (
        int(c1[0] + (c2[0] - c1[0]) * t),
        int(c1[1] + (c2[1] - c1[1]) * t),
        int(c1[2] + (c2[2] - c1[2]) * t),
    )


def rgba(color: tuple[int, int, int], alpha: int) -> tuple[int, int, int, int]:
    return (*color, alpha)


def new_layer(width: int, height: int) -> Image.Image:
    return Image.new("RGBA", (width, height), (0, 0, 0, 0))


def composite(base: Image.Image, layer: Image.Image) -> Image.Image:
    return Image.alpha_composite(base, layer)


def draw_base_gradient(width: int, height: int) -> Image.Image:
    img = Image.new("RGB", (width, height), COLORS["bg_dim"])
    pixels = img.load()
    for y in range(height):
        ty = y / max(height - 1, 1)
        for x in range(width):
            tx = x / max(width - 1, 1)
            vertical = lerp_color(COLORS["bg_dim"], COLORS["bg"], ty * 0.9)
            pixels[x, y] = lerp_color(vertical, COLORS["panel_alt"], tx * 0.12)
    return img.convert("RGBA")


def draw_diagonal_ribbons(
    draw: ImageDraw.ImageDraw,
    width: int,
    height: int,
    origin_x: float,
    origin_y: float,
    colors: list[tuple[int, int, int]],
    alphas: list[int],
    spacing: int,
    angle_deg: float,
    band_height: int = 120,
) -> None:
    angle = math.radians(angle_deg)
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    span = width + height

    for index, (color, alpha) in enumerate(zip(colors, alphas)):
        offset = origin_x + index * spacing
        points = [
            (-span, offset),
            (span, offset + span * sin_a / max(cos_a, 0.2)),
            (span, offset + band_height + span * sin_a / max(cos_a, 0.2)),
            (-span, offset + band_height),
        ]
        rotated = []
        for px, py in points:
            rx = px * cos_a - py * sin_a + origin_y
            ry = px * sin_a + py * cos_a + height * 0.08
            rotated.extend([rx, ry])
        draw.polygon(rotated, fill=rgba(color, alpha))


def render_continuous_canvas(
    width: int,
    height: int,
    *,
    seed_offset: int = 0,
    ribbon_origin_x: float = -520,
    ribbon_angle_deg: float = 24,
) -> Image.Image:
    """Render one abstract composition spanning all monitors."""
    base = draw_base_gradient(width, height)
    layer = new_layer(width, height)
    draw = ImageDraw.Draw(layer)

    center_x = width * 0.5
    center_y = height * 0.5
    scale = height / 1440.0

    draw_diagonal_ribbons(
        draw,
        width,
        height,
        origin_x=ribbon_origin_x,
        origin_y=width * 0.04,
        colors=[
            COLORS["accent"],
            COLORS["yellow"],
            COLORS["panel"],
            COLORS["aqua"],
            COLORS["purple"],
        ],
        alphas=[95, 70, 50, 65, 55],
        spacing=int(185 * scale),
        angle_deg=ribbon_angle_deg,
        band_height=int(120 * scale),
    )

    draw_polygon_field(
        draw,
        width,
        height,
        seed=17 + seed_offset,
        palette=[
            COLORS["accent"],
            COLORS["blue"],
            COLORS["aqua"],
            COLORS["purple"],
            COLORS["border"],
        ],
        count=max(10, int(16 * (width / 7680))),
    )

    draw_flow_lines(
        draw, width, height, seed=31 + seed_offset, color=COLORS["blue"], alpha=50, count=5
    )
    draw_flow_lines(
        draw, width, height, seed=37 + seed_offset, color=COLORS["accent"], alpha=42, count=4
    )
    draw_flow_lines(
        draw, width, height, seed=41 + seed_offset, color=COLORS["aqua"], alpha=38, count=3
    )

    # Focal orbit system sits on the center seam and spills into both sides.
    draw_orbit_cluster(
        draw,
        center_x,
        center_y * 0.96,
        [COLORS["yellow"], COLORS["accent"], COLORS["aqua"], COLORS["purple"]],
        seed=29 + seed_offset,
    )
    draw_orbit_cluster(
        draw,
        width * 0.22,
        height * 0.34,
        [COLORS["accent"], COLORS["yellow"], COLORS["blue"]],
        seed=11 + seed_offset,
    )
    draw_orbit_cluster(
        draw,
        width * 0.78,
        height * 0.62,
        [COLORS["aqua"], COLORS["purple"], COLORS["blue"]],
        seed=53 + seed_offset,
    )

    for index, radius in enumerate((680, 480, 300, 160)):
        scaled_radius = radius * scale
        draw.ellipse(
            (
                center_x - scaled_radius,
                center_y * 0.96 - scaled_radius,
                center_x + scaled_radius,
                center_y * 0.96 + scaled_radius,
            ),
            outline=rgba(
                [COLORS["border"], COLORS["yellow"], COLORS["accent"], COLORS["aqua"]][index],
                [42, 58, 72, 85][index],
            ),
            width=[2, 2, 3, 4][index],
        )

    vignette = new_layer(width, height)
    vdraw = ImageDraw.Draw(vignette)
    vdraw.rectangle((0, 0, width, height), fill=(0, 0, 0, 30))
    vdraw.polygon(
        [
            (0, 0),
            (width, 0),
            (width, height * 0.16),
            (0, height * 0.24),
        ],
        fill=(0, 0, 0, 0),
    )

    result = composite(base, layer)
    result = composite(result, vignette)
    return result.convert("RGB")


def render_for_layout(layout: Layout) -> Image.Image:
    if layout.name == "triple":
        return render_continuous_canvas(
            layout.width,
            layout.height,
            seed_offset=0,
            ribbon_origin_x=-520,
            ribbon_angle_deg=24,
        )
    return render_continuous_canvas(
        layout.width,
        layout.height,
        seed_offset=7,
        ribbon_origin_x=-380,
        ribbon_angle_deg=22,
    )


def draw_arc_ring(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    radius: float,
    start: float,
    end: float,
    color: tuple[int, int, int],
    alpha: int,
    line_width: int,
) -> None:
    draw.arc(
        (cx - radius, cy - radius, cx + radius, cy + radius),
        start=start,
        end=end,
        fill=rgba(color, alpha),
        width=line_width,
    )


def draw_flow_lines(
    draw: ImageDraw.ImageDraw,
    width: int,
    height: int,
    seed: int,
    color: tuple[int, int, int],
    alpha: int,
    count: int,
) -> None:
    rng = random.Random(seed)
    for _ in range(count):
        y0 = rng.uniform(height * 0.15, height * 0.85)
        amplitude = rng.uniform(height * 0.04, height * 0.12)
        frequency = rng.uniform(1.2, 2.8)
        phase = rng.uniform(0, math.tau)
        points = []
        for x in range(0, width + 1, 12):
            t = x / max(width, 1)
            y = y0 + math.sin(t * math.pi * frequency + phase) * amplitude
            points.append((x, y))
        draw.line(
            points,
            fill=rgba(color, alpha),
            width=rng.randint(2, 4),
            joint="curve",
        )


def draw_orbit_cluster(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    palette: list[tuple[int, int, int]],
    seed: int,
) -> None:
    rng = random.Random(seed)
    for index in range(7):
        radius = rng.uniform(80, 420)
        color = palette[index % len(palette)]
        alpha = rng.randint(35, 95)
        start = rng.uniform(0, 220)
        end = start + rng.uniform(70, 170)
        draw_arc_ring(draw, cx, cy, radius, start, end, color, alpha, rng.randint(3, 9))

        dot_angle = math.radians(start + (end - start) * 0.5)
        dot_x = cx + math.cos(dot_angle) * radius
        dot_y = cy + math.sin(dot_angle) * radius
        r = rng.randint(6, 16)
        draw.ellipse(
            (dot_x - r, dot_y - r, dot_x + r, dot_y + r),
            fill=rgba(color, min(255, alpha + 60)),
        )


def draw_polygon_field(
    draw: ImageDraw.ImageDraw,
    width: int,
    height: int,
    seed: int,
    palette: list[tuple[int, int, int]],
    count: int,
) -> None:
    rng = random.Random(seed)
    for _ in range(count):
        sides = rng.choice([3, 4, 5, 6])
        cx = rng.uniform(-width * 0.1, width * 1.1)
        cy = rng.uniform(-height * 0.1, height * 1.1)
        size = rng.uniform(120, 520)
        rotation = rng.uniform(0, math.tau)
        points = []
        for side in range(sides):
            angle = rotation + (math.tau / sides) * side
            points.append(
                (
                    cx + math.cos(angle) * size,
                    cy + math.sin(angle) * size,
                )
            )
        color = rng.choice(palette)
        draw.polygon(points, fill=rgba(color, rng.randint(28, 72)))


def write_cosmic_background(monitors: list[tuple[str, Path]]) -> None:
    cosmic_dir = Path.home() / ".config/cosmic/com.system76.CosmicBackground/v1"
    cosmic_dir.mkdir(parents=True, exist_ok=True)

    for stale in ("all", "all.bak-span-disabled"):
        stale_path = cosmic_dir / stale
        if stale_path.is_file():
            stale_path.unlink()

    def config_block(output: str, image: Path) -> str:
        return f"""(
    output: "{output}",
    source: Path("{image}"),
    filter_by_theme: false,
    rotation_frequency: 300,
    filter_method: Lanczos,
    scaling_mode: Zoom,
    sampling_method: Alphanumeric,
)"""

    (cosmic_dir / "same-on-all").write_text("false\n")
    (cosmic_dir / "backgrounds").write_text(
        "[" + ", ".join(f'"{name}"' for name, _ in monitors) + "]\n"
    )

    for output, image in monitors:
        (cosmic_dir / f"output.{output}").write_text(
            config_block(output, image) + "\n"
        )


def write_cosmic_bundle(
    bundle_dir: Path,
    monitors: list[tuple[str, Path]],
    note: str,
) -> None:
    """Write a portable COSMIC config bundle (for laptop / other machines)."""
    bundle_dir.mkdir(parents=True, exist_ok=True)

    def config_block(output: str, image: Path) -> str:
        return f"""(
    output: "{output}",
    source: Path("{image}"),
    filter_by_theme: false,
    rotation_frequency: 300,
    filter_method: Lanczos,
    scaling_mode: Zoom,
    sampling_method: Alphanumeric,
)"""

    (bundle_dir / "same-on-all").write_text("false\n")
    (bundle_dir / "backgrounds").write_text(
        "[" + ", ".join(f'"{name}"' for name, _ in monitors) + "]\n"
    )
    for output, image in monitors:
        (bundle_dir / f"output.{output}").write_text(
            config_block(output, image) + "\n"
        )
    (bundle_dir / "README.txt").write_text(note + "\n")


def generate_layout(layout: Layout, output_dir: Path) -> list[tuple[str, Path]]:
    img = render_for_layout(layout)
    master_path = output_dir / layout.master_name

    output_dir.mkdir(parents=True, exist_ok=True)
    img.save(master_path, format="PNG", optimize=True)
    print(f"Wrote {master_path} ({layout.width}x{layout.height})")

    monitors: list[tuple[str, Path]] = []
    for index, (label, connector) in enumerate(zip(layout.labels, layout.outputs)):
        left = index * layout.monitor_width
        crop = img.crop((left, 0, left + layout.monitor_width, layout.height))
        crop_path = output_dir / (
            f"etf-trader-gruvbox-{layout.name}-{label}-"
            f"{layout.monitor_width}x{layout.height}.png"
        )
        crop.save(crop_path, format="PNG", optimize=True)
        monitors.append((connector, crop_path))
        print(f"Wrote {crop_path}")

    if layout.apply_cosmic:
        write_cosmic_background(monitors)
        print("Updated COSMIC per-monitor wallpaper config.")
    else:
        bundle_dir = output_dir / f"cosmic-{layout.name}-config"
        note = (
            "Copy these files into ~/.config/cosmic/com.system76.CosmicBackground/v1/\n"
            "after confirming connector names with: xrandr --query\n"
            f"Expected outputs: {', '.join(layout.outputs)}\n"
            "Then restart: killall cosmic-bg"
        )
        write_cosmic_bundle(bundle_dir, monitors, note)
        print(f"Wrote portable COSMIC config bundle: {bundle_dir}")

    return monitors


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate Gruvbox abstract wallpapers for desk and laptop setups."
    )
    parser.add_argument(
        "--layout",
        choices=("triple", "dual", "all"),
        default="all",
        help="Which layout to generate (default: all)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path.home() / "Pictures" / "wallpapers",
        help="Directory for generated PNG files",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    layouts = {
        "triple": TRIPLE,
        "dual": DUAL,
        "all": None,
    }
    selected = [TRIPLE, DUAL] if args.layout == "all" else [layouts[args.layout]]
    for layout in selected:
        print(f"\n=== {layout.name} ({layout.width}x{layout.height}) ===")
        generate_layout(layout, args.output_dir)


if __name__ == "__main__":
    main()
