"""Genera los SVG pixel art del README (banner y separadores). Sin dependencias."""
import sys, pathlib
VERSION = pathlib.Path(__file__).resolve().parent.parent.joinpath("VERSION").read_text().strip()

F = {  # fuente 5x7
 'A':["01110","10001","10001","11111","10001","10001","10001"],'B':["11110","10001","10001","11110","10001","10001","11110"],
 'C':["01111","10000","10000","10000","10000","10000","01111"],'D':["11110","10001","10001","10001","10001","10001","11110"],
 'E':["11111","10000","10000","11110","10000","10000","11111"],'F':["11111","10000","10000","11110","10000","10000","10000"],
 'G':["01111","10000","10000","10111","10001","10001","01111"],'H':["10001","10001","10001","11111","10001","10001","10001"],
 'I':["11111","00100","00100","00100","00100","00100","11111"],'J':["00111","00010","00010","00010","00010","10010","01100"],
 'K':["10001","10010","10100","11000","10100","10010","10001"],'L':["10000","10000","10000","10000","10000","10000","11111"],
 'M':["10001","11011","10101","10101","10001","10001","10001"],'N':["10001","11001","10101","10011","10001","10001","10001"],
 'O':["01110","10001","10001","10001","10001","10001","01110"],'P':["11110","10001","10001","11110","10000","10000","10000"],
 'Q':["01110","10001","10001","10001","10101","10010","01101"],'R':["11110","10001","10001","11110","10100","10010","10001"],
 'S':["01111","10000","10000","01110","00001","00001","11110"],'T':["11111","00100","00100","00100","00100","00100","00100"],
 'U':["10001","10001","10001","10001","10001","10001","01110"],'V':["10001","10001","10001","10001","10001","01010","00100"],
 'W':["10001","10001","10001","10101","10101","10101","01010"],'X':["10001","10001","01010","00100","01010","10001","10001"],
 'Y':["10001","10001","01010","00100","00100","00100","00100"],'Z':["11111","00001","00010","00100","01000","10000","11111"],
 '0':["01110","10001","10011","10101","11001","10001","01110"],'1':["00100","01100","00100","00100","00100","00100","01110"],
 '2':["01110","10001","00001","00010","00100","01000","11111"],'3':["11110","00001","00001","01110","00001","00001","11110"],
 '.':["00000","00000","00000","00000","00000","01100","01100"],'_':["00000","00000","00000","00000","00000","00000","11111"],
 '+':["00000","00100","00100","11111","00100","00100","00000"],'-':["00000","00000","00000","11111","00000","00000","00000"],
 '/':["00001","00010","00010","00100","01000","01000","10000"],'~':["00000","00000","01000","10101","00010","00000","00000"],
 '>':["10000","01000","00100","00010","00100","01000","10000"],' ':["00000"]*7,'·':["00000","00000","00000","00100","00000","00000","00000"],
}

def text(s, x, y, px, fill, gap=1):
    out = []
    cx = x
    for ch in s.upper():
        g = F.get(ch, F[' '])
        for r, row in enumerate(g):
            for c, b in enumerate(row):
                if b == '1':
                    out.append(f'<rect x="{cx+c*px}" y="{y+r*px}" width="{px}" height="{px}" fill="{fill}"/>')
        cx += (5 + gap) * px
    return ''.join(out), cx - x

def width(s, px, gap=1):
    return len(s) * (5 + gap) * px - gap * px

# sprite 8x8 de un "agente" (cabeza de robot); 1 = color, 2 = ojo
BOT = ["00111100","01111110","11211211","11111111","11111111","01100110","01111110","00100100"]

def sprite(x, y, px, fill, eye):
    out = []
    for r, row in enumerate(BOT):
        for c, b in enumerate(row):
            if b != '0':
                out.append(f'<rect x="{x+c*px}" y="{y+r*px}" width="{px}" height="{px}" fill="{fill if b=="1" else eye}"/>')
    return ''.join(out)

