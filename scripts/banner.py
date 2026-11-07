"""Genera los SVG del README: banner animado (paleta neón lima) e iconos pixel. Sin dependencias.
   python3 scripts/banner.py assets
"""
import pathlib
import sys

VERSION = pathlib.Path(__file__).resolve().parent.parent.joinpath("VERSION").read_text().strip()

# Paleta: negros, grises y escala de lima; violeta como único complementario (glitch)
BG, GRID, FRAME = '#050605', '#0e120c', '#1f2a12'
LIME, LIME_HI, LIME_MID, LIME_DK, LIME_DEEP = '#c6ff3d', '#e4ff8f', '#9be22d', '#5c8a12', '#22330a'
GREY_LT, GREY, GREY_DK = '#d6dccf', '#8b9384', '#3a4135'
VIOLET = '#b48cff'

F = {  # fuente pixel 5x7
 'A':["01110","10001","10001","11111","10001","10001","10001"],'B':["11110","10001","10001","11110","10001","10001","11110"],
 'C':["01111","10000","10000","10000","10000","10000","01111"],'D':["11110","10001","10001","10001","10001","10001","11110"],
 'E':["11111","10000","10000","11110","10000","10000","11111"],'F':["11111","10000","10000","11110","10000","10000","10000"],
 'G':["01111","10000","10000","10111","10001","10001","01111"],'H':["10001","10001","10001","11111","10001","10001","10001"],
 'I':["11111","00100","00100","00100","00100","00100","11111"],'J':["00111","00010","00010","00010","00010","10010","01100"],
 'K':["10001","10010","10100","11000","10100","10010","10001"],'L':["10000","10000","10000","10000","10000","10000","11111"],
 'M':["10001","11011","10101","10101","10001","10001","10001"],'N':["10001","11001","10101","10011","10001","10001","10001"],
 'O':["01110","10001","10001","10001","10001","10001","01110"],'P':["11110","10001","10001","11110","10000","10000","10000"],
 'R':["11110","10001","10001","11110","10100","10010","10001"],'S':["01111","10000","10000","01110","00001","00001","11110"],
 'T':["11111","00100","00100","00100","00100","00100","00100"],'U':["10001","10001","10001","10001","10001","10001","01110"],
 'V':["10001","10001","10001","10001","10001","01010","00100"],'W':["10001","10001","10001","10101","10101","10101","01010"],
 'X':["10001","10001","01010","00100","01010","10001","10001"],'Y':["10001","10001","01010","00100","00100","00100","00100"],
 '0':["01110","10001","10011","10101","11001","10001","01110"],'1':["00100","01100","00100","00100","00100","00100","01110"],
 '2':["01110","10001","00001","00010","00100","01000","11111"],'3':["11110","00001","00001","01110","00001","00001","11110"],
 '5':["11111","10000","11110","00001","00001","10001","01110"],
 '.':["00000","00000","00000","00000","00000","01100","01100"],'_':["00000","00000","00000","00000","00000","00000","11111"],
 '+':["00000","00100","00100","11111","00100","00100","00000"],'-':["00000","00000","00000","11111","00000","00000","00000"],
 '/':["00001","00010","00010","00100","01000","01000","10000"],'~':["00000","00000","01000","10101","00010","00000","00000"],
 '>':["10000","01000","00100","00010","00100","01000","10000"],' ':["00000"]*7,'·':["00000","00000","00000","00100","00000","00000","00000"],
 ':':["00000","01100","01100","00000","01100","01100","00000"],
}


def glyph(ch, x, y, px, fill, extra=''):
    g = F.get(ch.upper(), F[' '])
    return ''.join(f'<rect x="{x + c*px}" y="{y + r*px}" width="{px}" height="{px}" fill="{fill}"{extra}/>'
                   for r, row in enumerate(g) for c, b in enumerate(row) if b == '1')


def width(s, px, gap=1):
    return len(s) * (5 + gap) * px - gap * px


def text(s, x, y, px, fill, gap=1):
    return ''.join(glyph(ch, x + i * (5 + gap) * px, y, px, fill) for i, ch in enumerate(s))


def letters(s, x, y, px, fill, cls, delay0, step, gap=1):
    """Cada letra en su grupo, para animarlas una a una (efecto de tecleo)."""
    out = []
    for i, ch in enumerate(s):
        if ch == ' ':
            continue
        out.append(f'<g class="{cls}" style="animation-delay:{delay0 + i*step:.2f}s">'
                   f'{glyph(ch, x + i*(5+gap)*px, y, px, fill)}</g>')
    return ''.join(out)


