#!/usr/bin/env python3
"""Install Gruvbox-themed Pop!_OS splash/login branding."""

from __future__ import annotations

import shutil
import textwrap
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets" / "gruvbox-branding"
HOME = Path.home()

# ETF Trader / Gruvbox Dark Hard
CYAN = (0x48, 0xB9, 0xC7)
ACCENT = (0xFE, 0x80, 0x19)
TEXT = (0xEB, 0xDB, 0xB2)
BG_DIM = (0x14, 0x16, 0x17)
BG = (0x1D, 0x20, 0x21)
BORDER = (0x50, 0x49, 0x45)

SVG_TEMPLATE = """\
<svg version="1.0" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <g transform="matrix(4 0 0 4 -896.99 -880)">
    <circle cx="256.25" cy="252" r="30" fill="#{accent}"/>
    <g transform="translate(226.25 221.94) scale(.06342)" fill="#{text}" stroke-width="3.784">
      <rect x="236.5" y="710.5" width="488.77" height="78.833" rx="39.417" ry="39.417"/>
      <path d="M536 357c-24 51-64 92-120 112l48 125c9 23 17 47 10 69s-39 29-62 5c-44-47-192-343-203-365s-23-40-23-62c1-33 52-67 77-84s74-40 117-41 61 9 86 25c38 25 65 64 75 109s7 80-5 105m-113-54c-9-31-28-61-53-81-5-4-11-9-18-11-46-15-26 62-19 82s26 62 47 83c5 5 10 9 16 10s18-5 23-13 6-14 6-22a128 128 0 0 0-2-48z"/>
      <path d="M625 664c-2 9-7 17-15 22s-27 5-38-4-13-24-10-36 13-25 27-29c29-9 42 23 36 47z"/>
      <path d="M607 573c-18-7-12-103 5-220 5-32 13-48 22-56s36-12 52-9a90 90 0 0 1 49 24c12 11 13 23 9 38s-18 47-29 70l-28 53c-54 96-65 106-80 100z"/>
    </g>
  </g>
</svg>
"""


def rgb_hex(color: tuple[int, int, int]) -> str:
    return "".join(f"{channel:02x}" for channel in color)


def recolor_png(source: Path, target: Path) -> None:
    image = Image.open(source).convert("RGBA")
    pixels = image.load()
    width, height = image.size

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue

            # Pop cyan circle
            if abs(r - CYAN[0]) < 28 and abs(g - CYAN[1]) < 28 and abs(b - CYAN[2]) < 28:
                pixels[x, y] = (*ACCENT, a)
                continue

            # White logo -> Gruvbox foreground
            if r > 220 and g > 220 and b > 220:
                pixels[x, y] = (*TEXT, a)

    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target)


def write_svg(target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        SVG_TEMPLATE.format(
            accent=rgb_hex(ACCENT),
            text=rgb_hex(TEXT),
        )
    )


def write_plymouth_theme(theme_dir: Path, header_image: Path) -> None:
    theme_dir.mkdir(parents=True, exist_ok=True)

    for asset in (
        "bullet.png",
        "cursor.png",
        "endcap.png",
        "entry.png",
        "progress_bar.png",
        "lock.png",
        "capslock.png",
        "return.png",
    ):
        shutil.copy2(
            f"/usr/share/plymouth/themes/pop-basic/{asset}",
            theme_dir / asset,
        )

    shutil.copy2(header_image, theme_dir / "header-image.png")

    theme_dir.joinpath("etf-trader-gruvbox.plymouth").write_text(
        textwrap.dedent(
            f"""\
            [Plymouth Theme]
            Name=ETF Trader Gruvbox
            Description=Pop!_OS boot splash with Gruvbox Dark Hard branding
            ModuleName=two-step

            [two-step]
            Font=DejaVu Sans 11
            TitleFont=DejaVu Sans 11
            ImageDir={theme_dir}
            DialogHorizontalAlignment=.5
            DialogVerticalAlignment=.5
            TitleHorizontalAlignment=.5
            TitleVerticalAlignment=.382
            HorizontalAlignment=.5
            VerticalAlignment=.5
            WatermarkHorizontalAlignment=.5
            WatermarkVerticalAlignment=.5
            Transition=none
            TransitionDuration=0.0
            BackgroundStartColor=0x{rgb_hex(BG_DIM)}
            BackgroundEndColor=0x{rgb_hex(BG)}
            ProgressBarBackgroundColor=0x{rgb_hex(BORDER)}
            ProgressBarForegroundColor=0x{rgb_hex(ACCENT)}
            DialogClearsFirmwareBackground=true
            MessageBelowAnimation=true
            MessageBelowAnimationDistance=10
            CursorAnimation=breath
            CursorAnimationSpeed=7

            [boot-up]
            UseEndAnimation=false

            [shutdown]
            UseEndAnimation=false
            UseFirmwareBackground=false

            [reboot]
            UseEndAnimation=false
            UseFirmwareBackground=false

            [updates]
            SuppressMessages=true
            ProgressBarShowPercentComplete=true
            UseProgressBar=true
            Title=Installing Updates...
            SubTitle=Do not turn off your computer

            [system-upgrade]
            SuppressMessages=false
            ProgressBarShowPercentComplete=false
            UseProgressBar=true

            [firmware-upgrade]
            SuppressMessages=true
            ProgressBarShowPercentComplete=true
            UseProgressBar=true
            Title=Upgrading Firmware...
            SubTitle=Do not turn off your computer
            """
        )
    )


