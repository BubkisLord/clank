# Builds public/assets/tiles/tile-flooded.jpg (a flooded version of tile-room.jpg) and flood-overlay.png
# (a translucent water layer laid over other room art when that room is flooded).
# Usage: python make-flooded-tile.py tile-room.jpg tile-flooded.jpg flood-overlay.png  (needs pillow + numpy)
import sys, numpy as np
from PIL import Image, ImageFilter, ImageDraw
src, out_tile, out_overlay = sys.argv[1:4]
rng = np.random.default_rng(7)
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255
H, W, _ = im.shape
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

def smooth_noise(scale, seed):
    r = np.random.default_rng(seed)
    small = r.random((max(2, H // scale), max(2, W // scale))).astype(np.float32)
    return np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)).astype(np.float32) / 255

n1, n2, n3 = smooth_noise(18, 1), smooth_noise(7, 2), smooth_noise(40, 3)
WL = 238  # waterline: where the back wall meets the floor

# --- above the water: cool the scene, wet the stone, add dancing caustic light near the waterline ---
top = im.copy()
lum = top.mean(2, keepdims=True)
warm = np.clip((top[..., :1] - top[..., 2:3]) * 3, 0, 1)  # torches stay warm
teal = np.array([0.55, 0.85, 0.95], np.float32)
top = top * (1 - 0.35 * (1 - warm)) + (lum * teal) * 0.35 * (1 - warm)
caus = np.abs(np.sin(xx * 0.05 + n1 * 6) * np.sin(yy * 0.07 + n3 * 8))
caus = np.clip((caus - 0.6) * 2.5, 0, 1) ** 2
near = np.clip(1 - (WL - yy) / 120, 0, 1) * (yy < WL)
top += (caus * near)[..., None] * np.array([0.25, 0.55, 0.6], np.float32) * 0.25

# --- the water: a rippled reflection of the room, fading to a glimpse of the drowned floor ---
d = np.clip(yy - WL, 0, None)
amp = 1.5 + d * 0.05
dx = amp * np.sin(yy * 0.45 + n1 * 5) * 1.2
sy = np.clip(WL - d * 1.05, 0, H - 1)
sx = np.clip(xx + dx, 0, W - 1)
refl = top[sy.astype(int), sx.astype(int)]
# stretch light vertically (torch reflections become long streaks)
ri = Image.fromarray((np.clip(refl, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(1))
ri = ri.resize((W, H // 3), Image.BILINEAR).resize((W, H), Image.BICUBIC)
refl = 0.55 * np.asarray(ri).astype(np.float32) / 255 + 0.45 * refl
deep = np.array([0.03, 0.11, 0.13], np.float32)
t = np.clip(d / (H - WL), 0, 1)[..., None]
submerged = im * np.array([0.25, 0.55, 0.6], np.float32) * 0.8 + deep
water = refl * np.array([0.8, 0.88, 0.92], np.float32) * (1.0 - 0.45 * t) + deep * (0.6 + 0.4 * t)
water = water * (1 - 0.3 * t) + submerged * 0.3 * t
# surface glints: thin bright ripple lines, brighter under the torch reflections
def glints(y0, n, seed, bright=None):
    r = np.random.default_rng(seed)
    layer = Image.new('L', (W, H), 0); g = ImageDraw.Draw(layer)
    for _ in range(n):
        y = y0 + (H - y0) * r.random() ** 1.6
        depth = (y - y0) / (H - y0)
        x = r.uniform(0, W); ln = (6 + 34 * depth) * r.uniform(0.4, 1.2)
        v = 120 + 135 * r.random()
        if bright is not None: v *= 0.25 + 2.2 * bright[int(min(y, H - 1)), int(min(x, W - 1))]
        g.line([(x - ln / 2, y), (x + ln / 2, y)], fill=int(min(255, v)), width=1 if depth < 0.5 else 2)
    return np.asarray(layer.filter(ImageFilter.GaussianBlur(0.7))).astype(np.float32) / 255
glint = glints(WL + 2, 340, 11, refl.mean(2))
water += glint[..., None] * np.array([0.65, 0.95, 1.0], np.float32) * 0.55
# caustic net seen through the water near the viewer
cnet = np.clip((np.abs(np.sin(xx * 0.06 + n2 * 10) + np.sin(yy * 0.08 + n1 * 12 + xx * 0.02)) - 1.35) * 3, 0, 1)
water += (cnet * t[..., 0] * 0.0)[..., None] * np.array([0.4, 0.8, 0.8], np.float32)

below = (yy >= WL)[..., None]
img = np.where(below, water, top)
# a bright, slightly broken waterline
edge = np.exp(-((yy - WL) ** 2) / 3) * (0.5 + 0.5 * n2)
img += edge[..., None] * np.array([0.35, 0.65, 0.7], np.float32) * 0.6
# bubbles
for _ in range(9):
    bx, by, br = rng.uniform(20, W - 20), rng.uniform(WL + 15, H - 5), rng.uniform(1.2, 3.8)
    dd = np.sqrt((xx - bx) ** 2 + (yy - by) ** 2)
    ring = np.exp(-((dd - br) ** 2) / 0.6) * 0.45 + np.exp(-((xx - bx + br * 0.4) ** 2 + (yy - by + br * 0.4) ** 2) / 0.8) * 0.6
    img += ring[..., None] * np.array([0.7, 0.95, 1.0], np.float32)
# mist hanging over the water and a cool vignette
mist = np.exp(-((yy - WL + 8) ** 2) / 500) * (0.4 + 0.6 * n3) * 0.22
img = img * (1 - mist[..., None]) + mist[..., None] * np.array([0.45, 0.7, 0.75], np.float32)
vig = np.clip(((xx / W - 0.5) ** 2 + (yy / H - 0.5) ** 2) * 1.6, 0, 1)
img *= (1 - 0.45 * vig)[..., None]
Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(out_tile, quality=88)

# --- overlay for flooded rooms that have their own art: translucent water over the lower part ---
OL = int(H * 0.6)
d = np.clip(yy - OL, 0, None)
t = np.clip(d / (H - OL), 0, 1)
a = np.where(yy >= OL, 0.55 + 0.3 * t, 0) + np.exp(-((yy - OL) ** 2) / 4) * 0.5
a += np.clip(1 - (OL - yy) / 70, 0, 1) * (yy < OL) * 0.12  # haze above the surface
col = np.zeros((H, W, 3), np.float32) + np.array([0.06, 0.24, 0.28], np.float32)
gl = glints(OL + 2, 150, 12) * 0.55
col += gl[..., None] * np.array([0.55, 0.9, 0.95], np.float32)
a = np.clip(a + gl * 0.35, 0, 0.92)
edge = np.exp(-((yy - OL) ** 2) / 3) * (0.5 + 0.5 * n2)
col += edge[..., None] * np.array([0.5, 0.85, 0.9], np.float32)
for _ in range(6):
    bx, by, br = rng.uniform(20, W - 20), rng.uniform(OL + 12, H - 5), rng.uniform(1.5, 3.5)
    dd = np.sqrt((xx - bx) ** 2 + (yy - by) ** 2)
    ring = np.exp(-((dd - br) ** 2) / 0.6)
    col += ring[..., None] * 0.8; a = np.maximum(a, ring * 0.8)
rgba = np.dstack([np.clip(col, 0, 1), np.clip(a, 0, 1)])
Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA').save(out_overlay, optimize=True)