BOT = ["00111100", "01111110", "11211211", "11111111", "11111111", "01100110", "01111110", "00100100"]


def sprite(x, y, px, fill, i):
    body = ''.join(f'<rect x="{x + c*px}" y="{y + r*px}" width="{px}" height="{px}" fill="{fill}"/>'
                   for r, row in enumerate(BOT) for c, b in enumerate(row) if b == '1')
    eyes = ''.join(f'<rect x="{x + c*px}" y="{y + r*px}" width="{px}" height="{px}" fill="{BG}"/>'
                   for r, row in enumerate(BOT) for c, b in enumerate(row) if b == '2')
    lid = ''.join(f'<rect class="lid" style="animation-delay:{i*0.7:.1f}s" x="{x + c*px}" y="{y + r*px}" width="{px}" height="{px}" fill="{fill}"/>'
                  for r, row in enumerate(BOT) for c, b in enumerate(row) if b == '2')
    return body + eyes + lid


def banner():
    W, H = 1200, 440
    agents = [(LIME, 'CLAUDE'), (LIME_HI, 'GEMINI'), (LIME_MID, 'CODEX'), (GREY_LT, 'COPILOT'), (GREY, 'CURSOR')]
    css = f'''
      .lt{{animation:type 12s steps(1) infinite both}}
      @keyframes type{{0%{{opacity:0}}1.5%,100%{{opacity:1}}}}
      .glow{{animation:glow 3s ease-in-out infinite}}
      @keyframes glow{{0%,100%{{opacity:.35}}50%{{opacity:.75}}}}
      .glitch{{animation:glitch 12s steps(1) infinite;opacity:0}}
      @keyframes glitch{{0%,33%{{opacity:0;transform:none}}33.5%{{opacity:.85;transform:translate(-6px,2px)}}34.2%{{opacity:.85;transform:translate(5px,-3px)}}35%{{opacity:0}}
        71%{{opacity:0}}71.4%{{opacity:.8;transform:translate(7px,1px)}}72%{{opacity:0}}100%{{opacity:0}}}}
      .shake{{animation:shake 12s steps(1) infinite}}
      @keyframes shake{{0%,33%,35%,71%,72%,100%{{transform:none}}33.5%{{transform:translate(2px,0)}}71.4%{{transform:translate(-2px,0)}}}}
      .scan{{animation:scan 6s linear infinite}}
      @keyframes scan{{0%{{transform:translateY(-60px)}}100%{{transform:translateY({H}px)}}}}
      .tw{{animation:tw 4s ease-in-out infinite}}
      @keyframes tw{{0%,100%{{opacity:.15}}50%{{opacity:.9}}}}
      .bob{{animation:bob 1.4s steps(2) infinite}}
      @keyframes bob{{50%{{transform:translateY(-5px)}}}}
      .lid{{animation:lid 5s steps(1) infinite;opacity:0}}
      @keyframes lid{{0%,92%{{opacity:0}}93%,96%{{opacity:1}}97%,100%{{opacity:0}}}}
      .core{{animation:core 1.5s ease-in-out infinite}}
      @keyframes core{{0%,100%{{opacity:.25}}50%{{opacity:.9}}}}
      .pb{{animation:pb 12s steps(1) infinite both}}
      @keyframes pb{{0%{{opacity:0}}1%,100%{{opacity:1}}}}
      .ok{{animation:ok 12s steps(1) infinite both}}
      @keyframes ok{{0%,62%{{opacity:0}}63%,70%{{opacity:1}}71%{{opacity:0}}72%,100%{{opacity:1}}}}
      .cur{{animation:cur 1s steps(1) infinite}}
      @keyframes cur{{50%{{opacity:0}}}}
      .wire{{stroke-dasharray:4 6;animation:wire 1.2s linear infinite}}
      @keyframes wire{{to{{stroke-dashoffset:-20}}}}
      @media (prefers-reduced-motion:reduce){{*{{animation:none!important}}.glitch,.lid{{opacity:0}}animateMotion{{display:none}}}}
    '''
    p = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" shape-rendering="crispEdges">',
         f'<title>Orca Multiagent Kit v{VERSION}</title><style>{css}</style>',
         '<defs>',
         f'<pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="{BG}"/><rect width="1" height="24" fill="{GRID}"/><rect width="24" height="1" fill="{GRID}"/></pattern>',
         '<pattern id="lines" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="2" fill="#000" opacity=".35"/></pattern>',
         f'<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{LIME}" stop-opacity="0"/><stop offset=".85" stop-color="{LIME}" stop-opacity=".10"/><stop offset="1" stop-color="{LIME}" stop-opacity="0"/></linearGradient>',
         '<filter id="blur" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>',
         '</defs>',
         f'<rect width="{W}" height="{H}" fill="url(#grid)"/>']

    # estrellas
    import random
    rnd = random.Random(7)
    for _ in range(46):
        x, y = rnd.randrange(30, W - 30), rnd.randrange(30, H - 60)
        s = rnd.choice([2, 2, 3])
        p.append(f'<rect class="tw" style="animation-delay:{rnd.uniform(0, 4):.2f}s" x="{x}" y="{y}" width="{s}" height="{s}" fill="{rnd.choice([LIME, LIME_DK, GREY])}"/>')

    p.append(f'<rect x="10" y="10" width="{W-20}" height="{H-20}" fill="none" stroke="{FRAME}" stroke-width="4"/>')
    # esquinas
    for cx, cy in [(10, 10), (W - 26, 10), (10, H - 26), (W - 26, H - 26)]:
        p.append(f'<rect x="{cx}" y="{cy}" width="16" height="16" fill="{LIME}"/>')

    # barra superior: comando tecleado + versión
    cmd = '> NPX ORCA-MULTIAGENT-KIT INSTALL'
    p.append(letters(cmd, 44, 34, 2, LIME_MID, 'lt', 0.0, 0.035))
    cx_end = 44 + width(cmd, 2) + 8
    p.append(f'<rect class="cur" x="{cx_end}" y="34" width="8" height="14" fill="{LIME}"/>')
    v = 'V' + VERSION
    p.append(text(v, W - 44 - width(v, 2), 34, 2, GREY))

    # título con brillo, glitch y tecleo
    t, px = 'MULTIAGENT_KIT', 9
    tx, ty = (W - width(t, px)) // 2, 80
    p.append(f'<g class="glow" filter="url(#blur)">{text(t, tx, ty, px, LIME)}</g>')
    p.append(f'<g class="glitch">{text(t, tx, ty, px, VIOLET)}</g>')
    p.append(f'<g class="shake">{text(t, tx + 4, ty + 4, px, LIME_DEEP)}{letters(t, tx, ty, px, LIME, "lt", 1.3, 0.07)}</g>')

    sub = 'ORCA · CSR + MAW · UNA FUENTE PARA TODOS TUS AGENTES'
    p.append(letters(sub, (W - width(sub, 3)) // 2, 166, 3, GREY_LT, 'lt', 2.5, 0.02))

    # agentes, cables y núcleo ~/.agents
    n, bpx, gapx = len(agents), 6, 170
    bw = 8 * bpx
    total = (n - 1) * gapx + bw
    x0 = (W - total) // 2
    bus_y, core_y = 334, 350
    centers = []
    for i, (col, name) in enumerate(agents):
        x = x0 + i * gapx
        c = x + bw // 2
        centers.append((c, col))
        p.append(f'<g class="bob" style="animation-delay:{i*0.18:.2f}s">{sprite(x, 216, bpx, col, i)}</g>')
        lpx = 2
        p.append(text(name, c - width(name, lpx) // 2, 276, lpx, col))
        p.append(f'<path class="wire" d="M{c} 296 V{bus_y} H{W//2}" fill="none" stroke="{LIME_DK}" stroke-width="2"/>')
    p.append(f'<path d="M{W//2} {bus_y} V{core_y}" fill="none" stroke="{LIME_DK}" stroke-width="2"/>')

    core = '~/.AGENTS'; cpx = 3
    cw = width(core, cpx) + 40
    cxl = W // 2 - cw // 2
    p.append(f'<rect class="core" x="{cxl-6}" y="{core_y-6}" width="{cw+12}" height="{7*cpx+32}" fill="{LIME}" filter="url(#blur)"/>')
    p.append(f'<rect x="{cxl}" y="{core_y}" width="{cw}" height="{7*cpx+20}" fill="{BG}" stroke="{LIME}" stroke-width="3"/>')
    p.append(text(core, W // 2 - width(core, cpx) // 2, core_y + 10, cpx, LIME))

    # paquetes de datos que viajan de cada agente al núcleo
    for i, (c, col) in enumerate(centers):
        path = f'M{c} 296 V{bus_y} H{W//2} V{core_y}'
        for k in range(2):
            begin = i * 0.45 + k * 1.6
            p.append(f'<rect x="-4" y="-4" width="8" height="8" fill="{col}">'
                     f'<animateMotion dur="3.2s" repeatCount="indefinite" begin="{begin:.2f}s" path="{path}"/></rect>')

    # barra de progreso + SYNC OK
    blocks, bx, by = 40, 44, H - 46
    for i in range(blocks):
        x = bx + i * 14
        p.append(f'<rect x="{x}" y="{by}" width="10" height="12" fill="{GREY_DK}"/>')
        p.append(f'<rect class="pb" style="animation-delay:{3.2 + i*0.1:.2f}s" x="{x}" y="{by}" width="10" height="12" fill="{LIME}"/>')
    ok = 'SYNC OK · 5 AGENTES'
    p.append(f'<g class="ok">{text(ok, W - 44 - width(ok, 2), by - 1, 2, LIME)}</g>')

    # scanlines y haz de barrido
    p.append(f'<rect width="{W}" height="{H}" fill="url(#lines)" opacity=".45" pointer-events="none"/>')
    p.append(f'<rect class="scan" x="0" y="0" width="{W}" height="60" fill="url(#beam)"/>')
    p.append('</svg>')
    return ''.join(p)


# Iconos pixel 12x12 (1 = lima, 2 = lima oscuro)
ICONS = {
 'about':    ["000111100000","001111110000","011100111000","011100111000","000001110000","000011100000","000011100000","000000000000","000011100000","000011100000","000000000000","000000000000"],
 'download': ["000011000000","000011000000","000011000000","000011000000","011011011000","001111110000","000111100000","000011000000","000000000000","110000000110","111111111110","000000000000"],
 'terminal': ["111111111111","100000000001","101000000001","100100000001","100010000001","100100000001","101000111101","100000000001","100000000001","111111111111","000000000000","000000000000"],
 'agents':   ["000111100000","001111110000","011211211000","011111111000","001111110000","000100100000","000000000000","011000001100","111100011110","111100011110","011000001100","000000000000"],
 'skills':   ["000000001100","000000011110","000000111100","000001111000","000011110000","000111100000","001221000000","012210000000","122100000000","121000000000","110000000000","000000000000"],
 'flow':     ["111100000000","100100000000","111100000000","000110000000","000011111111","000110000001","111100000001","100100000001","111100001111","000000001001","000000001111","000000000000"],
 'folder':   ["111100000000","100010000000","100001111110","100000000010","111111111110","100000000010","100000000010","100000000010","100000000010","111111111110","000000000000","000000000000"],
 'docs':     ["011111110000","010000011000","010000010100","010111011110","010000000010","010111110010","010000000010","010111110010","010000000010","011111111110","000000000000","000000000000"],
 'merge':    ["011000000000","011000000110","011000000110","011000001100","011000011000","011111110000","011000000000","011000000000","011000000000","011000000000","000000000000","000000000000"],
 'authors':  ["000110000000","001111000110","001111001111","000110001111","000000000110","011111100000","111111110000","111111110110","000000001111","000000011111","000000011111","000000000000"],
 'license':  ["000011000000","011111111000","010011001000","010011001000","111011011100","111011011100","000011000000","000011000000","000011000000","001111110000","000000000000","000000000000"],
 'cli':      ["111111111111","100000000001","101111111001","100000000001","101111000001","100000000001","101111111101","100000000001","111111111111","000011100000","001111111000","000000000000"],
}


def icon(name):
    m, px = ICONS[name], 2
    rects = ''.join(f'<rect x="{c*px}" y="{r*px}" width="{px}" height="{px}" fill="{LIME if b == "1" else LIME_DK}"/>'
                    for r, row in enumerate(m) for c, b in enumerate(row) if b != '0')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" shape-rendering="crispEdges">'
            f'<title>{name}</title>{rects}</svg>')


if __name__ == '__main__':
    out = pathlib.Path(sys.argv[1])
    (out / 'icons').mkdir(parents=True, exist_ok=True)
    (out / 'banner.svg').write_text(banner())
    for name in ICONS:
        (out / 'icons' / f'{name}.svg').write_text(icon(name))
