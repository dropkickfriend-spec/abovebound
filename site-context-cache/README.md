# Bundled site-context snapshots

These small GeoJSON snapshots are open building footprints around the default Australian climate anchors. They let the deployed simulator demonstrate evidence-labelled neighbour massing without a runtime map, geocoding or AI service.

- Source: Overture Maps buildings theme, downloaded 2026-08-26.
- Format: GeoJSON `FeatureCollection`; original per-feature source and licence metadata is retained.
- Scope: roughly 300 m × 300 m around each preset anchor.
- Limitation: a city-centre anchor is not a user's property. Only a footprint containing the selected anchor, or one within 30 m, can be treated as the subject. Otherwise the simulator keeps its engine-derived subject geometry and uses open features only as neighbour context.
- Heights: observed height or level fields are used when present; otherwise the UI labels a one-storey 3.2 m assumption.

For an exact site, download or export building footprints as GeoJSON and run:

```powershell
npm run site-context:import -- --input buildings.geojson --latitude -36.76 --longitude 144.28 --data-dir C:\path\to\persistent-data
```

The server automatically discovers the resulting cache file on the next sweep.
