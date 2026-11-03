"""Build all static data used by the GreenGo Zagreb web app.

Usage:  python pipeline/build_all.py [--buffer 20] [--cell 250]

Inputs  (data/raw/, see download.py): vegetation 2018, planned land use 2023,
        community gardens, air-quality stations, city districts, OSM ways.
Outputs (public/data/): graph.json, veg_study.geojson, veg_city.geojson,
        landuse.geojson, districts.geojson, grid.json, gardens.geojson,
        air_stations.geojson, meta.json, pipeline_report.json
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import time

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from shapely.strtree import STRtree

from geo_common import (
    BUILT_CODES, EXCLUDED_LANDUSE, GREEN_CODES, LULC_LABELS, METRIC_CRS, OPEN_SURFACE_CODES,
    OUT, PARK_CODES, RAW, RESIDENTIAL_LANDUSE, STUDY_BBOX, WGS84, clean_geometries,
    read_layer, study_area_metric, write_geojson, write_json,
)
from network import green_scores, largest_component, split_ways, to_metric_line

log = logging.getLogger("greengo")

HIGHWAY_CLASSES = [
    "footway", "path", "pedestrian", "steps", "living_street", "residential", "service",
    "track", "cycleway", "unclassified", "tertiary", "secondary", "primary", "other",
]
ZAGREB_BOUNDS_3765 = (440_000, 5_050_000, 482_000, 5_095_000)


def check_in_zagreb(gdf: gpd.GeoDataFrame, name: str, report: dict) -> None:
    """Coordinate-system sanity check: data must fall inside Zagreb in EPSG:3765."""
    minx, miny, maxx, maxy = gdf.total_bounds
    bx = ZAGREB_BOUNDS_3765
    ok = bx[0] <= minx and maxx <= bx[2] and bx[1] <= miny and maxy <= bx[3]
    report.setdefault("crs_checks", {})[name] = {
        "bounds_epsg3765": [round(v, 1) for v in (minx, miny, maxx, maxy)], "inside_zagreb": bool(ok),
    }
    if not ok:
        raise ValueError(f"{name}: bounds {gdf.total_bounds} are outside Zagreb — CRS problem?")


def load_inputs(report: dict):
    t = time.time()
    veg = read_layer(RAW / "vegetacija.geojson")
    report["source_crs"] = {"vegetacija": str(veg.crs)}
    veg = veg[["LULCType", "ThematicUnit", "DataSource", "DataAcquisitionDate", "geometry"]]
    veg = clean_geometries(veg.to_crs(METRIC_CRS), "vegetacija", report)
    unknown = ~veg.LULCType.isin(LULC_LABELS.keys())
    report["vegetacija"]["unknown_lulc_dropped"] = int(unknown.sum())
    veg = veg.loc[~unknown]
    veg["area_m2"] = veg.area
    check_in_zagreb(veg, "vegetacija", report)
    log.info("vegetation loaded in %.0fs", time.time() - t)

    lu = read_layer(RAW / "namjena.geojson")
    report["source_crs"]["namjena"] = str(lu.crs)
    lu = clean_geometries(lu[["Namjena", "Skupna_namjena", "Naziv_plana", "geometry"]].to_crs(METRIC_CRS),
                          "namjena", report)
    check_in_zagreb(lu, "namjena", report)

    gc = read_layer(next((RAW / "gc").glob("*.shp")))
    report["source_crs"]["gradske_cetvrti"] = str(gc.crs)
    gc = clean_geometries(gc.to_crs(METRIC_CRS)[["JMS_MB", "JMS_IME", "geometry"]], "gradske_cetvrti", report)
    check_in_zagreb(gc, "gradske_cetvrti", report)

    gardens = read_layer(RAW / "vrtovi.geojson")
    report["source_crs"]["vrtovi"] = str(gardens.crs)
    gardens = clean_geometries(gardens.to_crs(METRIC_CRS), "vrtovi", report)
    check_in_zagreb(gardens, "vrtovi", report)

    air = read_layer(RAW / "zrak.geojson")
    report["source_crs"]["zrak"] = str(air.crs)
    air = air.loc[~(air.geometry.isna() | air.geometry.is_empty)].to_crs(METRIC_CRS)
    report["zrak"] = {"features_out": len(air), "geometry_types": air.geom_type.value_counts().to_dict()}
    check_in_zagreb(air, "zrak", report)
    return veg, lu, gc, gardens, air


def explode_union(geoms) -> list:
    u = shapely.union_all(np.asarray(geoms, dtype=object))
    return list(shapely.get_parts(u)) if not u.is_empty else []


# ------------------------------------------------------------------ routing graph

def build_graph(veg: gpd.GeoDataFrame, buffer_m: float, report: dict) -> None:
    osm = json.loads((RAW / "osm_pedestrian.json").read_text())
    elements = osm.get("elements", [])
    edges = split_ways(elements)
    log.info("OSM: %d ways -> %d edges", sum(e.get("type") == "way" for e in elements), len(edges))

    area = study_area_metric(buffer_m + 50)
    green = veg.loc[veg.LULCType.isin(GREEN_CODES)]
    green = green.loc[green.intersects(area)]
    parts = explode_union(shapely.intersection(green.geometry.values, area))

    lines = [to_metric_line(e.coords) for e in edges]
    lengths = np.array([ln.length for ln in lines])
    scores = green_scores(lines, parts, buffer_m)

    keep = lengths > 0.5
    ids: dict[int, int] = {}
    node_coords: dict[int, tuple[float, float]] = {}
    for e, k in zip(edges, keep):
        if not k:
            continue
        for nid, c in ((e.u, e.coords[0]), (e.v, e.coords[-1])):
            if nid not in ids:
                ids[nid] = len(ids)
                node_coords[ids[nid]] = c
    uv = [(ids[e.u], ids[e.v]) for e, k in zip(edges, keep) if k]
    comp = largest_component(len(ids), uv)

    # re-index to the largest component only
    remap = {old: new for new, old in enumerate(sorted(comp))}
    nodes_flat: list[float] = []
    for old in sorted(comp):
        lon, lat = node_coords[old]
        nodes_flat += [round(lon, 6), round(lat, 6)]
    out_edges = []
    total_len = green_len = 0.0
    for e, k, ln, sc in zip(edges, keep, lengths, scores):
        if not k:
            continue
        u, v = ids[e.u], ids[e.v]
        if u not in comp:
            continue
        interior = [round(x, 6) for c in e.coords[1:-1] for x in c]
        hw = e.highway.replace("_link", "")
        out_edges.append([remap[u], remap[v], round(float(ln), 1), int(round(sc * 1000)),
                          HIGHWAY_CLASSES.index(hw) if hw in HIGHWAY_CLASSES else len(HIGHWAY_CLASSES) - 1,
                          interior])
        total_len += ln
        green_len += ln * sc

    graph = {
        "meta": {
            "bbox": STUDY_BBOX, "buffer_m": buffer_m, "highway_classes": HIGHWAY_CLASSES,
            "green_codes": list(GREEN_CODES),
            "edge_format": ["u", "v", "length_m", "green_score_x1000", "highway_class", "interior_lonlat_flat"],
            "osm_timestamp": osm.get("osm3s", {}).get("timestamp_osm_base"),
        },
        "nodes": nodes_flat,
        "edges": out_edges,
    }
    size = write_json(graph, OUT / "graph.json")
    report["graph"] = {
        "osm_edges_raw": len(edges), "nodes": len(comp), "edges": len(out_edges),
        "dropped_disconnected_nodes": len(ids) - len(comp),
        "total_length_km": round(total_len / 1000, 1),
        "length_weighted_green_score": round(green_len / total_len, 3) if total_len else 0,
        "bytes": size,
    }
    log.info("graph: %s", report["graph"])


# ------------------------------------------------------------------ map layers

def build_layers(veg, lu, gc, gardens, air, report: dict) -> None:
    sizes = {}
    area = study_area_metric()
    green = veg.loc[veg.LULCType.isin(GREEN_CODES)]

    study = green.loc[green.intersects(area)].copy()
    study["geometry"] = shapely.intersection(study.geometry.values, area)
    study = study.dissolve("LULCType", as_index=False)[["LULCType", "geometry"]]
    study["geometry"] = study.simplify(1.5)
    study = study.explode(index_parts=False)
    study = study.loc[study.area >= 40]  # drop slivers < 40 m² for display only
    study["label"] = study.LULCType.map(LULC_LABELS)
    sizes["veg_study.geojson"] = write_geojson(study.rename(columns={"LULCType": "code"}),
                                               OUT / "veg_study.geojson", 5)

    city = green.dissolve("LULCType", as_index=False)[["LULCType", "geometry"]]
    city["geometry"] = city.simplify(12)
    city = city.explode(index_parts=False)
    city = city.loc[city.area >= 2500]
    city["label"] = city.LULCType.map(LULC_LABELS)
    sizes["veg_city.geojson"] = write_geojson(city.rename(columns={"LULCType": "code"}),
                                              OUT / "veg_city.geojson", 5)

    landuse = lu.dissolve("Skupna_namjena", as_index=False)[["Skupna_namjena", "geometry"]]
    landuse["geometry"] = landuse.simplify(8)
    landuse = landuse.explode(index_parts=False)
    landuse = landuse.loc[landuse.area >= 1500].rename(columns={"Skupna_namjena": "group"})
    sizes["landuse.geojson"] = write_geojson(landuse, OUT / "landuse.geojson", 5)

    g = gardens.copy()
    g["area_m2"] = g.area.round(0)
    g["geometry"] = g.simplify(1)
    cols = ["naziv", "adresa", "grad_cetvrt", "godina_otvaranja", "br_vr_parcela", "br_korisnika",
            "nadlezan", "area_m2", "geometry"]
    sizes["gardens.geojson"] = write_geojson(g[[c for c in cols if c in g.columns]], OUT / "gardens.geojson", 6)

    a = air[[c for c in ["naziv", "opis_lokac", "lokacija", "tip_podrucja", "tip_postaje", "mjerne_tvari",
                         "odgovornost", "geometry"] if c in air.columns]]
    sizes["air_stations.geojson"] = write_geojson(a, OUT / "air_stations.geojson", 6)
    report["layer_bytes"] = sizes
    log.info("layers: %s", sizes)


# ------------------------------------------------------------------ district statistics

def area_by_class(veg: gpd.GeoDataFrame, zones: gpd.GeoDataFrame, key: str) -> pd.DataFrame:
    """Area (m²) of each LULC class inside each zone.

    Buildings (class 13, ~274k tiny polygons) are assigned by centroid; all
    other classes are intersected exactly.
    """
    bld = veg.loc[veg.LULCType == 13]
    rest = veg.loc[veg.LULCType != 13]
    ov = gpd.overlay(rest[["LULCType", "geometry"]], zones[[key, "geometry"]], how="intersection",
                     keep_geom_type=True)
    ov["a"] = ov.area
    parts = [ov.groupby([key, "LULCType"]).a.sum()]
    cent = gpd.GeoDataFrame({"a": bld.area.values}, geometry=bld.centroid.values, crs=METRIC_CRS)
    j = gpd.sjoin(cent, zones[[key, "geometry"]], predicate="within", how="inner")
    j["LULCType"] = 13
    parts.append(j.groupby([key, "LULCType"]).a.sum())
    return pd.concat(parts).groupby(level=[0, 1]).sum().unstack(fill_value=0.0)


def share(df: pd.DataFrame, codes) -> pd.Series:
    cols = [c for c in codes if c in df.columns]
    return df[cols].sum(axis=1)


def build_districts(veg, lu, gc, gardens, report: dict) -> None:
    by = area_by_class(veg, gc, "JMS_IME")
    total = by.sum(axis=1)
    res = lu.loc[lu.Skupna_namjena.isin(RESIDENTIAL_LANDUSE)]
    res_by = gpd.overlay(res[["geometry"]], gc[["JMS_IME", "geometry"]], how="intersection", keep_geom_type=True)
    garden_reach = shapely.union_all(gardens.buffer(1000).values)
    res_by["a"] = res_by.area
    res_by["a_near"] = shapely.area(shapely.intersection(res_by.geometry.values, garden_reach))
    res_area = res_by.groupby("JMS_IME")[["a", "a_near"]].sum()
    gj = gpd.sjoin(gpd.GeoDataFrame(gardens[["br_vr_parcela"]], geometry=gardens.centroid, crs=METRIC_CRS),
                   gc[["JMS_IME", "geometry"]], predicate="within")
    gcount = gj.groupby("JMS_IME").size()
    gplots = gj.groupby("JMS_IME").br_vr_parcela.sum()

    d = gc.copy()
    d["area_km2"] = (d.area / 1e6).round(2)
    rows = []
    for name in d.JMS_IME:
        r = by.loc[name] if name in by.index else pd.Series(dtype=float)
        tot = float(total.get(name, 0)) or 1.0
        cls = {int(k): round(float(v) / tot, 4) for k, v in r.items() if v > 0}
        ra = res_area.loc[name] if name in res_area.index else None
        rows.append({
            "green_share": round(float(share(by, GREEN_CODES).get(name, 0)) / tot, 4),
            "park_share": round(float(share(by, (5,)).get(name, 0)) / tot, 4),
            "forest_share": round(float(share(by, (6, 7)).get(name, 0)) / tot, 4),
            "built_share": round(float(share(by, BUILT_CODES).get(name, 0)) / tot, 4),
            "class_shares": cls,
            "residential_km2": round(float(ra.a) / 1e6, 3) if ra is not None else 0,
            "residential_near_garden_share": round(float(ra.a_near / ra.a), 4) if ra is not None and ra.a else 0,
            "gardens": int(gcount.get(name, 0)),
            "garden_plots": int(gplots.get(name, 0)),
        })
    stats = pd.DataFrame(rows, index=d.index)
    d = pd.concat([d, stats], axis=1)
    d["geometry"] = d.simplify(15)
    d = d.rename(columns={"JMS_IME": "name", "JMS_MB": "id"})
    report["districts"] = {"count": len(d), "bytes": write_geojson(d, OUT / "districts.geojson", 5)}

    tot_all = float(total.sum())
    report["city"] = {
        "mapped_area_km2": round(tot_all / 1e6, 2),
        "green_share": round(float(share(by, GREEN_CODES).sum()) / tot_all, 4),
        "class_area_km2": {int(c): round(float(by[c].sum()) / 1e6, 3) for c in by.columns},
        "residential_near_garden_share": round(float(res_area.a_near.sum() / res_area.a.sum()), 4),
        "gardens": len(gardens), "garden_plots": int(gardens.br_vr_parcela.fillna(0).sum()),
    }


# ------------------------------------------------------------------ GreenPlan grid

def build_grid(veg, lu, gc, gardens, cell: int, report: dict) -> None:
    city = shapely.union_all(gc.geometry.values)
    minx, miny, maxx, maxy = city.bounds
    x0, y0 = np.floor(minx / cell) * cell, np.floor(miny / cell) * cell
    nx, ny = int(np.ceil((maxx - x0) / cell)), int(np.ceil((maxy - y0) / cell))
    ii, jj = np.meshgrid(np.arange(nx), np.arange(ny), indexing="ij")
    ii, jj = ii.ravel(), jj.ravel()
    boxes = shapely.box(x0 + ii * cell, y0 + jj * cell, x0 + (ii + 1) * cell, y0 + (jj + 1) * cell)
    grid = gpd.GeoDataFrame({"i": ii, "j": jj}, geometry=boxes, crs=METRIC_CRS)
    inside = shapely.area(shapely.intersection(grid.geometry.values, city)) / (cell * cell)
    grid = grid.loc[inside >= 0.5].reset_index(drop=True)
    grid["cid"] = np.arange(len(grid))
    log.info("grid: %d cells of %dm", len(grid), cell)

    by = area_by_class(veg, grid, "cid").reindex(grid.cid, fill_value=0.0)
    tot = by.sum(axis=1).replace(0, np.nan)
    grid["green"] = (share(by, GREEN_CODES) / tot).fillna(0).values
    grid["park"] = (share(by, (5,)) / tot).fillna(0).values
    grid["open"] = (share(by, OPEN_SURFACE_CODES) / tot).fillna(0).values
    grid["built"] = (share(by, BUILT_CODES) / tot).fillna(0).values

    ov = gpd.overlay(lu[["Skupna_namjena", "geometry"]], grid[["cid", "geometry"]], how="intersection",
                     keep_geom_type=True)
    ov["a"] = ov.area
    lsh = ov.pivot_table(index="cid", columns="Skupna_namjena", values="a", aggfunc="sum", fill_value=0)
    lsh = lsh.reindex(grid.cid, fill_value=0.0) / (cell * cell)
    pick = lambda groups: lsh[[g for g in groups if g in lsh.columns]].sum(axis=1).clip(0, 1).values  # noqa: E731
    grid["res"] = pick(RESIDENTIAL_LANDUSE)
    grid["excl"] = pick(EXCLUDED_LANDUSE)
    grid["lugreen"] = pick(("Javne zelene površine", "Zaštitne zelene površine", "Šume", "Sport i rekreacija"))

    parks = veg.loc[veg.LULCType.isin(PARK_CODES)]
    park_parts = [p for p in explode_union(parks.geometry.values) if p.area >= 10_000]
    cent = grid.centroid.values
    tree = STRtree(park_parts)
    idx = tree.nearest(cent)
    grid["dpark"] = shapely.distance(cent, np.asarray(park_parts, dtype=object)[idx])
    gtree = STRtree(list(gardens.geometry.values))
    gidx = gtree.nearest(cent)
    grid["dgarden"] = shapely.distance(cent, gardens.geometry.values[gidx])

    dj = gpd.sjoin(gpd.GeoDataFrame({"cid": grid.cid}, geometry=cent, crs=METRIC_CRS),
                   gc[["JMS_IME", "geometry"]], predicate="within", how="left").drop_duplicates("cid")
    names = sorted(gc.JMS_IME)
    grid["d"] = dj.set_index("cid").JMS_IME.reindex(grid.cid).map({n: k for k, n in enumerate(names)}).fillna(-1).astype(int).values

    ll = gpd.GeoSeries(grid.geometry.values, crs=METRIC_CRS).to_crs(WGS84).bounds
    r3 = lambda a: [round(float(x), 3) for x in a]  # noqa: E731
    out = {
        "meta": {"cell_m": cell, "origin_epsg3765": [float(x0), float(y0)], "districts": names,
                 "fields": {
                     "green": "udio mapirane vegetacije (šifre 5100B,C,E,F,G)",
                     "park": "udio parkova (5100E)",
                     "open": "udio neobradivih, neplodnih površina i dvorišta (5100D, 5200, 5300D) — proxy",
                     "built": "udio izgrađenih površina", "res": "udio stambene/mješovite planirane namjene",
                     "excl": "udio prometne, infrastrukturne, vodne, grobljanske i posebne namjene",
                     "lugreen": "udio planirane zelene/šumske/rekreacijske namjene",
                     "dpark": "udaljenost (m) od središta ćelije do najbližeg parka/šume ≥ 1 ha",
                     "dgarden": "udaljenost (m) od središta ćelije do najbližeg gradskog vrta"}},
        "i": grid.i.tolist(), "j": grid.j.tolist(), "d": grid.d.tolist(),
        "bounds": [[round(b.miny, 6), round(b.minx, 6), round(b.maxy, 6), round(b.maxx, 6)] for b in ll.itertuples()],
        **{k: r3(grid[k]) for k in ("green", "park", "open", "built", "res", "excl", "lugreen")},
        "dpark": grid.dpark.round(0).astype(int).tolist(),
        "dgarden": grid.dgarden.round(0).astype(int).tolist(),
    }
    report["grid"] = {"cells": len(grid), "cell_m": cell, "bytes": write_json(out, OUT / "grid.json"),
                      "parks_ge_1ha": len(park_parts)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--buffer", type=float, default=20.0, help="edge buffer for greenery score (m)")
    ap.add_argument("--cell", type=int, default=250, help="GreenPlan grid cell size (m)")
    ap.add_argument("--skip-graph", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    report: dict = {"built_at": dt.datetime.now(dt.timezone.utc).isoformat(), "params": vars(args)}

    veg, lu, gc, gardens, air = load_inputs(report)
    if not args.skip_graph:
        build_graph(veg, args.buffer, report)
    build_layers(veg, lu, gc, gardens, air, report)
    build_districts(veg, lu, gc, gardens, report)
    build_grid(veg, lu, gc, gardens, args.cell, report)

    manifest_path = RAW / "manifest.json"
    report["inputs"] = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    write_json(report, OUT / "pipeline_report.json")
    (OUT / "pipeline_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    log.info("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
