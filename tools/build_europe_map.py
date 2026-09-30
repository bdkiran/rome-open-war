"""
Builds src/map/europe/europeTerrain.ts: the terrain of the Roman world on a
hex grid.

Coastlines come from Natural Earth's 1:50m land polygons (public domain).
Mountains, deserts, forests and hills are drawn from the rough outlines below,
so they can be tuned by hand.

Usage (from the project root):
    pip install shapely
    curl -L -o tools/ne_50m_land.geojson \
      https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
    python3 tools/build_europe_map.py

The grid layout and projection here must match src/map/europe/europeMapEngine.ts.
"""
import json
import math
import os
import random
import sys

from shapely.geometry import Point, shape
from shapely.prepared import prep

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "ne_50m_land.geojson")
OUT = os.path.join(HERE, "..", "src", "map", "europe", "europeTerrain.ts")

# ---- Grid and projection --------------------------------------------------

WIDTH, HEIGHT = 79, 70                   # hexes per row, rows
LON_MIN, LON_MAX = -10.5, 41.0
LAT_MIN, LAT_MAX = 29.0, 57.5
SQRT3 = math.sqrt(3)
MID_COS = math.cos(math.radians((LAT_MIN + LAT_MAX) / 2))

def hex_center(col, row):
    """Pointy-top hex center in hex units, same as HexTopology with size 1."""
    q = col - row // 2
    return SQRT3 * (q + row / 2), 1.5 * row

X_MAX = SQRT3 * (WIDTH - 0.5)
Y_MAX = 1.5 * (HEIGHT - 1)

def to_lonlat(x, y):
    return (LON_MIN + x / X_MAX * (LON_MAX - LON_MIN),
            LAT_MAX - y / Y_MAX * (LAT_MAX - LAT_MIN))

# ---- Hand-drawn features --------------------------------------------------
# Ranges are polylines of (lon, lat) with a width in degrees of latitude.
# Within half the width: mountains. Within a further HILL_FRINGE: hills.

MOUNTAINS = {
    "Alps":        ([(5.8, 43.9), (6.6, 45.0), (7.0, 45.9), (8.0, 46.3), (9.5, 46.5), (11.0, 46.8), (12.5, 47.0), (14.0, 47.2), (15.5, 47.4)], 1.12),
    "Pyrenees":    ([(-1.8, 43.1), (0.0, 42.8), (1.5, 42.6), (2.8, 42.5)], 0.68),
    "Apennines":   ([(8.6, 44.4), (10.0, 44.2), (11.5, 43.8), (12.8, 43.0), (13.5, 42.3), (14.5, 41.5), (15.4, 40.6), (16.0, 39.7), (16.2, 38.8)], 0.52),
    "Carpathians": ([(17.5, 49.0), (19.5, 49.4), (21.5, 49.2), (23.5, 48.3), (25.0, 47.6), (25.8, 46.5), (25.5, 45.6), (24.0, 45.5), (22.5, 45.3)], 0.83),
    "Dinarides":   ([(14.5, 45.6), (16.0, 44.5), (17.5, 43.5), (19.0, 42.8), (20.2, 42.0), (21.0, 40.8), (21.3, 39.8), (21.8, 38.8)], 0.75),
    "Haemus":      ([(22.4, 43.6), (24.0, 42.8), (26.0, 42.7), (27.5, 42.7)], 0.52),
    "Rhodope":     ([(23.5, 41.8), (25.0, 41.5)], 0.52),
    "Taurus":      ([(29.5, 37.0), (31.5, 37.2), (33.0, 37.0), (34.5, 37.4), (36.0, 37.8), (38.0, 38.3), (40.5, 38.6)], 0.75),
    "Pontic":      ([(33.0, 41.0), (35.5, 40.8), (37.5, 40.6), (40.5, 40.6)], 0.6),
    "Caucasus":    ([(37.5, 44.6), (40.0, 43.6), (41.5, 42.8)], 0.83),
    "Atlas":       ([(-8.5, 30.9), (-6.0, 32.2), (-4.0, 33.2), (-1.0, 34.2), (2.0, 35.3), (5.0, 35.8), (8.0, 35.6)], 0.9),
    "Cantabrian":  ([(-8.0, 42.9), (-6.0, 43.0), (-4.0, 43.0)], 0.45),
    "Central":     ([(-7.0, 40.2), (-5.0, 40.4), (-3.5, 40.9)], 0.45),
    "Baetic":      ([(-5.5, 36.8), (-3.5, 37.1), (-2.0, 37.7)], 0.45),
    "Lebanon":     ([(35.8, 33.4), (36.4, 34.6)], 0.38),
    "Highlands":   ([(-5.5, 56.2), (-4.0, 57.2)], 0.68),
}
HILL_FRINGE = 0.4

