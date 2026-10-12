#!/usr/bin/env python3
"""Draws the README's figures into docs/assets/*.svg, in one blueprint skin.

Static SVG read by GitHub through <img>: system fonts only, its own dark background so it
reads the same on the light and the dark theme. The progress figure is counted from
References/scripts/run_all.manifest.json, so it is redrawn, never edited by hand.

usage: python tools/readme_assets.py
"""
from __future__ import annotations

import html
import json
import os
import re

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "docs", "assets")

SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif"
MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace"

PAPER = "#0c1117"
PAPER2 = "#131a22"
INK = "#c5d0de"
MUTED = "#8593a6"
SLATE = "#7f8ea8"
BLUE = "#6ca4f8"
ORANGE = "#e8954a"

STYLE = f"""
.name{{font:600 15px {SANS};fill:{INK}}} .sub{{font:500 10px {MONO};fill:{MUTED};letter-spacing:.08em}}
.eyebrow{{font:500 10px {MONO};fill:{SLATE};letter-spacing:.14em}}
.title{{font:600 13px {SANS};fill:{INK}}} .small{{font:400 11px {MONO};fill:{MUTED}}}
.sub.focal{{fill:{ORANGE}}}
"""


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def sheet(slug: str, title: str, desc: str, w: int, h: int, body: list[str], eyebrow: str) -> str:
    grid = (f'<defs><pattern id="{slug}-g" width="16" height="16" patternUnits="userSpaceOnUse">'
            f'<path d="M16 0H0V16" fill="none" stroke="{SLATE}" stroke-opacity=".07" stroke-width="1"/></pattern>'
            f'<pattern id="{slug}-G" width="80" height="80" patternUnits="userSpaceOnUse">'
            f'<path d="M80 0H0V80" fill="none" stroke="{SLATE}" stroke-opacity=".13" stroke-width="1"/></pattern></defs>')
    frame = (f'<rect width="{w}" height="{h}" rx="10" fill="{PAPER}"/>'
             f'<rect width="{w}" height="{h}" rx="10" fill="url(#{slug}-g)"/>'
             f'<rect width="{w}" height="{h}" rx="10" fill="url(#{slug}-G)"/>'
             f'<rect x=".5" y=".5" width="{w - 1}" height="{h - 1}" rx="10" fill="none" stroke="{SLATE}" stroke-opacity=".35"/>'
             f'<text class="eyebrow" x="24" y="30">{esc(eyebrow)}</text>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            f'role="img" aria-labelledby="{slug}-title {slug}-desc">'
            f'<title id="{slug}-title">{esc(title)}</title><desc id="{slug}-desc">{esc(desc)}</desc>'
            f'{grid}<style>{STYLE}</style>{frame}{"".join(body)}</svg>\n')


def P(pts) -> str:
    return " ".join(f"{x:g},{y:g}" for x, y in pts)


# ------------------------------------------------------------------ exploded stack

def iso(x, y, z, ox, oy):
    return ox + x - y, oy + (x + y) / 2 - z


