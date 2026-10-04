"""Build venus/data/ishtar-magellan.png from NASA's Magellan global topography.

Source (public domain, NASA/JPL/USGS):
  https://planetarymaps.usgs.gov/mosaic/Venus_Magellan_Topography_Global_4641m_v02.tif
  8192 x 4096, simple cylindrical, 4641 m/pixel, int16 metres above a 6051 km sphere.

The tile is reprojected to an azimuthal-equidistant plane centred on the standpoint's
region (southern edge of Lakshmi Planum, Ishtar Terra), 4 km per pixel, 320 x 320
(1280 km square). Elevation + 4000 m is stored as a 16-bit number: high byte in red,
low byte in green. Gaps in the Magellan data are filled from their neighbours.

Usage: python make_magellan_tile.py <Venus_Magellan_Topography_Global_4641m_v02.tif> <out.png>
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

R = 6051.0          # km, the dataset's reference sphere
LAT0, LON0 = 61.75, -5.25   # tile centre (degrees)
N, KMPP = 320, 4.0

src, out = sys.argv[1], sys.argv[2]
a = np.fromfile(src, dtype='<i2', offset=33415, count=8192 * 4096).reshape(4096, 8192).astype(np.float32)
gap = a < -30000
# fill gaps with the nearest valid value, then smooth the seams lightly
idx = ndimage.distance_transform_edt(gap, return_distances=False, return_indices=True)
a = a[tuple(idx)]

xs = (np.arange(N) - N / 2 + 0.5) * KMPP
X, Z = np.meshgrid(xs, xs)            # x east, z south (km)
rho = np.hypot(X, Z) / R
az = np.arctan2(X, -Z)                 # bearing from north
la0, lo0 = np.radians(LAT0), np.radians(LON0)
lat = np.arcsin(np.cos(rho) * np.sin(la0) + np.sin(rho) * np.cos(la0) * np.cos(az))
lon = lo0 + np.arctan2(np.sin(az) * np.sin(rho) * np.cos(la0), np.cos(rho) - np.sin(la0) * np.sin(lat))
lat, lon = np.degrees(lat), (np.degrees(lon) + 180) % 360 - 180
py = (90 - lat) / 180 * 4096 - 0.5
px = (lon + 180) / 360 * 8192 - 0.5
h = ndimage.map_coordinates(a, [py, px], order=3, mode='wrap')
h = ndimage.gaussian_filter(h, 0.6)
v = np.clip(np.round(h + 4000), 0, 65535).astype(np.uint16)
rgb = np.zeros((N, N, 3), np.uint8)
rgb[..., 0] = v >> 8
rgb[..., 1] = v & 255
Image.fromarray(rgb).save(out, optimize=True)
print('wrote', out, 'range', h.min(), h.max())
