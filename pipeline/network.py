"""Pedestrian graph construction and per-edge greenery scoring."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import LineString
from shapely.strtree import STRtree

TO_METRIC = Transformer.from_crs("EPSG:4326", "EPSG:3765", always_xy=True)


@dataclass
class Edge:
    u: int  # OSM node id
    v: int
    coords: list[tuple[float, float]]  # lon, lat
    highway: str
    name: str


def split_ways(elements: list[dict]) -> list[Edge]:
    """Split OSM ways into edges at intersections (nodes shared by >1 way) and ends.

    Ways with missing geometry or fewer than two nodes are skipped.
    """
    ways = [
        e for e in elements
        if e.get("type") == "way" and e.get("geometry") and len(e.get("nodes", [])) >= 2
        and len(e["nodes"]) == len(e["geometry"])
    ]
    use = Counter()
    for w in ways:
        nodes = w["nodes"]
        use.update(nodes)
        # endpoints always split
        use[nodes[0]] += 1
        use[nodes[-1]] += 1

    edges: list[Edge] = []
    for w in ways:
        nodes, geom = w["nodes"], w["geometry"]
        tags = w.get("tags", {})
        start = 0
        for i in range(1, len(nodes)):
            if use[nodes[i]] > 1 or i == len(nodes) - 1:
                seg = [(g["lon"], g["lat"]) for g in geom[start:i + 1]]
                if nodes[start] != nodes[i] or len(seg) > 3:
                    edges.append(Edge(nodes[start], nodes[i], seg,
                                      tags.get("highway", ""), tags.get("name", "")))
                start = i
    return edges


def to_metric_line(coords: list[tuple[float, float]]) -> LineString:
    xs, ys = TO_METRIC.transform([c[0] for c in coords], [c[1] for c in coords])
    return LineString(list(zip(xs, ys)))


def green_scores(lines: list[LineString], green_parts: list, buffer_m: float) -> np.ndarray:
    """Share (0–1) of each line's buffer area covered by mapped vegetation.

    `green_parts` must be non-overlapping polygons in the same metric CRS
    (e.g. exploded parts of a unary union) so that intersection areas can be
    summed without double counting.
    """
    if not lines:
        return np.zeros(0)
    buffers = shapely.buffer(np.array(lines, dtype=object), buffer_m, cap_style="flat")
    if not green_parts:
        return np.zeros(len(lines))
    tree = STRtree(green_parts)
    parts = np.array(green_parts, dtype=object)
    idx_buf, idx_green = tree.query(buffers, predicate="intersects")
    inter = shapely.area(shapely.intersection(buffers[idx_buf], parts[idx_green]))
    covered = np.bincount(idx_buf, weights=inter, minlength=len(lines))
    area = shapely.area(buffers)
    with np.errstate(divide="ignore", invalid="ignore"):
        score = np.where(area > 0, covered / area, 0.0)
    return np.clip(score, 0.0, 1.0)


def largest_component(n_nodes: int, edges_uv: list[tuple[int, int]]) -> set[int]:
    """Return node indices of the largest connected component (union-find)."""
    parent = list(range(n_nodes))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for u, v in edges_uv:
        ru, rv = find(u), find(v)
        if ru != rv:
            parent[ru] = rv
    roots = Counter(find(i) for i in range(n_nodes))
    if not roots:
        return set()
    best = roots.most_common(1)[0][0]
    return {i for i in range(n_nodes) if find(i) == best}