def slab(name, sub, rect, z, t, ox, oy, label_x, focal=False, detail=()):
    x0, y0, x1, y1 = rect
    p = lambda x, y, zz: iso(x, y, zz, ox, oy)
    zt = z + t
    top = [p(x0, y0, zt), p(x1, y0, zt), p(x1, y1, zt), p(x0, y1, zt)]
    left = [p(x0, y1, z), p(x1, y1, z), p(x1, y1, zt), p(x0, y1, zt)]
    right = [p(x1, y0, z), p(x1, y1, z), p(x1, y1, zt), p(x1, y0, zt)]
    sil = [p(x0, y0, zt), p(x1, y0, zt), p(x1, y0, z), p(x1, y1, z), p(x0, y1, z), p(x0, y1, zt)]
    tint = ORANGE if focal else INK
    path = "M" + P(sil).replace(" ", " L") + " Z"
    out = [f'<path d="{path}" fill="{PAPER2}"/>',
           f'<polygon points="{P(left)}" fill="{PAPER2}"/>',
           f'<polygon points="{P(right)}" fill="{PAPER2}"/><polygon points="{P(right)}" fill="{PAPER}" fill-opacity=".45"/>',
           f'<polygon points="{P(top)}" fill="{PAPER2}"/>'
           f'<polygon points="{P(top)}" fill="{tint}" fill-opacity="{.18 if focal else .08}"/>']
    for kind, d in detail:
        if kind == "inset":
            a, b, c, e = d
            out.append(f'<polygon points="{P([p(a, b, zt), p(c, b, zt), p(c, e, zt), p(a, e, zt)])}" fill="none" '
                       f'stroke="{tint}" stroke-opacity=".55" stroke-width=".8"/>')
        elif kind == "node":
            sx, sy = p(d[0], d[1], zt)
            out.append(f'<ellipse cx="{sx:g}" cy="{sy:g}" rx="4.2" ry="2.1" fill="{tint}" fill-opacity=".85"/>')
        elif kind == "edge":
            (a, b), (c, e) = d
            (sx, sy), (tx, ty) = p(a, b, zt), p(c, e, zt)
            out.append(f'<line x1="{sx:g}" y1="{sy:g}" x2="{tx:g}" y2="{ty:g}" stroke="{tint}" '
                       f'stroke-opacity=".5" stroke-width=".8"/>')
    out.append(f'<path d="{path}" fill="none" stroke="{tint}" stroke-opacity="{.95 if focal else .8}" stroke-width="1.2"/>')
    fx, fy = p(x1, y1, zt)
    bx, by = p(x1, y0, zt)
    out.append(f'<polyline points="{P([p(x0, y1, zt), (fx, fy), (bx, by)])}" fill="none" stroke="{INK}" '
               f'stroke-opacity=".45" stroke-width=".8"/>'
               f'<line x1="{fx:g}" y1="{fy:g}" x2="{fx:g}" y2="{fy + t:g}" stroke="{INK}" stroke-opacity=".45" stroke-width=".8"/>')
    rx_, ry_ = p(x1, y0, z + t / 2)
    lead = ORANGE if focal else MUTED
    cls = "sub focal" if focal else "sub"
    out.append(f'<circle cx="{rx_:g}" cy="{ry_:g}" r="2" fill="{lead}"/>'
               f'<line x1="{rx_ + 6:g}" y1="{ry_:g}" x2="{label_x - 12}" y2="{ry_:g}" '
               f'stroke="{lead}" stroke-opacity=".6" stroke-width=".8"/>'
               f'<text class="name" x="{label_x}" y="{ry_ - 2:g}">{esc(name)}</text>'
               f'<text class="{cls}" x="{label_x}" y="{ry_ + 13:g}">{esc(sub)}</text>')
    return "".join(out)


def stack() -> str:
    W, D, t = 240, 120, 12
    step = 136 + t
    levels = 4
    ox, oy = 330, 76 + levels * step
    label_x = ox + W + 76
    parts = [
        ("Core", "VMA · STB IMAGE · HEADLESS GPU", (0, 0, W, D), 0, False,
         [("inset", (16, 16, 112, 104)), ("inset", (128, 16, 224, 104))]),
        ("Assets", "ROMDIR · HDD DECRYPT · EXPAND", (0, 0, W, D), 1, False,
         [("inset", (16, 16, 224, 40)), ("inset", (16, 52, 224, 76)), ("inset", (16, 88, 224, 108))]),
        ("Scene", "TEMPLATED ON ARITHMETIC · EE-EXACT IN TESTS", (0, 0, W, D), 2, True,
         [("edge", ((48, 32), (120, 60))), ("edge", ((120, 60), (192, 28))), ("edge", ((120, 60), (84, 96))),
          ("edge", ((120, 60), (192, 92))), ("node", (48, 32)), ("node", (120, 60)), ("node", (192, 28)),
          ("node", (84, 96)), ("node", (192, 92))]),
        ("Render", "VULKAN 1.4 · MSAA · ANY RESOLUTION", (0, 0, W, 52), 3, False,
         [("inset", (16, 12, 224, 40))]),
        ("Audio", "EE QUEUE · IOP DRIVER · SPU2", (0, 72, W, D), 3, False,
         [("inset", (16, 84, 224, 108))]),
        ("App", "WINDOW · INPUT · BOOT CHAIN · GOLDEN", (0, 0, W, D), 4, False,
         [("inset", (24, 20, 216, 100))]),
    ]
    body = []
    for (x, y) in ((0, D), (W, 0)):
        bx, by = iso(x, y, t, ox, oy)
        tx, ty = iso(x, y, levels * step, ox, oy)
        body.append(f'<line x1="{bx:g}" y1="{by:g}" x2="{tx:g}" y2="{ty:g}" stroke="{INK}" '
                    f'stroke-opacity=".3" stroke-width=".8" stroke-dasharray="4,3"/>')
    for name, sub, rect, level, focal, detail in parts:
        body.append(slab(name, sub, rect, level * step, t, ox, oy, label_x, focal, detail))
    h = int(oy + (W + D) / 2 + 32)
    return sheet("stack", "CrystalOSD, layer by layer",
                 "An exploded view of the code: Core at the bottom, then Assets, the Scene, Render beside "
                 "Audio, and the App on top.", 1000, h, body, "SECTION B · THE CODE, PULLED APART")


