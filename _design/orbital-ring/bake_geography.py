# Bakes the land maps used by The Orbital Ring (dysonswarm.com/orbital-ring).
#
# The ring is a great circle tilted to the equator. Its first platform sits at the ring's
# northernmost point, in the Pacific off San Mateo County, so there the ring runs due east
# and its tilt (inclination) equals the platform's latitude. The maps are drawn in RING
# coordinates: ring-longitude along the ring, east from the platform, and ring-latitude north
# of it, which is what the shader's lonlat() returns. (A ring over the equator would make these
# ordinary longitude and latitude.)
#
# Source: Natural Earth 1:10m (public domain), https://github.com/nvkelso/natural-earth-vector
# Run from a folder holding ne_10m_land, ne_10m_minor_islands, ne_10m_lakes,
# ne_10m_geography_regions_polys and ne_10m_populated_places_simple (.geojson). Needs numpy and
# Pillow. Writes, for orbital-ring/data/:
#   ring-band.png     the whole ring's track, ring-latitude +-26.37 deg, ~10 km per pixel
#   pacific-coast.png 37 x 37 deg round the platform, ~4 km per pixel
#   bay-area.png      2 x 2 deg round the platform, ~220 m per pixel
# Channels: R land, G dryness (deserts and dry basins high, mountain forest low; only on land),
# B coastal shallows (a thin blur of the land), A city lights (from populated places).
# `python bake_geography.py stations` prints the ground track of the 24 stations instead.
import json, math, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

LAT0, LON0 = 37.45, -122.85      # the platform: ~25 km off Half Moon Bay, ~65 km west of San Jose
D2R = math.pi / 180

def ecef(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], -1)
U = ecef(LAT0, LON0)                                               # up at the platform
E = np.array([-math.sin(LON0 * D2R), math.cos(LON0 * D2R), 0.])    # east: along the ring
N = np.cross(U, E)                                                 # north: the ring's axis
def ring_to_geo(alpha, beta):
    a, b = np.radians(alpha), np.radians(beta)
    g = (np.cos(b) * np.sin(a))[..., None] * E + (np.cos(b) * np.cos(a))[..., None] * U + np.sin(b)[..., None] * N
    return np.degrees(np.arcsin(np.clip(g[..., 2], -1, 1))), np.degrees(np.arctan2(g[..., 1], g[..., 0]))
def geo_to_ring(lat, lon):
    g = ecef(lat, lon)
    return np.degrees(np.arctan2(g @ E, g @ U)), np.degrees(np.arcsin(np.clip(g @ N, -1, 1)))

def load(name):
    return json.load(open(name + '.geojson'))['features']
def rings(geom):
    t, c = geom['type'], geom['coordinates']
    polys = [c] if t == 'Polygon' else c if t == 'MultiPolygon' else []
    for p in polys:
        yield p[0], p[1:]

