"""Build venus/data/venus-globe.png: Magellan global topography for the orbit view.

Source as in make_magellan_tile.py. Downsampled to 1024 x 512 (simple cylindrical,
east longitude from -180 at the left), gaps filled from neighbours, and stored as
8-bit: elevation (m above 6051 km) = value * 56 - 3000.
Usage: python make_globe.py <Venus_Magellan_Topography_Global_4641m_v02.tif> <out.png>
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
a = np.fromfile(sys.argv[1], dtype='<i2', offset=33415, count=8192 * 4096).reshape(4096, 8192).astype(np.float32)
gap = a < -30000
idx = ndimage.distance_transform_edt(gap, return_distances=False, return_indices=True)
a = a[tuple(idx)]
a = a.reshape(512, 8, 1024, 8).mean(axis=(1, 3))
v = np.clip(np.round((a + 3000) / 56), 0, 255).astype(np.uint8)
Image.fromarray(v, 'L').save(sys.argv[2], optimize=True)
print('wrote', sys.argv[2], a.min(), a.max())