# ------------------------------------------------------------------ flat figures

def box(x, y, w, h, name, sub="", focal=False) -> str:
    stroke = ORANGE if focal else INK
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{PAPER2}"/>'
           f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{stroke}" fill-opacity="{.12 if focal else .05}"/>'
           f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="none" stroke="{stroke}" '
           f'stroke-opacity="{.9 if focal else .6}" stroke-width="1.2"/>']
    ty = y + (h // 2 - 3 if sub else h // 2 + 5)
    out.append(f'<text class="title" x="{x + 14}" y="{ty}">{esc(name)}</text>')
    if sub:
        out.append(f'<text class="{"sub focal" if focal else "sub"}" x="{x + 14}" y="{ty + 17}">{esc(sub)}</text>')
    return "".join(out)


def arrow(x1, y, x2) -> str:
    return (f'<line x1="{x1}" y1="{y}" x2="{x2 - 7}" y2="{y}" stroke="{MUTED}" stroke-width="1.2"/>'
            f'<path d="M{x2} {y} L{x2 - 8} {y - 4} L{x2 - 8} {y + 4} Z" fill="{MUTED}"/>')


def workflow() -> str:
    steps = [("Read", "asm.mjs, one function", "HDD OSD 1.10U", False),
             ("Probe", "Watson, a short capture", "inputs and outputs", False),
             ("Recompute", "a verifier, bit for bit", "on both builds", True),
             ("Mutate", "change the arithmetic", "the verdict must fail", False),
             ("State", "a facts page", "cites its script", False),
             ("Port", "C++ in Source/", "golden frames equal", False)]
    longest = max(len(s) for _, a, b, _ in steps for s in (a, b))
    x0, y, gap, bh = 24, 52, 28, 92
    bw = -(-int(longest * 7.6 + 32) // 4) * 4
    body = []
    for i, (name, line1, line2, focal) in enumerate(steps):
        x = x0 + i * (bw + gap)
        if i:
            body.append(arrow(x - gap + 2, y + bh // 2, x - 2))
        stroke = ORANGE if focal else INK
        body.append(f'<rect x="{x}" y="{y}" width="{bw}" height="{bh}" rx="6" fill="{PAPER2}"/>'
                    f'<rect x="{x}" y="{y}" width="{bw}" height="{bh}" rx="6" fill="{stroke}" '
                    f'fill-opacity="{.12 if focal else .05}"/>'
                    f'<rect x="{x}" y="{y}" width="{bw}" height="{bh}" rx="6" fill="none" stroke="{stroke}" '
                    f'stroke-opacity="{.9 if focal else .6}" stroke-width="1.2"/>'
                    f'<text class="{"sub focal" if focal else "sub"}" x="{x + 16}" y="{y + 24}">{i + 1:02d}</text>'
                    f'<text class="title" x="{x + 16}" y="{y + 44}" style="font-size:15px">{esc(name)}</text>'
                    f'<text x="{x + 16}" y="{y + 64}" style="font:400 12px {SANS};fill:{MUTED}">{esc(line1)}</text>'
                    f'<text x="{x + 16}" y="{y + 80}" style="font:400 12px {SANS};fill:{MUTED}">{esc(line2)}</text>')
    w = x0 * 2 + len(steps) * bw + (len(steps) - 1) * gap
    return sheet("workflow", "How a value enters the code",
                 "A function of the PS2 OSD is read from the disassembly, probed in an instrumented emulator, "
                 "recomputed bit for bit by a verifier that a mutation must break, stated on a facts page, and "
                 "ported to C++ under the golden-frame gate.",
                 w, y + bh + 28, body, "SECTION A · ONE FUNCTION, FROM THE BINARY TO THE CODE")


def frame() -> str:
    y1, y2, bh, x0, gap = 70, 200, 60, 24, 64
    row1 = [("Host inputs", "LOCAL TIME · PAD · SETTINGS", False), ("Scene", "ONE scene::Frame", True),
            ("NativeRenderer", "VULKAN · MSAA", False), ("Window", "SDL3 SWAPCHAIN", False)]
    row2 = [("Sound commands", "SENT WHERE THE EE SENDS", False), ("EE queue", "128 ENTRIES · DEDUP", False),
            ("IOP driver", "SEQUENCER · RAMP", False), ("SPU2", "VOICES · REVERB · SDL3", False)]
    bw = 218
    body = [f'<text class="eyebrow" x="{x0}" y="{y1 - 14}">PICTURE</text>',
            f'<text class="eyebrow" x="{x0}" y="{y2 - 14}">SOUND · DRAINED ONCE PER LOGIC FRAME</text>']
    for y, row in ((y1, row1), (y2, row2)):
        for i, (name, sub, focal) in enumerate(row):
            x = x0 + i * (bw + gap)
            if i:
                body.append(arrow(x - gap + 4, y + bh // 2, x - 4))
            body.append(box(x, y, bw, bh, name, sub, focal))
    sx = x0 + bw + gap + bw // 2
    tx = x0 + bw // 2
    body.append(f'<polyline points="{sx},{y1 + bh} {sx},{y1 + bh + 22} {tx},{y1 + bh + 22} {tx},{y2 - 30}" '
                f'fill="none" stroke="{ORANGE}" stroke-opacity=".7" stroke-width="1.2" stroke-dasharray="4 3"/>'
                f'<text class="sub focal" x="{sx + 8}" y="{y1 + bh + 18}">THE SCENE QUEUES THE CONSOLE\'S SOUND COMMANDS</text>')
    w = x0 * 2 + 4 * bw + 3 * gap
    return sheet("frame", "One frame",
                 "Every 1/59.94 s the host inputs drive the scene, which builds one frame for the Vulkan "
                 "renderer and queues the console's sound commands for the emulated IOP driver and SPU2.",
                 w, y2 + bh + 28, body, "SECTION C · ONE LOGIC FRAME, 59.94 HZ")


AREAS = [
    ("Opening", ("opening",)),
    ("Clock", ("frame", "blur", "overlays", "background", "orbs", "clock", "refraction", "reflection", "placement",
               "approach", "rod", "scale", "trail", "camera", "view", "gs", "measure")),
    ("Sound", ("sound",)),
    ("Text", ("text",)),
    ("Menus", ("cubes", "transitions", "aspect", "version", "options", "exits", "first")),
    ("Cold start", ("cold", "rand")),
]


def area_of(verifier: str) -> str:
    key = re.sub(r"^(verify|model)_", "", verifier.removesuffix(".mjs")).split("_")[0].rstrip("0123456789")
    for name, keys in AREAS:
        if key in keys:
            return name
    return "Other"


def progress(cell=11, gap=3) -> str:
    with open(os.path.join(REPO, "References", "scripts", "run_all.manifest.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    groups: dict[str, list[str]] = {name: [] for name, _ in AREAS}
    for entry in manifest:
        groups.setdefault(area_of(entry["verifier"]), []).append(f'{entry["verifier"]} {entry.get("capture", "")}'.strip())
    groups = {k: v for k, v in groups.items() if v}
    left, top, rows, pitch = 200, 56, 7, cell + gap
    cols = max((len(items) + rows - 1) // rows for items in groups.values())
    width = left + cols * pitch - gap + 28
    body, y = [], top
    for name, items in groups.items():
        body.append(f'<text x="24" y="{y + 16}" style="font:600 14px {SANS};fill:{INK}">{esc(name)}</text>'
                    f'<text x="24" y="{y + 34}" class="sub">{len(items)} RUNS</text>')
        for n, it in enumerate(items):
            cx, cy = left + (n // rows) * pitch, y + (n % rows) * pitch
            body.append(f'<rect x="{cx}" y="{cy}" width="{cell}" height="{cell}" rx="2" fill="{BLUE}">'
                        f'<title>{esc(it)}</title></rect>')
        y += rows * pitch - gap + 26
    body.append(f'<text x="24" y="{y + 9}" class="sub">ONE SQUARE PER VERIFIER RUN ON A CAPTURE · '
                f'{len(manifest)} IN THE REGRESSION SUITE · EVERY ONE PASSES</text>')
    return sheet("progress", "Verified", "One square per verifier run in the regression suite, by area.",
                 width, y + cell + 24, body, "SECTION D · WHAT IS VERIFIED")


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    for name, make in (("workflow", workflow), ("stack", stack), ("frame", frame), ("progress", progress)):
        with open(os.path.join(OUT, f"{name}.svg"), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(make())
        print(f"wrote docs/assets/{name}.svg")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
