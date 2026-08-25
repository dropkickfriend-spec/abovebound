# Claude engineering handoff

This file is the operating brief for Claude Code or any Claude GitHub review working
on AboveBound. Read it before editing. Treat claims in the UI as hypotheses that must
be supported by equations, tests and source-labelled evidence.

## Mission

AboveBound is an early-design building-energy screening tool. Its useful core is the
automatic search for lower lifecycle energy across building geometry, solar exposure,
neighbour shadows, envelope exposure, airflow distribution, HVAC cycling and
manufacturing difficulty.

The product must help a non-expert get a useful comparison with as little input as
possible while being honest about uncertainty. It must never present screening output
as certified engineering, code compliance, CFD, an energy rating or a construction
approval.

The deployed site is <https://abovebound.org>. The handoff baseline is production
release `20260826-074205`.

## Non-negotiable constraints

1. Do not add Gemini, OpenAI, Anthropic or any other hosted AI/API dependency to the
   simulation runtime. Physics and optimization must remain deterministic and local.
2. Prime-number, blockchain, novelty and Riemann visualizations are legacy experiments.
   They must not influence building-physics results or energy claims.
3. Preserve the Canvas2D software-3D renderer. WebGL may accelerate a view, but lack of
   WebGL must never disable the simulator, drag orbit, wheel/pinch zoom or animation.
4. Preserve evidence labels. Do not convert assumed building heights, apartment
   adjacency, internal layouts, materials, climate or legal constraints into facts.
5. Never commit `.env`, deployment archives, persistent workspace data, access tokens,
   presigned URLs, Cloudflare tunnel credentials or AWS credentials.
6. Do not weaken anonymous-workspace isolation, request limits or payload limits.
7. Run the full test suite before opening a pull request.

## Architecture map

- `src/App.tsx`: primary UI and legacy simulation shell. It is very large and is the
  largest maintainability risk. Refactor incrementally with behaviour-preserving tests.
- `server.ts`: Express API, anonymous workspaces, persistent learning records and
  production static/WebSocket server.
- `src/lib/site_geometry_optimizer.ts`: deterministic building-form, orientation,
  eave, glazing, resilience, solar-path and self-shadow search.
- `src/lib/whole_house_optimizer.ts`: dwelling archetypes, airflow-control sweep,
  steady pressure network, operational/manufacturing energy and lifecycle gate.
- `src/lib/site_context.ts`: GeoJSON footprint ingestion, local metric conversion,
  subject/neighbour selection, evidence completeness and azimuth-horizon obstruction.
- `src/lib/building_physics_validation.ts`: level-1 numerical invariants. These are
  regression checks, not external validation.
- `src/lib/shared_site_model.ts`: single source of truth for the quantities every
  panel screens the same building against (site, indoor setpoint, lifecycle horizon,
  HVAC COP, wall R-value). Upstream-wins projection with reported overrides.
- `src/lib/panel_coupling.ts`: derives downstream panel inputs from upstream results
  (chosen form, chosen airflow configuration) so panels simulate each other's effects.
  Adds no constants; every coupled field carries provenance.
- `src/lib/degree_day_setpoint.ts`: setpoint-corrected degree days recovered from a
  preset `(HDD, CDD)` pair. Round-trips exactly at the base temperature.
- `src/lib/house_airflow_network.ts` and `src/lib/height_airflow.ts`: inferred shared
  boundaries, transfer paths, roof routes and height-aware reduced-order airflow.
- `src/lib/hvac_cycle_optimizer.ts`: transient thermostat/cycling and source-recovery
  search.
- `src/lib/adaptive_wall_optimizer.ts`: thermodynamically bounded waste-heat,
  microlattice and bladder feasibility search.
- `src/components/HousePhysics3D.tsx`: software 3D plus optional Three.js views.
- `site-context-cache/`: bundled open-building snapshots for Australian preset anchors;
  source/licence metadata is retained in each feature.
- `scripts/`: deterministic smoke/regression harnesses and site-context importer.
- `Dockerfile`, `compose.yaml`, `DEPLOY_INSTRUCTIONS.md`: AWS EC2 + Docker + Cloudflare
  Tunnel deployment.

## Current verified state

- `npm run test:all` passes on Node 22.
- Twelve numerical physics invariants pass (`12/12`), including setpoint degree-day
  round-trip, setpoint monotonicity, setpoint-reaches-energy and selection disclosure.
- The Bendigo preset loads cached open building massing (80 neighbours within the
  bounded context result at the current anchor).
- Whole System automatically uses the massing horizon screen to adjust summer shade
  potential and winter solar access.
- The production winner at the current Bendigo screening inputs is a low-rise middle
  apartment. This is a model result, not a universal recommendation. Sensitivity
  testing shows the ranking is driven almost entirely by the hardcoded
  `DWELLING_ARCHETYPES` constants: the 432-candidate sweep moves lifecycle energy by
  about 356 kWh while the archetype choice moves it by about 11,880 kWh, and
  substituting published-order embodied-energy factors reverses the ranking.
  Treat the winner as a restatement of those constants until item 7 is resolved.
