#!/usr/bin/env python3
"""Erzeugt das Archivio-Anwendungssymbol.

Das Skript schreibt eine SVG-Quelle, rastert sie mit rsvg-convert in
mehrere PNG-Größen und baut daraus eine Windows-ICO-Datei. Es werden
keine zusätzlichen Python-Pakete benötigt.

Aufruf:
    python3 scripts/generate-icon.py
"""

from __future__ import annotations

import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

SIZES = (16, 24, 32, 48, 64, 128, 256)
PNG_SIZE = 512

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4fd6b3"/>
      <stop offset="0.55" stop-color="#2fb795"/>
      <stop offset="1" stop-color="#167f68"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#bg)"/>
  <rect x="16" y="16" width="480" height="240" rx="112" fill="url(#shine)"/>
  <rect x="104" y="128" width="304" height="62" rx="20" fill="#ffffff"/>
  <rect x="132" y="208" width="248" height="184" rx="24" fill="#ffffff" fill-opacity="0.94"/>
  <rect x="198" y="252" width="116" height="22" rx="11" fill="#1a9077"/>
  <path d="M256 296v46m0 0-26-26m26 26 26-26" fill="none" stroke="#1a9077"
        stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
"""

ICO_HEADER = struct.Struct('<HHH')
ICO_ENTRY = struct.Struct('<BBBBHHII')


def rasterize(svg_path: Path, size: int, output: Path) -> None:
    subprocess.run(
        [
            'rsvg-convert',
            '--width',
            str(size),
            '--height',
            str(size),
            '--background-color',
            'transparent',
            '--output',
            str(output),
            str(svg_path),
        ],
        check=True,
    )


def build_ico(pngs: list[tuple[int, bytes]], output: Path) -> None:
    count = len(pngs)
    header = ICO_HEADER.pack(0, 1, count)
    offset = len(header) + ICO_ENTRY.size * count
    entries: list[bytes] = []
    payloads: list[bytes] = []
    for size, data in pngs:
        dimension = 0 if size >= 256 else size
        entries.append(
            ICO_ENTRY.pack(
                dimension,
                dimension,
                0,
                0,
                1,
                32,
                len(data),
                offset,
            )
        )
        payloads.append(data)
        offset += len(data)
    output.write_bytes(header + b''.join(entries) + b''.join(payloads))


def main() -> int:
    if shutil.which('rsvg-convert') is None:
        print(
            'Fehler: rsvg-convert wurde nicht gefunden. Bitte librsvg installieren.',
            file=sys.stderr,
        )
        return 1

    project = Path(__file__).resolve().parent.parent
    build_dir = project / 'build'
    build_dir.mkdir(parents=True, exist_ok=True)

    svg_path = build_dir / 'icon.svg'
    svg_path.write_text(SVG, encoding='utf-8')

    with tempfile.TemporaryDirectory(prefix='archivio-icon-') as temp:
        temp_dir = Path(temp)
        pngs: list[tuple[int, bytes]] = []
        for size in SIZES:
            png_path = temp_dir / f'icon-{size}.png'
            rasterize(svg_path, size, png_path)
            pngs.append((size, png_path.read_bytes()))

        large_png = temp_dir / f'icon-{PNG_SIZE}.png'
        rasterize(svg_path, PNG_SIZE, large_png)
        (build_dir / 'icon.png').write_bytes(large_png.read_bytes())

        build_ico(pngs, build_dir / 'icon.ico')

    print(f'Symbol erzeugt: {build_dir / "icon.ico"}')
    print(f'PNG erzeugt:    {build_dir / "icon.png"}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