# Hills-only bands and blobs.
HILLS = {
    "Massif Central": ([(2.4, 44.6), (3.2, 45.4), (3.8, 46.0)], 0.75),
    "German uplands": ([(7.0, 50.3), (9.0, 50.6), (11.0, 50.6), (13.0, 50.4)], 0.9),
    "Bohemian":       ([(12.5, 49.0), (14.5, 48.8), (16.0, 49.4)], 0.6),
    "Iberian system": ([(-3.0, 42.0), (-1.8, 41.0), (-1.0, 40.0)], 0.6),
    "Wales":          ([(-4.0, 51.8), (-3.6, 53.0)], 0.6),
    "Pennines":       ([(-2.3, 53.2), (-2.3, 54.8)], 0.38),
}

def forest_share(lon, lat):
    """Rough share of land that's forest in each region."""
    if lat < 33.8 and lon < 35:           return 0.02   # North Africa
    if lon > 34 and lat < 37:             return 0.05   # Levant
    if 5.5 < lon < 24 and 48 < lat < 56:  return 0.6    # Germania
    if lon > 28 and lat > 45.5:           return 0.1    # Sarmatian steppe
    if 15 < lon < 30 and 40 < lat < 48.5: return 0.35   # Balkans, Dacia
    if lon < 2 and lat > 50:              return 0.35   # Britannia
    if -5 < lon < 8 and 43 < lat < 51:    return 0.35   # Gaul
    if 7 < lon < 19 and 37.5 < lat < 46.5:return 0.2    # Italy
    if lon < 3.3 and 36 < lat < 44:       return 0.18   # Iberia
    if 19 < lon < 27 and lat < 40:        return 0.15   # Greece
    if 26 < lon and 36 < lat < 42:        return 0.15   # Anatolia
    return 0.3

def hill_share(lon, lat):
    """Rough share of land that's hills, on top of the ranges above."""
    if lat < 33.8 and lon < 35:           return 0.12
    if lon > 34 and lat < 37:             return 0.3
    if lon > 28 and lat > 45.5:           return 0.03
    if 26 < lon and 36 < lat < 42:        return 0.3
    if 19 < lon < 27 and lat < 40:        return 0.35
    if 15 < lon < 30 and 40 < lat < 48.5: return 0.3
    if lon < 3.3 and 36 < lat < 44:       return 0.25
    if lon < -2.5 and lat > 50:           return 0.35
    if 7 < lon < 19 and 37.5 < lat < 46.5:return 0.15
    return 0.1

def is_desert_region(lon, lat):
    if 30.2 < lon < 32.2 and lat < 31.6:  return False   # the Nile valley and delta
    if lat < 33.6 and -9 < lon < 34.5:    return True    # Sahara, Libya, Sinai
    if lon > 37.3 and lat < 35.5:         return True    # Syrian desert
    return False

# ---- Geometry helpers -----------------------------------------------------