- The requested indoor setpoint now reaches the physics through setpoint-corrected
  degree days (`src/lib/degree_day_setpoint.ts`). It was previously accepted by the
  API and UI and never used.
- The production UI shows the top three lifecycle designs, evidence completeness,
  uncertainty and a downloadable JSON screening report.
- A clean Chrome verification loaded `assets/index-i4jKbk7x.js` with no console errors.

## Important limitations to review, not conceal

1. The physics suite checks units, signs, solar geometry, shadow geometry, pressure
   mass conservation, lifecycle accounting and determinism. It has not yet completed
   ASHRAE Standard 140 / BESTEST comparison cases.
2. Annual loads are reduced-order degree-day and representative-solar calculations,
   not an hourly calibrated EnergyPlus model.
3. The airflow network is a steady linear-conductance screen, not detailed CFD and not
   a smoke/fire design.
4. Overture footprints do not prove property ownership, surveyed boundaries, internal
   floor plans, materials, party walls or open shared cavities. Unknown heights use an
   explicit default.
5. City preset coordinates are demonstration anchors. An exact property requires an
   exact location and a corresponding cached extract; do not imply otherwise.
6. Climate presets are climatology screens. Exact design work needs a documented
   weather file and site/hazard/code inputs.
7. Generic embodied-energy factors must be replaced by product EPD data before a real
   procurement or construction decision.
8. Local planning, NCC, wind, flood, BAL, seismic, snow and structural requirements
   require authoritative jurisdiction/site data and qualified review.

## Priority review and improvement queue

Work in this order unless an issue or user request overrides it:

1. **Independent equation audit.** Trace every energy, power, pressure, temperature,
   solar and manufacturing term to its units. Add tests for dimensional consistency,
   boundary cases and monotonic behaviour. Fix claims when evidence is weaker than UI
   wording.
2. **External benchmark harness.** Add reproducible ASHRAE Standard 140 / BESTEST case
   inputs and compare annual heating/cooling outputs with published acceptance ranges.
   Keep this optional/offline if EnergyPlus is used; never claim certification merely
   because the executable ran.
3. **Uncertainty propagation.** Replace the single heuristic site percentage with
   explicit input distributions or sensitivity bounds. Show which assumptions drive
   the recommendation and whether the top-three ranking is robust.
4. **Hourly weather path.** Support cached EPW or authoritative BOM-derived hourly
   weather without a runtime API dependency. Preserve provenance, station distance,
   years covered and missing-data flags.
5. **Neighbour-shadow validation.** Compare the azimuth-horizon approximation against
   a polygon/ray reference implementation across solstices, equinoxes and tall/close
   obstruction cases. Separate visual height clipping from calculation height.
6. **Apartment position model.** Distinguish middle, corner, top, ground and vacant-
   neighbour cases. Do not assume every shared boundary is conditioned.
7. **Airflow calibration.** Add nonlinear opening/leakage flow exponents, stack/wind
   pressure cases and published multizone benchmarks while keeping fast search viable.
8. **UI decomposition.** Split `App.tsx` into the Whole System feature, legacy lab,
   workspace and navigation modules. Add component tests around entry flow, automatic
   sweep, evidence badges, report download and WebGL-free interaction.
9. **Decision report.** Produce a concise human-readable report alongside JSON: top
   three, annual energy, embodied energy, comfort, difficulty, uncertainty, dominant
   assumptions and rejected alternatives.
10. **Performance.** Code-split the legacy simulation bundle. The current production
    JavaScript is about 1.9 MB before gzip; do not trade numerical reproducibility for
    cosmetic loading improvements.

## Required workflow

1. Create a branch named `claude/<short-change-name>`.
2. Read the relevant implementation and smoke test before editing.
3. Add a failing regression test for a confirmed defect or a bounded test for a new
   scientific behaviour.
4. Keep calculations deterministic; any randomized optimizer must accept and report a
   seed.
5. Run:

   ```powershell
   npm ci
   npm run test:all
   ```

6. Review output wording for evidence level and uncertainty.
7. Open a pull request summarizing equations changed, units, evidence sources, test
   results, expected numerical differences and remaining limitations.
8. Do not deploy from a review branch. Production deployment remains a separate,
   explicit operation with candidate health checks and rollback.

## Useful API checks

After running `npm run dev`:

- `GET /api/health`
- `GET /api/house/validation-report`
- `POST /api/house/site-context`
- `POST /api/house/optimize-site`
- `POST /api/house/optimize-whole-system`

Use the payload shapes from `src/App.tsx` and the smoke scripts. Do not send exact
locations, workspace records or other user data to external services during review.