def banner():
    W, H = 1200, 360
    bg, grid, ink = '#0b0f1a', '#141b2d', '#f2f4ff'
    agents = [('#d97757', 'CLAUDE'), ('#5b7cfa', 'GEMINI'), ('#10a37f', 'CODEX'), ('#c9d1ff', 'COPILOT'), ('#f2f4ff', 'CURSOR')]
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" shape-rendering="crispEdges">',
             '<style>.blink{animation:b 1.1s steps(1) infinite}@keyframes b{50%{opacity:0}}'
             '.bob{animation:o 1.6s steps(2) infinite}@keyframes o{50%{transform:translateY(-4px)}}'
             '.d1{animation-delay:.2s}.d2{animation-delay:.4s}.d3{animation-delay:.6s}.d4{animation-delay:.8s}'
             '@media (prefers-reduced-motion:reduce){.blink,.bob{animation:none}}</style>',
             f'<rect width="{W}" height="{H}" fill="{bg}"/>']
    for gx in range(0, W, 24):
        parts.append(f'<rect x="{gx}" y="0" width="1" height="{H}" fill="{grid}"/>')
    for gy in range(0, H, 24):
        parts.append(f'<rect x="0" y="{gy}" width="{W}" height="1" fill="{grid}"/>')
    # marco
    parts.append(f'<rect x="12" y="12" width="{W-24}" height="{H-24}" fill="none" stroke="#2a3557" stroke-width="4"/>')
    # título con sombra
    t = 'MULTIAGENT_KIT'; px = 9
    tx = (W - width(t, px)) // 2
    s, _ = text(t, tx + 5, 66 + 5, px, '#2a1a5e'); parts.append(s)
    s, _ = text(t, tx, 66, px, ink); parts.append(s)
    cur_x = tx + width(t, px) + 14
    parts.append(f'<rect class="blink" x="{cur_x}" y="66" width="{px*3}" height="{px*7}" fill="#ffcc4d"/>')
    sub = 'ORCA · CSR + MAW · V' + VERSION; spx = 4
    s, _ = text(sub, (W - width(sub, spx)) // 2, 160, spx, '#8a96c9'); parts.append(s)
    # fila de agentes
    n = len(agents); bpx = 6; bw = 8 * bpx; gapx = 150
    total = n * bw + (n - 1) * (gapx - bw)
    x0 = (W - total) // 2
    for i, (col, name) in enumerate(agents):
        x = x0 + i * gapx
        parts.append(f'<g class="bob d{i}">{sprite(x, 214, bpx, col, bg)}</g>')
        lpx = 2; lw = width(name, lpx)
        s, _ = text(name, x + bw // 2 - lw // 2, 280, lpx, col); parts.append(s)
    # línea de "fuente única" bajo los sprites
    parts.append(f'<rect x="{x0}" y="306" width="{total}" height="4" fill="#ffcc4d"/>')
    lab = '~/.AGENTS'; lpx = 2
    s, _ = text(lab, (W - width(lab, lpx)) // 2, 318, lpx, '#ffcc4d'); parts.append(s)
    parts.append('</svg>')
    return ''.join(parts)

def divider(label, color):
    W, H = 1200, 48; px = 3
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" shape-rendering="crispEdges">',
             f'<rect width="{W}" height="{H}" fill="#0b0f1a"/>']
    for x in range(0, W, 12):
        parts.append(f'<rect x="{x}" y="{H//2-2}" width="6" height="4" fill="#2a3557"/>')
    lw = width(label, px); lx = 24
    parts.append(f'<rect x="{lx-12}" y="{H//2-16}" width="{lw+24}" height="32" fill="#0b0f1a"/>')
    parts.append(f'<rect x="{lx-12}" y="{H//2-16}" width="6" height="32" fill="{color}"/>')
    s, _ = text(label, lx + 4, H // 2 - 10, px, color); parts.append(s)
    parts.append('</svg>')
    return ''.join(parts)

if __name__ == '__main__':
    out = sys.argv[1]
    open(f'{out}/banner.svg', 'w').write(banner())
    for name, label, color in [('d-que', '> QUE ES', '#ffcc4d'), ('d-descargar', '> DESCARGAR', '#10a37f'),
                               ('d-inicio', '> INICIO RAPIDO', '#5b7cfa'), ('d-agentes', '> AGENTES', '#d97757'),
                               ('d-skills', '> SKILLS', '#ffcc4d'), ('d-flujo', '> FLUJO', '#10a37f'),
                               ('d-dentro', '> ESTRUCTURA', '#5b7cfa'), ('d-docs', '> DOCS', '#d97757'),
                               ('d-autores', '> AUTORES', '#ff6b9d'), ('d-licencia', '> LICENCIA', '#c9d1ff')]:
        open(f'{out}/{name}.svg', 'w').write(divider(label, color))
