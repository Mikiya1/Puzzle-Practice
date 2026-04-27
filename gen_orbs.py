#!/usr/bin/env python3
"""
パズドラ本家そっくりのドロップ画像をPNG生成
各ドロップは 100x100px、背景透過
"""
import math, os
from PIL import Image, ImageDraw, ImageFilter

OUT = '/home/claude/Puzzle-Practice/orbs'
os.makedirs(OUT, exist_ok=True)
SIZE = 100
C = SIZE // 2  # 中心

def make_orb(colors, symbol_fn, filename):
    """球体ドロップを生成"""
    img = Image.new('RGBA', (SIZE, SIZE), (0,0,0,0))
    draw = ImageDraw.Draw(img)
    r = 44  # 球の半径

    # --- 外周グロー ---
    glow_col = colors['glow']
    for i in range(8, 0, -1):
        alpha = int(40 * i / 8)
        gr = r + i * 2
        draw.ellipse([C-gr, C-gr, C+gr, C+gr],
                     fill=(*glow_col, alpha))

    # --- 球体本体（ラジアルグラデーション近似：同心円で重ね塗り） ---
    for i in range(r, 0, -1):
        t = i / r  # 1=外周, 0=中心
        # 外→内：dark→mid→light
        if t > 0.5:
            tt = (t - 0.5) * 2
            col = lerp_color(colors['mid'], colors['dark'], tt)
        else:
            tt = t * 2
            col = lerp_color(colors['light'], colors['mid'], tt)
        # 上方向にオフセットしてハイライト感
        oy = int(-r * 0.08 * (1 - t))
        draw.ellipse([C-i+oy//2, C-i+oy, C+i+oy//2, C+i+oy],
                     fill=(*col, 255))

    # --- 上部ハイライト白丸 ---
    hx, hy = C - int(r*0.25), C - int(r*0.28)
    hr = int(r * 0.48)
    for i in range(hr, 0, -1):
        t = i / hr
        a = int(200 * (1-t)**0.7)
        draw.ellipse([hx-i, hy-i, hx+i, hy+i], fill=(255,255,255,a))

    # --- 下部反射 ---
    lx, ly = C + int(r*0.1), C + int(r*0.52)
    lr = int(r * 0.32)
    for i in range(lr, 0, -1):
        t = i / lr
        a = int(80 * (1-t))
        draw.ellipse([lx-i, ly-i, lx+i, ly+i], fill=(255,255,255,a))

    # --- 縁取り ---
    draw.ellipse([C-r, C-r, C+r, C+r], outline=(0,0,0,100), width=2)

    # --- シンボル描画 ---
    img2 = Image.new('RGBA', (SIZE, SIZE), (0,0,0,0))
    d2 = ImageDraw.Draw(img2)
    symbol_fn(d2, C, C, r)
    img = Image.alpha_composite(img, img2)

    img.save(f'{OUT}/{filename}.png')
    print(f'Generated {filename}.png')

def make_heart_drop(colors, filename):
    """回復ドロップ（角丸四角）"""
    img = Image.new('RGBA', (SIZE, SIZE), (0,0,0,0))
    draw = ImageDraw.Draw(img)
    r = 42
    pad = SIZE//2 - r
    x0,y0,x1,y1 = pad, pad+2, SIZE-pad, SIZE-pad-2
    rad = 12

    # グロー
    for i in range(8,0,-1):
        a = int(35*i/8)
        draw.rounded_rectangle([x0-i*2,y0-i*2,x1+i*2,y1+i*2], radius=rad+i*2, fill=(*colors['glow'],a))

    # 本体グラデーション
    h = y1-y0
    for i in range(h):
        t = i/h
        if t < 0.5:
            col = lerp_color(colors['light'], colors['mid'], t*2)
        else:
            col = lerp_color(colors['mid'], colors['dark'], (t-0.5)*2)
        draw.rounded_rectangle([x0, y0+i, x1, y0+i+1], radius=0, fill=(*col,255))

    # クリップ
    mask = Image.new('L', (SIZE,SIZE), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([x0,y0,x1,y1], radius=rad, fill=255)
    img.putalpha(mask)

    # ハイライト
    hl = Image.new('RGBA', (SIZE,SIZE),(0,0,0,0))
    hd = ImageDraw.Draw(hl)
    for i in range(int((y1-y0)*0.45),0,-1):
        t = i/((y1-y0)*0.45)
        a = int(160*t)
        hd.rounded_rectangle([x0+2,y0+2,x1-2,y0+2+i],radius=rad,fill=(255,255,255,a))
    img = Image.alpha_composite(img, hl)

    # 縁
    draw2 = ImageDraw.Draw(img)
    draw2.rounded_rectangle([x0,y0,x1,y1],radius=rad,outline=(0,0,0,80),width=2)

    # ハートシンボル
    sym = Image.new('RGBA',(SIZE,SIZE),(0,0,0,0))
    sd = ImageDraw.Draw(sym)
    hcx,hcy = C, C-2
    hs = 18
    # ハートをポリゴンで近似
    pts = heart_points(hcx, hcy, hs)
    sd.polygon(pts, fill=(255,255,255,220))
    img = Image.alpha_composite(img, sym)

    img.save(f'{OUT}/{filename}.png')
    print(f'Generated {filename}.png')

def heart_points(cx, cy, s, n=60):
    pts = []
    for i in range(n):
        t = 2*math.pi*i/n - math.pi/2
        # ハート方程式
        x = s * 16 * math.sin(t)**3 / 16
        y = -s * (13*math.cos(t) - 5*math.cos(2*t) - 2*math.cos(3*t) - math.cos(4*t)) / 16
        pts.append((cx+x, cy+y+s*0.15))
    return pts

def lerp_color(c1, c2, t):
    return tuple(int(c1[i]*(1-t)+c2[i]*t) for i in range(3))

# ---- シンボル関数 ----
def sym_fire(d, cx, cy, r):
    s = r * 0.52
    # 炎（白〜黄）
    pts = [
        (cx, cy-s*0.9),
        (cx+s*0.55, cy-s*0.1),
        (cx+s*0.35, cy+s*0.45),
        (cx, cy+s*0.35),
        (cx-s*0.35, cy+s*0.45),
        (cx-s*0.55, cy-s*0.1),
    ]
    d.polygon(pts, fill=(255,240,80,230))
    # 内炎
    ipts = [
        (cx, cy-s*0.38),
        (cx+s*0.28, cy+s*0.1),
        (cx, cy+s*0.35),
        (cx-s*0.28, cy+s*0.1),
    ]
    d.polygon(ipts, fill=(255,120,20,200))

def sym_water(d, cx, cy, r):
    s = r * 0.5
    # 水滴
    pts = [(cx, cy-s*0.9)]
    n = 40
    for i in range(n+1):
        t = math.pi * i / n
        x = cx + s*0.58*math.sin(t)
        y = cy - s*0.9 + (s*1.5)*(1-math.cos(t))/2
        pts.append((x+math.sin(t)*s*0.15, y))
    d.polygon(pts, fill=(200,240,255,220))
    # ハイライト
    d.ellipse([cx-s*0.25,cy-s*0.55,cx+s*0.1,cy-s*0.25],fill=(255,255,255,140))

def sym_wood(d, cx, cy, r):
    s = r * 0.5
    # 葉
    pts_leaf = [
        (cx, cy-s*0.85),
        (cx+s*0.85, cy-s*0.6),
        (cx+s*0.7, cy+s*0.5),
        (cx, cy+s*0.5),
        (cx-s*0.15, cy+s*0.1),
        (cx-s*0.15, cy-s*0.4),
    ]
    d.polygon(pts_leaf, fill=(200,255,180,220))
    # 葉脈
    d.line([(cx,cy-s*0.85),(cx,cy+s*0.5)], fill=(100,200,80,160), width=2)
    d.line([(cx,cy-s*0.2),(cx+s*0.55,cy-s*0.1)], fill=(100,200,80,130), width=1)
    d.line([(cx,cy+s*0.1),(cx+s*0.45,cy+s*0.2)], fill=(100,200,80,130), width=1)

def sym_light(d, cx, cy, r):
    s = r * 0.5
    # 四芒星
    pts = []
    for i in range(8):
        a = math.pi*i/4 - math.pi/4
        rr = s if i%2==0 else s*0.35
        pts.append((cx+rr*math.cos(a), cy+rr*math.sin(a)))
    d.polygon(pts, fill=(255,255,200,230))
    d.ellipse([cx-s*0.2,cy-s*0.2,cx+s*0.2,cy+s*0.2],fill=(255,255,255,200))

def sym_dark(d, cx, cy, r):
    s = r * 0.48
    # 三日月（大円 - 小円）
    d.ellipse([cx-s*0.7,cy-s*0.7,cx+s*0.7,cy+s*0.7],fill=(230,200,255,220))
    d.ellipse([cx-s*0.25,cy-s*0.8,cx+s*0.95,cy+s*0.6],fill=(0,0,0,0))  # 透過でくり抜きは無理なのでダーク色で塗りつぶし
    # 代わりに：暗い色で上書き
    d.ellipse([cx-s*0.22,cy-s*0.75,cx+s*0.9,cy+s*0.55],fill=(80,20,140,250))

def sym_skull(d, cx, cy, r, eye_col=(180,0,200)):
    s = r * 0.48
    # 頭蓋骨
    d.ellipse([cx-s*0.6,cy-s*0.65,cx+s*0.6,cy+s*0.3],fill=(255,255,255,220))
    # 顎
    d.rectangle([cx-s*0.38,cy+s*0.18,cx+s*0.38,cy+s*0.6],fill=(255,255,255,220))
    # 目（黒）
    d.ellipse([cx-s*0.42,cy-s*0.35,cx-s*0.1,cy+s*0.0],fill=(30,10,10,230))
    d.ellipse([cx+s*0.1,cy-s*0.35,cx+s*0.42,cy+s*0.0],fill=(30,10,10,230))
    # 鼻穴
    d.ellipse([cx-s*0.12,cy+s*0.05,cx+s*0.12,cy+s*0.22],fill=(30,10,10,180))
    # 歯の隙間
    d.rectangle([cx-s*0.05,cy+s*0.2,cx+s*0.05,cy+s*0.58],fill=(30,10,10,160))

def sym_x(d, cx, cy, r):
    s = r * 0.38
    lw = max(3, int(r*0.18))
    d.line([(cx-s,cy-s),(cx+s,cy+s)],fill=(255,255,255,230),width=lw)
    d.line([(cx+s,cy-s),(cx-s,cy+s)],fill=(255,255,255,230),width=lw)

def sym_bomb(d, cx, cy, r):
    s = r * 0.44
    # 黒丸本体
    d.ellipse([cx-s,cy-s*0.7,cx+s,cy+s*1.1],fill=(30,30,30,240))
    # 光沢
    d.ellipse([cx-s*0.65,cy-s*0.5,cx-s*0.08,cy-s*0.1],fill=(120,120,120,120))
    # 導火線
    pts = [(cx+s*0.55,cy-s*0.4),(cx+s*0.85,cy-s*0.9),(cx+s*0.4,cy-s*1.1),(cx+s*0.15,cy-s*0.82)]
    d.line(pts,fill=(180,130,30,220),width=max(2,int(s*0.14)))
    # 火花
    d.ellipse([cx+s*0.07,cy-s*0.9,cx+s*0.27,cy-s*0.7],fill=(255,200,20,230))

# =====================
# 各ドロップ生成
# =====================
orbs = [
    ('fire',    {'light':(255,150,80),'mid':(220,40,0),'dark':(100,10,0),'glow':(255,80,20)}, sym_fire, False),
    ('water',   {'light':(150,220,255),'mid':(20,100,230),'dark':(0,30,130),'glow':(30,140,255)}, sym_water, False),
    ('wood',    {'light':(150,240,120),'mid':(30,160,40),'dark':(0,70,10),'glow':(50,200,60)}, sym_wood, False),
    ('light',   {'light':(255,250,170),'mid':(220,175,0),'dark':(110,80,0),'glow':(255,210,20)}, sym_light, False),
    ('dark',    {'light':(200,130,255),'mid':(110,20,200),'dark':(50,0,110),'glow':(150,30,255)}, sym_dark, False),
    ('heal',    {'light':(255,180,210),'mid':(230,60,130),'dark':(110,0,50),'glow':(255,60,140)}, None, True),
    ('poison',  {'light':(210,240,80),'mid':(100,160,0),'dark':(40,70,0),'glow':(140,210,0)}, lambda d,cx,cy,r: sym_skull(d,cx,cy,r,(80,140,0)), False),
    ('mpoison', {'light':(240,160,255),'mid':(170,0,220),'dark':(80,0,110),'glow':(200,20,255)}, lambda d,cx,cy,r: sym_skull(d,cx,cy,r,(140,0,180)), False),
    ('jammer',  {'light':(180,180,210),'mid':(100,100,160),'dark':(40,40,90),'glow':(140,140,200)}, sym_x, False),
    ('bomb',    {'light':(255,200,130),'mid':(200,100,0),'dark':(90,40,0),'glow':(240,130,10)}, sym_bomb, False),
]

for name, colors, sym_fn, is_heart in orbs:
    if is_heart:
        make_heart_drop(colors, name)
    else:
        make_orb(colors, sym_fn, name)

print('All done!')