class Raster:
    """An equirectangular raster over a lon/lat box, drawn supersampled."""
    def __init__(self, lon0, lon1, lat0, lat1, deg, ss=2):
        self.box = (lon0, lon1, lat0, lat1); self.deg = deg
        self.W = int(round((lon1 - lon0) / deg)) * ss; self.H = int(round((lat1 - lat0) / deg)) * ss; self.ss = ss
    def px(self, pts):
        lon0, lon1, lat0, lat1 = self.box
        return [((x - lon0) / (lon1 - lon0) * self.W, (lat1 - y) / (lat1 - lat0) * self.H) for x, y in pts]
    def polys(self, feats, value, img=None, holes=True):
        img = img or Image.new('L', (self.W, self.H), 0)
        d = ImageDraw.Draw(img)
        lon0, lon1, lat0, lat1 = self.box
        for f in feats:
            for ext, hs in rings(f['geometry']):
                xs = [p[0] for p in ext]; ys = [p[1] for p in ext]
                if max(xs) < lon0 or min(xs) > lon1 or max(ys) < lat0 or min(ys) > lat1: continue
                d.polygon(self.px(ext), fill=value(f) if callable(value) else value)
                if holes:
                    for h in hs: d.polygon(self.px(h), fill=0)
        return img
    def array(self, img):
        a = np.asarray(img, dtype=np.float32) / 255
        if self.ss > 1: a = a.reshape(self.H // self.ss, self.ss, self.W // self.ss, self.ss).mean((1, 3))
        return a
    def sample(self, a, lat, lon):
        """Bilinear sample of a (downsampled) array at lat/lon arrays."""
        lon0, lon1, lat0, lat1 = self.box
        h, w = a.shape
        x = (lon - lon0) / (lon1 - lon0) * w - .5; y = (lat1 - lat) / (lat1 - lat0) * h - .5
        x0 = np.clip(np.floor(x).astype(int), 0, w - 2); y0 = np.clip(np.floor(y).astype(int), 0, h - 2)
        fx = np.clip(x - x0, 0, 1); fy = np.clip(y - y0, 0, 1)
        v = a[y0, x0] * (1 - fx) * (1 - fy) + a[y0, x0 + 1] * fx * (1 - fy) + a[y0 + 1, x0] * (1 - fx) * fy + a[y0 + 1, x0 + 1] * fx * fy
        inside = (lon >= lon0) & (lon <= lon1) & (lat >= lat0) & (lat <= lat1)
        return np.where(inside, v, 0)

DRY = {'Desert': 1.0, 'Basin': .75, 'Plateau': .5, 'Valley': .45, 'Plain': .32, 'Range/mtn': .12}
ORDER = ['Plain', 'Plateau', 'Basin', 'Valley', 'Desert', 'Range/mtn']   # later ones win

def land_and_dry(r):
    land = r.polys(load('ne_10m_land') + load('ne_10m_minor_islands'), 255)
    lakes = [f for f in load('ne_10m_lakes') if (f['properties'].get('scalerank') or 0) <= 8]
    r.polys(lakes, 0, img=land, holes=False)
    regions = load('ne_10m_geography_regions_polys')
    dry = Image.new('L', (r.W, r.H), int(.3 * 255))
    for cla in ORDER:
        r.polys([f for f in regions if f['properties']['FEATURECLA'] == cla], int(DRY[cla] * 255), img=dry, holes=False)
    return r.array(land), r.array(dry)

def lights(alpha0, alpha1, beta0, beta1, w, h, km_per_px):
    """City lights splatted onto the ring-coordinate grid (each town only touches its own window)."""
    out = np.zeros((h, w), np.float32)
    places = [f['properties'] for f in load('ne_10m_populated_places_simple') if f['properties']['pop_max'] >= 30000]
    dA = (alpha1 - alpha0) / w; dB = (beta1 - beta0) / h
    for p in places:
        a, b = geo_to_ring(np.array(p['latitude']), np.array(p['longitude']))
        a, b = float(a), float(b)
        pop = p['pop_max']
        sig = 1.6 + 3.2 * (pop / 1e6) ** .35          # km
        I = min(2.5, (pop / 1e6) ** .45)
        s = max(sig, km_per_px * .7)
        rad = (4 * s) / 111.2                           # degrees
        if not (alpha0 - rad < a < alpha1 + rad and beta0 - rad < b < beta1 + rad): continue
        i0 = max(0, int((a - rad - alpha0) / dA)); i1 = min(w, int((a + rad - alpha0) / dA) + 2)
        j0 = max(0, int((beta1 - (b + rad)) / dB)); j1 = min(h, int((beta1 - (b - rad)) / dB) + 2)
        if i0 >= i1 or j0 >= j1: continue
        ga = alpha0 + (np.arange(i0, i1) + .5) * dA; gb = beta1 - (np.arange(j0, j1) + .5) * dB
        GA, GB = np.meshgrid(ga, gb)
        dd = np.hypot((GA - a) * np.cos(np.radians(GB)), GB - b) * 111.2
        out[j0:j1, i0:i1] += I * np.exp(-.5 * (dd / s) ** 2) * (sig / s) ** 2
    return out

def bake(alpha0, alpha1, beta0, beta1, w, h, geo_raster, out, shallow_km=2.5):
    al = alpha0 + (np.arange(w) + .5) / w * (alpha1 - alpha0)
    be = beta1 - (np.arange(h) + .5) / h * (beta1 - beta0)
    A, B = np.meshgrid(al, be)
    lat, lon = ring_to_geo(A, B)
    land_a, dry_a = geo_raster
    R = lambda a: geo['r'].sample(a, lat, lon)
    land = R(land_a); dry = R(dry_a) * land
    kmpx = (alpha1 - alpha0) * 111.2 / w
    L8 = Image.fromarray((land * 255).astype(np.uint8))
    shal = np.asarray(L8.filter(ImageFilter.GaussianBlur(max(1.0, shallow_km / kmpx))), dtype=np.float32) / 255
    shal = np.clip(shal * 1.2, 0, 1) * .6
    dryb = np.asarray(Image.fromarray((dry * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(max(1.0, 6 / kmpx))), dtype=np.float32) / 255 * land
    city = np.clip(np.sqrt(lights(alpha0, alpha1, beta0, beta1, w, h, kmpx) * land), 0, 1)
    rgba = np.stack([land, dryb, shal, city], -1)
    # fewer distinct values per channel compress far better, and the shader can't tell
    levels = np.array([32, 16, 16, 32])
    rgba = np.round(np.clip(rgba, 0, 1) * (levels - 1)) / (levels - 1)
    Image.fromarray((rgba * 255 + .5).astype(np.uint8), 'RGBA').save(out, optimize=True)
    print(out, w, h, 'km/px %.3f' % kmpx)

def stations():
    for k in range(24):
        lat, lon = ring_to_geo(np.array(15. * k), np.array(0.))
        print(k, '%.2f %.2f' % (lat, lon))

if __name__ == '__main__':
    if 'stations' in sys.argv: stations(); sys.exit()
    geo = {}
    # the platform's surroundings, finely
    geo['r'] = Raster(-124.6, -120.9, 35.9, 39.0, .0015)
    bake(-1, 1, -1, 1, 1024, 1024, land_and_dry(geo['r']), 'bay-area.png', shallow_km=1.2)
    # the region you see from the top
    geo['r'] = Raster(-162, -82, 12, 64, .02)
    bake(-18.5, 18.5, -18.5, 18.5, 1024, 1024, land_and_dry(geo['r']), 'pacific-coast.png')
    # the whole track
    geo['r'] = Raster(-180, 180, -66, 66, .06)
    bake(-180, 180, -26.37, 26.37, 4096, 600, land_and_dry(geo['r']), 'ring-band.png', shallow_km=8)
