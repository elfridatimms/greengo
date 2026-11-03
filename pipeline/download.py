"""Download the exact source files used by GreenGo Zagreb.

Usage:  python pipeline/download.py [--force]

Every resource URL below was taken from the data.gov.hr CKAN API
(`/ckan/api/3/action/package_show?id=<dataset>`). A manifest with the file
size, SHA-256 and download time is written to data/raw/manifest.json so a
reviewer can verify which version was processed.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
UA = "GreenGoZagreb-datathon/1.0 (open data research)"

DATASETS = {
    "vegetacija.geojson": {
        "dataset": "https://data.gov.hr/ckan/en/dataset/topografska-osnova-2018-vegetacija-i-vrste-zemljista",
        "url": "https://services8.arcgis.com/Usi0jGQwMmBUpFjr/arcgis/rest/services/Topografska_osnova_2018_Vegetacija_i_vrste_zemlji%C5%A1ta/FeatureServer/replicafilescache/Topografska_osnova_2018_Vegetacija_i_vrste_zemlji%C5%A1ta_-351063888473117085.geojson",
    },
    "meta/vegetacija_layers.json": {
        "dataset": "https://data.gov.hr/ckan/en/dataset/topografska-osnova-2018-vegetacija-i-vrste-zemljista",
        "url": "https://services8.arcgis.com/Usi0jGQwMmBUpFjr/arcgis/rest/services/Topografska_osnova_2018_Vegetacija_i_vrste_zemlji%C5%A1ta/FeatureServer/layers?f=json",
    },
    "namjena.geojson": {
        "dataset": "https://data.gov.hr/ckan/en/dataset/geoportal-planirana-namjena-2023",
        "url": "https://services8.arcgis.com/Usi0jGQwMmBUpFjr/arcgis/rest/services/Geoportal_planirana_namjena/FeatureServer/replicafilescache/Geoportal_planirana_namjena_6350745258229595456.geojson",
    },
    "vrtovi.geojson": {
        "dataset": "https://data.gov.hr/ckan/en/dataset/geoportal-gradski-vrt",
        "url": "https://opendata.arcgis.com/api/v3/datasets/9858b1819a914c6ba0fedd0069f2d861_1/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1",
    },
    "zrak.geojson": {
        "dataset": "https://data.gov.hr/ckan/hr/dataset/geoportal-kvaliteta-zraka",
        "url": "https://opendata.arcgis.com/api/v3/datasets/ed9898e63ec94770a8fb37713c36f8ca_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1",
    },
    "gradske_cetvrti.zip": {
        "dataset": "https://data.gov.hr/ckan/hr/dataset/gradske-cetvrti-prostorna-jedinica-mjesne-samouprave-za-podrucje-grada-zagreba",
        "url": "https://data.zagreb.hr/dataset/9c52e229-09bf-4569-8e01-37f338070d02/resource/f2406ad9-34bf-4235-aa24-d71a08ae2863/download/rpj_gc.zip",
    },
}

# OpenStreetMap pedestrian network for the study area (see geo_common.STUDY_BBOX).
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_QUERY = """[out:json][timeout:180];
(
  way["highway"~"^(footway|path|pedestrian|steps|living_street|residential|service|track|cycleway|unclassified|tertiary|tertiary_link|secondary|secondary_link|primary|primary_link|bridleway|corridor)$"]["area"!="yes"]["access"!~"^(private|no)$"]["foot"!~"^(no|private)$"](45.775,15.925,45.830,16.030);
);
out body geom;"""


def fetch(url: str, dest: Path, data: bytes | None = None) -> None:
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(req, timeout=600) as r, open(dest, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-download existing files")
    args = ap.parse_args()

    manifest_path = RAW / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    jobs = [(name, meta["url"], None, meta["dataset"]) for name, meta in DATASETS.items()]
    jobs.append((
        "osm_pedestrian.json", OVERPASS_URL,
        urllib.parse.urlencode({"data": OVERPASS_QUERY}).encode(),
        "https://www.openstreetmap.org/",
    ))

    for name, url, body, dataset in jobs:
        dest = RAW / name
        if dest.exists() and not args.force:
            print(f"✓ {name} (cached)")
        else:
            print(f"↓ {name} …", flush=True)
            fetch(url, dest, body)
            manifest[name] = {"downloaded_at": dt.datetime.now(dt.timezone.utc).isoformat()}
        # Files fetched before the manifest existed: record their file time.
        manifest.setdefault(name, {}).setdefault(
            "downloaded_at",
            dt.datetime.fromtimestamp(dest.stat().st_mtime, dt.timezone.utc).isoformat(),
        )
        manifest[name].update({
            "dataset_page": dataset,
            "resource_url": url,
            "bytes": dest.stat().st_size,
            "sha256": sha256(dest),
        })

    with zipfile.ZipFile(RAW / "gradske_cetvrti.zip") as z:
        z.extractall(RAW / "gc")
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"Manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