def dist_to_polyline(lon, lat, points):
    """Distance in degrees of latitude, with longitude scaled by cos(latitude)."""
    best = float("inf")
    px, py = lon * MID_COS, lat
    for (ax, ay), (bx, by) in zip(points, points[1:]):
        ax, bx = ax * MID_COS, bx * MID_COS
        dx, dy = bx - ax, by - ay
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy or 1)))
        best = min(best, math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
    return best

def neighbors(col, row):
    q, r = col - row // 2, row
    for dq, dr in ((1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)):
        nq, nr = q + dq, r + dr
        nc = nq + nr // 2
        if 0 <= nr < HEIGHT and 0 <= nc < WIDTH:
            yield nc, nr

def smooth_rank(rng, passes):
    """Blobby noise over the grid, as percentiles 0..1."""
    field = {(c, r): rng.random() for r in range(HEIGHT) for c in range(WIDTH)}
    for _ in range(passes):
        nxt = {}
        for key, v in field.items():
            ns = list(neighbors(*key))
            nxt[key] = (v + sum(field[n] for n in ns)) / (len(ns) + 1)
        field = nxt
    ordered = sorted(field, key=field.get)
    return {k: i / (len(ordered) - 1) for i, k in enumerate(ordered)}

# ---- Widening narrow land ---------------------------------------------------

# The six neighbors of a hex, in order around it (so consecutive ones touch).
RING = ((1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1))

def ring(col, row):
    """The six neighbor positions in order around the hex (None where off the map)."""
    q, r = col - row // 2, row
    out = []
    for dq, dr in RING:
        nq, nr = q + dq, r + dr
        nc = nq + nr // 2
        out.append((nc, nr) if 0 <= nr < HEIGHT and 0 <= nc < WIDTH else None)
    return out

def is_bridge(is_land, col, row):
    """
    A land hex that's the only link between two stretches of land: going
    around it, land and water alternate more than once. Armies funnel through
    these one-hex corridors, so they're widened.
    """
    around = [pos is not None and is_land[pos] for pos in ring(col, row)]
    if sum(around) < 2:
        return False
    arcs = sum(1 for i in range(6) if around[i] and not around[i - 1])
    return arcs >= 2

def widen_narrow_land(is_land, max_passes=8):
    """
    Turns water next to one-hex land corridors into land until none are left,
    so no strip of land is a single hex wide. Only water that already hugs
    the coast (two or more land neighbors) is filled, so no spurs are grown
    into open sea.
    """
    for _ in range(max_passes):
        bridges = [key for key, land in is_land.items() if land and is_bridge(is_land, *key)]
        if not bridges:
            return
        fill = set()
        for col, row in bridges:
            for pos in ring(col, row):
                if pos is None or is_land[pos]:
                    continue
                land_near = sum(1 for n in ring(*pos) if n is not None and is_land[n])
                if land_near >= 2:
                    fill.add(pos)
        if not fill:
            return
        for pos in fill:
            is_land[pos] = True
        print(f"widened {len(bridges)} narrow spots by filling {len(fill)} coastal hexes")

# ---- Keeping islands apart -------------------------------------------------

# Islands that must stay separate from the mainland beside them, found by a
# point inside each: at this scale their narrow straits would otherwise close.
# Sea crossings in europeMapEngine.ts let armies cross them.
ISLANDS = {
    "Sicily": (14.0, 37.5),     # the Strait of Messina
}

def separate_islands(is_land, features):
    """
    For each island in ISLANDS, finds the hexes that are really that island
    (their center inside its coastline) and turns any other land hex touching
    them into sea, reopening the strait.
    """
    for name, point in ISLANDS.items():
        island = next((prep(shape(ft["geometry"]).buffer(0)) for ft in features
                       if shape(ft["geometry"]).buffer(0).contains(Point(*point))), None)
        if island is None:
            print(f"couldn't find {name}")
            continue
        # Pick the part of a multi-part geometry that holds the point.
        geom = next(shape(ft["geometry"]).buffer(0) for ft in features if shape(ft["geometry"]).buffer(0).contains(Point(*point)))
        if geom.geom_type == "MultiPolygon":
            geom = next(g for g in geom.geoms if g.contains(Point(*point)))
        island = prep(geom)
        on_island = {key for key, land in is_land.items()
                     if land and island.contains(Point(*to_lonlat(*hex_center(*key))))}
        carved = set()
        for key in on_island:
            for n in neighbors(*key):
                if n in is_land and is_land[n] and n not in on_island:
                    carved.add(n)
        for key in carved:
            is_land[key] = False
        print(f"{name}: {len(on_island)} hexes, cut off from the mainland by {len(carved)} hexes of sea")

# ---- Build ----------------------------------------------------------------

def main():
    if not os.path.exists(SOURCE):
        sys.exit(f"Missing {SOURCE}. See the usage notes at the top of this file.")
    with open(SOURCE) as f:
        features = json.load(f)["features"]
    land = prep(shape({"type": "GeometryCollection", "geometries": [ft["geometry"] for ft in features]}).buffer(0))

    # A hex is land if enough of it is: sample its center and six points around it.
    # Three of seven keeps narrow peninsulas like Italy and Greece recognizable.
    is_land = {}
    for row in range(HEIGHT):
        for col in range(WIDTH):
            x, y = hex_center(col, row)
            samples = [(x, y)] + [(x + 0.55 * math.cos(a), y + 0.55 * math.sin(a))
                                  for a in (math.pi / 3 * i + math.pi / 6 for i in range(6))]
            hits = sum(land.contains(Point(*to_lonlat(sx, sy))) for sx, sy in samples)
            is_land[(col, row)] = hits >= 3

    widen_narrow_land(is_land)
    separate_islands(is_land, features)

    rng = random.Random(218)                 # 218 BC
    forest_noise = smooth_rank(rng, 3)
    hill_noise = smooth_rank(rng, 2)

    rows = []
    counts = {}
    for row in range(HEIGHT):
        line = []
        for col in range(WIDTH):
            key = (col, row)
            if not is_land[key]:
                ch = "~"
            else:
                lon, lat = to_lonlat(*hex_center(col, row))
                coastal = any(not is_land[n] for n in neighbors(col, row))
                mountain_d = min(dist_to_polyline(lon, lat, pts) - w / 2 for pts, w in MOUNTAINS.values())
                hill_d = min(dist_to_polyline(lon, lat, pts) - w / 2 for pts, w in HILLS.values())
                if mountain_d <= 0:
                    ch = "^"
                elif mountain_d <= HILL_FRINGE or hill_d <= 0:
                    ch = "n"
                elif is_desert_region(lon, lat) and not coastal:
                    ch = "d"
                elif forest_noise[key] < forest_share(lon, lat):
                    ch = "f"
                elif hill_noise[key] < hill_share(lon, lat):
                    ch = "n"
                else:
                    ch = "."
            counts[ch] = counts.get(ch, 0) + 1
            line.append(ch)
        rows.append("".join(line))

    with open(OUT, "w") as f:
        f.write("// Generated by tools/build_europe_map.py. Edit that script, not this file.\n")
        f.write("// Coastlines: Natural Earth 1:50m land (public domain).\n")
        f.write("// ~ sea  . plains  f forest  n hills  ^ mountains  d desert\n\n")
        f.write("export const EUROPE_GRID = {\n")
        f.write(f"  width: {WIDTH},\n  height: {HEIGHT},\n")
        f.write(f"  lonMin: {LON_MIN},\n  lonMax: {LON_MAX},\n  latMin: {LAT_MIN},\n  latMax: {LAT_MAX},\n")
        f.write("  rows: [\n")
        for line in rows:
            f.write(f'    "{line}",\n')
        f.write("  ],\n} as const;\n")

    total = WIDTH * HEIGHT
    print(f"{total} tiles:", ", ".join(f"{k} {v} ({v * 100 // total}%)" for k, v in sorted(counts.items())))
    for line in rows:
        print(line)

if __name__ == "__main__":
    main()