def install_icons() -> None:
    pop_root = HOME / ".local/share/icons/Pop"
    pop_sizes = (
        "16x16",
        "24x24",
        "32x32",
        "48x48",
        "64x64",
        "128x128",
        "256x256",
    )

    for size in pop_sizes:
        for name in ("pop-os-logo-icon.svg", "distributor-logo-pop-os.svg"):
            write_svg(pop_root / size / "places" / name)

    # Greeter/login screen reads pop-os-branding, not Pop/places.
    branding_root = HOME / ".local/share/icons/pop-os-branding"
    branding_sizes = ("16", "22", "24", "32", "48", "64")
    for size in branding_sizes:
        round_dir = branding_root / "round-logos" / size
        write_svg(round_dir / "distributor-logo.svg")
        write_svg(round_dir / "ubuntu-logo-icon.svg")

    system_branding_theme = Path("/usr/share/icons/pop-os-branding/index.theme")
    if system_branding_theme.is_file():
        shutil.copy2(system_branding_theme, branding_root / "index.theme")

    pop_theme = pop_root / "index.theme"
    if not pop_theme.is_file():
        pop_theme.write_text(
            textwrap.dedent(
                """\
                [Icon Theme]
                Name=Pop Local
                Comment=Local Pop icon overrides for ETF Trader Gruvbox branding
                Inherits=Pop,hicolor
                Directories=16x16/places,24x24/places,32x32/places,48x48/places,64x64/places,128x128/places,256x256/places

                [16x16/places]
                Size=16
                Type=Fixed

                [24x24/places]
                Size=24
                Type=Fixed

                [32x32/places]
                Size=32
                Type=Fixed

                [48x48/places]
                Size=48
                Type=Fixed

                [64x64/places]
                Size=64
                Type=Fixed

                [128x128/places]
                Size=128
                Type=Fixed

                [256x256/places]
                Size=256
                Type=Fixed
                """
            )
        )


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)

    header = ASSETS / "header-image.png"
    recolor_png(
        Path("/usr/share/plymouth/themes/pop-basic/header-image.png"),
        header,
    )

    plymouth_theme = HOME / ".local/share/plymouth/themes/etf-trader-gruvbox"
    write_plymouth_theme(plymouth_theme, header)
    install_icons()

    print(f"Generated plymouth theme: {plymouth_theme}")
    print(f"Installed login icons under: {HOME / '.local/share/icons/Pop'}")
    print(f"Installed greeter icons under: {HOME / '.local/share/icons/pop-os-branding'}")
    print()
    print("Login/greeter icon updates apply after logout.")
    print()
    print("To activate the boot splash (requires sudo):")
    print("  sudo cp -r \\")
    print(f"    {plymouth_theme} \\")
    print("    /usr/share/plymouth/themes/")
    print("  sudo update-alternatives --install \\")
    print("    /usr/share/plymouth/themes/default.plymouth default.plymouth \\")
    print("    /usr/share/plymouth/themes/etf-trader-gruvbox/etf-trader-gruvbox.plymouth 200")
    print("  sudo update-alternatives --set default.plymouth \\")
    print("    /usr/share/plymouth/themes/etf-trader-gruvbox/etf-trader-gruvbox.plymouth")
    print("  sudo update-initramfs -u")


if __name__ == "__main__":
    main()
