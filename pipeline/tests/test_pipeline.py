"""Tests for the spatial pipeline. Run: ../.venv/bin/python -m pytest pipeline/tests"""
from __future__ import annotations

import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pytest
from shapely.geometry import LineString, Polygon, box

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from build_all import area_by_class, check_in_zagreb  # noqa: E402
from geo_common import METRIC_CRS, WGS84, clean_geometries, read_layer  # noqa: E402
from network import green_scores, largest_component, split_ways, to_metric_line  # noqa: E402


# ---------------------------------------------------------------- CRS

def test_wgs84_to_htrs96_known_point():
    # Trg bana Jelačića must fall inside the publisher's fullExtent of the vegetation
    # service (EPSG:3765: x 443 405–479 774, y 5 052 839–5 092 210) and round-trip.
    src = gpd.GeoSeries.from_xy([15.9772], [45.8131], crs=WGS84)
    p = src.to_crs(METRIC_CRS).iloc[0]
    assert 443_405 < p.x < 479_774
    assert 5_052_839 < p.y < 5_092_210
    back = gpd.GeoSeries([p], crs=METRIC_CRS).to_crs(WGS84).iloc[0]
    assert back.x == pytest.approx(15.9772, abs=1e-8)
    assert back.y == pytest.approx(45.8131, abs=1e-8)


def test_metric_line_length_matches_geodesic():
    # ~1 km north–south line in Zagreb
    line = to_metric_line([(15.97, 45.80), (15.97, 45.80 + 1000 / 111_132)])
    assert line.length == pytest.approx(1000, rel=0.002)


def test_check_in_zagreb_rejects_wrong_crs():
    # Coordinates left in degrees but labelled as EPSG:3765 must be caught.
    g = gpd.GeoDataFrame(geometry=[box(15.9, 45.7, 16.0, 45.8)], crs=METRIC_CRS)
    with pytest.raises(ValueError):
        check_in_zagreb(g, "test", {})


# ---------------------------------------------------------------- geometry cleaning

def test_clean_geometries_repairs_and_drops():
    bowtie = Polygon([(0, 0), (10, 10), (10, 0), (0, 10), (0, 0)])  # self-intersecting
    g = gpd.GeoDataFrame({"k": [1, 2, 3]}, geometry=[bowtie, None, Polygon()], crs=METRIC_CRS)
    rep: dict = {}
    out = clean_geometries(g, "t", rep)
    assert len(out) == 1
    assert out.geometry.is_valid.all()
    assert rep["t"]["invalid_repaired"] == 1
    assert rep["t"]["missing_or_empty_dropped"] == 2
    assert out.geometry.iloc[0].area == pytest.approx(50)


def test_read_layer_missing_file(tmp_path):
    with pytest.raises(FileNotFoundError, match="download.py"):
        read_layer(tmp_path / "nope.geojson")


def test_read_layer_without_crs(tmp_path):
    from shapely.geometry import Point
    p = tmp_path / "nocrs.shp"
    gpd.GeoDataFrame({"a": [1]}, geometry=[Point(1, 2)]).to_file(p)  # no .prj written
    with pytest.raises(ValueError, match="no CRS"):
        read_layer(p)


# ---------------------------------------------------------------- greenery score

def test_green_scores_bounds_and_values():
    line_in = LineString([(0, 0), (100, 0)])      # fully inside green square
    line_out = LineString([(0, 500), (100, 500)])  # far from green
    line_half = LineString([(0, 200), (100, 200)])  # green on one side only
    green = [box(-50, -50, 150, 50), box(-50, 200, 150, 260)]
    s = green_scores([line_in, line_out, line_half], green, buffer_m=20)
    assert s[0] == pytest.approx(1.0)
    assert s[1] == 0.0
    assert s[2] == pytest.approx(0.5, abs=0.01)
    assert ((s >= 0) & (s <= 1)).all()


def test_green_scores_no_vegetation():
    s = green_scores([LineString([(0, 0), (10, 0)])], [], 20)
    assert np.array_equal(s, [0.0])


# ---------------------------------------------------------------- spatial join

def test_area_by_class_intersects_and_assigns_buildings_by_centroid():
    zones = gpd.GeoDataFrame({"z": ["L", "R"]}, geometry=[box(0, 0, 100, 100), box(100, 0, 200, 100)], crs=METRIC_CRS)
    veg = gpd.GeoDataFrame(
        {"LULCType": [5, 13, 13]},
        geometry=[box(50, 0, 150, 100),   # park split 50/50
                  box(10, 10, 20, 20),    # building in L
                  box(95, 10, 115, 20)],  # building straddling; centroid in R
        crs=METRIC_CRS,
    )
    a = area_by_class(veg, zones, "z")
    assert a.loc["L", 5] == pytest.approx(5000)
    assert a.loc["R", 5] == pytest.approx(5000)
    assert a.loc["L", 13] == pytest.approx(100)
    assert a.loc["R", 13] == pytest.approx(200)


# ---------------------------------------------------------------- OSM graph

def _way(id_, nodes, coords, hw="footway"):
    return {"type": "way", "id": id_, "nodes": nodes, "tags": {"highway": hw},
            "geometry": [{"lon": x, "lat": y} for x, y in coords]}


def test_split_ways_at_intersections():
    els = [
        _way(1, [1, 2, 3], [(0, 0), (1, 0), (2, 0)]),
        _way(2, [4, 2, 5], [(1, -1), (1, 0), (1, 1)]),
        {"type": "way", "id": 3, "nodes": [9, 10], "geometry": None},  # missing geometry → skipped
    ]
    edges = split_ways(els)
    pairs = sorted((e.u, e.v) for e in edges)
    assert pairs == [(1, 2), (2, 3), (2, 5), (4, 2)]


def test_largest_component():
    comp = largest_component(6, [(0, 1), (1, 2), (3, 4)])
    assert comp == {0, 1, 2}
