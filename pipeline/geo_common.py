"""Shared constants and helpers for the GreenGo Zagreb data pipeline.

All metric operations run in HTRS96/TM (EPSG:3765), the official Croatian
projected CRS, which is also the native CRS of the City of Zagreb datasets.
Output for the web app is written in WGS84 (EPSG:4326).
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import geopandas as gpd
import shapely
from shapely.geometry.base import BaseGeometry

log = logging.getLogger("greengo")

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"

METRIC_CRS = "EPSG:3765"
WGS84 = "EPSG:4326"

# Study area used for the routing graph and detailed vegetation layer
# (lon_min, lat_min, lon_max, lat_max) — central Zagreb.
STUDY_BBOX = (15.925, 45.775, 16.030, 45.830)

# LULCType codes from "Topografska osnova 2018. Vegetacija i vrste zemljišta".
# Labels are copied verbatim from the publisher's ArcGIS renderer
# (data/raw/meta/vegetacija_layers.json).
LULC_LABELS: dict[int, str] = {
    1: "5100A - obradivo zemljište – oranica",
    2: "5100B - obradivo zemljište – livada",
    3: "5100C - obradivo zemljište – voćnjaci i vinogradi",
    4: "5100D - neobradivo",
    5: "5100E - park",
    6: "5100F - šumsko zemljište - šuma",
    7: "5100G - šumsko zemljište - šikara",
    8: "5200 - neplodno zemljište",
    9: "5300A - izgrađene površine – javne",
    10: "5300B - izgrađene površine – gospodarske",
    11: "5300C - izgrađene površine – prometne",
    12: "5300D - dvorište",
    13: "5300E - izgrađene površine - objekti",
    14: "5300F - izgrađene površine - groblje",
    15: "5400 - površine intenzivne gospodarske djelatnosti",
    16: "5500 - površine posebne namjene",
}

# "Mapped vegetation" used throughout the project: permanent vegetated cover.
# Arable land (1) is excluded because it is seasonally bare soil.
GREEN_CODES = (2, 3, 5, 6, 7)
# Classes counted as public green spaces for park-distance analysis.
PARK_CODES = (5, 6)
# Unsealed, non-vegetated or courtyard surfaces: a *proxy* for surfaces that
# might be assessed for planting. Ownership/suitability is NOT known.
OPEN_SURFACE_CODES = (4, 8, 12)
BUILT_CODES = (9, 10, 11, 13, 15, 16)

# Planned land use (Skupna_namjena) groups.
RESIDENTIAL_LANDUSE = (
    "Stambena i mješovita namjena",
    "Mješovita namjena",
    "Pretežito stambena namjena",
)
# Land-use groups where greening recommendations are not meaningful.
EXCLUDED_LANDUSE = (
    "Prometne površine",
    "Infrastruktura",
    "Vode i vodno dobro",
    "Groblje",
    "Posebna namjena",
)


def clean_geometries(gdf: gpd.GeoDataFrame, name: str, report: dict) -> gpd.GeoDataFrame:
    """Drop missing/empty geometry, repair invalid geometry, keep polygonal parts.

    Records counts in `report[name]` so the pipeline report shows exactly what
    was changed. Never invents geometry.
    """
    n0 = len(gdf)
    missing = gdf.geometry.isna() | gdf.geometry.is_empty
    gdf = gdf.loc[~missing].copy()
    invalid = ~gdf.geometry.is_valid
    n_invalid = int(invalid.sum())
    if n_invalid:
        gdf.loc[invalid, "geometry"] = shapely.make_valid(gdf.loc[invalid, "geometry"].values)
    # make_valid can produce GeometryCollections; keep only the polygonal parts
    # for polygon layers.
    if gdf.geom_type.isin(["Polygon", "MultiPolygon", "GeometryCollection"]).all():
        gdf["geometry"] = [polygonal_part(g) for g in gdf.geometry]
        still_empty = gdf.geometry.isna() | gdf.geometry.is_empty
        gdf = gdf.loc[~still_empty]
    report[name] = {
        "features_in": n0,
        "missing_or_empty_dropped": int(missing.sum()),
        "invalid_repaired": n_invalid,
        "features_out": len(gdf),
        "geometry_types": gdf.geom_type.value_counts().to_dict(),
    }
    log.info("%s: %s", name, report[name])
    return gdf


def polygonal_part(geom: BaseGeometry | None) -> BaseGeometry | None:
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return geom
    if geom.geom_type == "GeometryCollection":
        polys = [g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        if not polys:
            return None
        return shapely.union_all(polys)
    return None


def read_layer(path: Path, expected_crs: str | None = None) -> gpd.GeoDataFrame:
    """Read a vector file, failing loudly if it is missing or has no CRS."""
    if not path.exists():
        raise FileNotFoundError(
            f"Dataset not found: {path}. Run `python pipeline/download.py` first."
        )
    gdf = gpd.read_file(path)
    if gdf.crs is None:
        raise ValueError(f"{path.name} has no CRS; refusing to guess.")
    if expected_crs and not gdf.crs.equals(expected_crs):
        log.info("%s: CRS %s (expected %s) — will reproject", path.name, gdf.crs, expected_crs)
    return gdf


def write_geojson(gdf: gpd.GeoDataFrame, path: Path, precision: int = 5) -> int:
    """Write WGS84 GeoJSON with rounded coordinates; returns file size in bytes."""
    gdf = gdf.to_crs(WGS84)
    gdf = gdf.set_geometry(shapely.set_precision(gdf.geometry.values, 10 ** -precision))
    gdf = gdf.loc[~gdf.geometry.is_empty]
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.loads(gdf.to_json(drop_id=True))
    data.pop("crs", None)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    return len(text.encode())


def write_json(obj, path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    return len(text.encode())


def study_area_metric(buffer_m: float = 0) -> BaseGeometry:
    box = gpd.GeoSeries([shapely.box(*STUDY_BBOX)], crs=WGS84).to_crs(METRIC_CRS).iloc[0]
    return box.buffer(buffer_m) if buffer_m else box
