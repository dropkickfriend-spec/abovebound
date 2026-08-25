# BeyondBound

BeyondBound is a React/Three.js generative-design lab. Its simulations form one pipeline rather than separate demos:

- V0 creates the compression field.
- V1–V2 explore causal-node fields from orthogonal phases.
- V3–V4 build shortest-route networks.
- V5 converts closed routes into architectural membranes.
- V6 simulates thermal, electrical, blockchain, or mathematical flow.
- V7 tunes the upstream stages from the measured flow.
- V8 explores Riemann-zeta and prime-distribution structure.
- V9–V11 construct the material lattice, mesh, and hardware envelope used by the swarm.
- V12 runs the live house, HVAC, Esky, vent, solar, and climate models.
- V13 provides the periodic-table and material-composite builder.

V8 is a standalone mathematical visualization. Prime gaps, Riemann-zeta zeros and
golden-ratio phases do not alter V6 flow resistance, V12 wall conductance, HVAC
schedules, material selection or claimed energy savings. Building-physics results
must come from dimensional, material, weather, load and equipment inputs.

## Whole System building optimizer

Open **House → Whole System** for the primary building-energy workflow. It runs
automatically from the selected location and compares detached, terrace, low-rise
apartment and tower-apartment archetypes while sweeping pressure-control strategy,
transfer openings, duct diameter, fan pressure and heat recovery. The score combines
annual HVAC/fan demand with construction, duct, opening and controls manufacturing
energy over the selected lifecycle.

The consolidated software-3D view combines the annual Earth/sun position, generated
building geometry, shadow direction, cached neighbouring-building massing and the
whole-house pressure network. It remains orbitable and zoomable without WebGL.

Seven Australian preset anchors include small cached snapshots from the Overture Maps
buildings dataset. Exact-site GeoJSON can be added with `npm run site-context:import`.
Footprints and height/level fields are evidence; missing heights, internal layouts,
materials and shared cavities remain explicitly labelled assumptions. The UI reports
site completeness and uncertainty rather than silently inventing missing property
information.

The `/api/house/validation-report` endpoint currently runs eight deterministic
unit/sign/conservation/repeatability checks. Passing these checks qualifies the model
for comparative screening only; it does not mean the model has passed ASHRAE Standard
140, BESTEST, certified CFD, an energy rating or building approval.

## Room and airflow lifecycle optimizer

Open **House → Lifecycle Optimize** to choose a real V12 room and search its room
dimensions, ceiling height, intake and exhaust positions, airflow rate, standard vent
diameter, and cross/stack/mixed airflow strategy. The objective is:

```text
lifecycle energy = annual HVAC and fan energy × design life
                 + envelope, glazing, duct, vent, fan and complexity manufacturing energy
```

Minimum usable floor area and the requested temperature (within ±0.5°C at the design
weather condition) are hard constraints. A proposal is only marked as an improvement
when its net lifecycle energy is lower than the current design, so extra manufacturing
or installation complexity must be repaid by operational savings within the selected
design life. Accepted designs can be applied directly to the live V12 floorplan and
airflow solver.

The model is intended for early design comparison. Its manufacturing factors are
editable in code and should be replaced with product-specific Environmental Product
Declaration data before construction decisions. It is not an NCC certificate or
mechanical-engineering sign-off.

## Site, sun and self-shadow optimizer

Open **House → Site + Shadow** to search complete building forms against an explicit
location. The optimizer tests rectangular, elongated, L-shaped and courtyard plans,
orientation, eave depths, roof pitch, equator-facing glazing, floor elevation,
structural system and hazard-resistant shell. It calculates the sun's altitude and
azimuth from latitude throughout a representative year and ray-tests façade samples
against other wings of the same footprint. This separates shade cast by the building
itself from shade cast by its eaves.

The energy objective rewards summer shade in cooling-dominated locations and winter
solar access in heating-dominated locations. It also includes envelope conduction,
air leakage, natural-ventilation credit, construction energy and the embodied energy
of wind, flood, bushfire, seismic and snow resilience measures. Accepted designs can
replace the V12 room layout and feed their seasonal shade factors into the live solar
heat-gain model.

The solver makes no location or weather API calls. Location presets are editable
screening values. Australian users should replace average solar exposure with the
latest value for the exact site from the [Bureau of Meteorology climatology maps](https://www.bom.gov.au/climate/maps/averages/solar-exposure/).
Local legal requirements are not safely inferable from latitude: enter site-specific
setbacks, wind, flood, BAL, seismic and snow classifications, then verify them against
the adopted [National Construction Code](https://ncc.abcb.gov.au/) and the relevant
state, council and certifier requirements.

## Existing Home Autopilot

Open **House → Existing Home** for a floorplan-free retrofit screening. With no
property evidence, the engine constructs twelve plausible versions of the home across
four construction eras, three footprint complexities and a realistic area range. It
then tests all 255 combinations of roof, wall and floor insulation, air sealing,
secondary glazing, external shading, heat-pump replacement and heat-recovery
ventilation.

Operational heating, cooling and fan energy is evaluated together with the embodied
energy of each retrofit. A package is recommended only when lifecycle savings remain
positive in at least 75% of the plausible-home ensemble. Optional construction-era and
rough-area hints narrow uncertainty, but neither a floorplan nor an image is required.
The browser location button uses the nearest bundled climate preset and does not call a
mapping, imagery or AI API.

## Smart HVAC cycling and thermal-source recovery

Open **House → Smart Cycle** to compare a tight, continuously circulating thermostat
with intermittent compressor control. The deterministic solver searches pulse length,
off time, deadband and capacity, then optionally evaluates suitable outside air,
recovered hot/cold streams and pressure recovery.

The transient room model includes room-air heat capacity, accessible building thermal
mass, envelope conduction, infiltration, internal heat, temperature-dependent COP,
fan/pump/standby power, compressor startup energy, minimum equipment cycle times,
humidity gating and controller/source manufacturing energy. A strategy is recommended
only when it holds the requested comfort band for at least 98% of the simulated period,
respects compressor cycling limits and remains lifecycle-energy positive after
manufacturing.

Ordinary same-pressure injected air receives no expansion-cooling credit. Pressure
recovery is only modelled when an actual gauge pressure and expander efficiency are
supplied, and electricity used to produce the compressed air is charged to the result.

## Adaptive wall and waste-heat feasibility

Open **House -> Adaptive Wall** to determine whether a wall-cavity heat concept
actually lowers lifecycle energy. The transient wall model compares an existing static
wall with a passive microlattice, a switchable microlattice thermal valve, expandable
insulation bladders, and a combined bladder/lattice system. It tracks wall-core
temperature, insulation state, waste-heat export, HVAC load, pumps, switching,
actuation leakage, indoor actuator heat, condensation margin, manufacturing energy,
and energy payback.

No parameter setup is required. Entering the panel automatically evaluates 72
low-discrepancy wall geometries and actuator parameter sets against all 16 controller
strategies (1,152 simulations), applies the best lifecycle result, and shows eight
deliberately diverse ranked candidates. The complete manual assumptions remain under
an optional advanced section for engineering sensitivity checks.

The solver enforces conservation of energy. A microlattice does not destroy heat: in
cooling mode it only helps when it conducts heat to a colder outside or fixed sink. A
passive conductive lattice is also counted as a thermal bridge whenever it bypasses
insulation. Waste heat left inside can reduce heating demand, but adds to cooling
demand. A proposal is accepted only if it reduces operating electricity, avoids the
moisture screen, and repays its embodied energy within the selected design life.

Compute hardware is treated only as an electrical load that becomes heat. The useful
question is whether a measured air or liquid cooling path can move that heat to a real
sink, water store, or heating demand after fan/pump power and manufacturing energy are
charged. Running blockchain validation or any other workload does not absorb heat and
does not receive a special thermodynamic credit.

This is an early feasibility model, not a construction approval. Fire spread,
pressure safety, puncture, drainage, mould, material ageing, structural effects and
site-specific NCC requirements still require measured prototypes and qualified review.

## Interactive 3D physics views

Open **House -> Airflow Sim** for an orbitable room cutaway with the real intake and
exhaust heights, animated flow, stack pressure, airflow rate, air changes per hour and
horizontal temperature layers. Each room automatically sweeps 512 combinations of
intake height, exhaust height, natural or powered flow, airflow rate and vent diameter,
then applies and displays the lowest-objective candidate. Manual height sliders are
kept under an optional override. The existing arrow canvas is retained underneath as
the horizontal plan-view Navier-Stokes field; it is no longer presented as if a
floor-plan axis were height.

The vertical solver uses the room ceiling height, actual vent separation, hydrostatic
stack pressure, powered or natural flow, supply temperature, room heat gains and
mixing to generate a bounded vertical temperature profile. It feeds displacement
effectiveness and flow direction back into the live V12 plan solver. This is a
reduced-order early-design model, not detailed commissioned CFD.

**House -> Adaptive Wall** now also includes an orbitable wall cutaway. It animates
the room heat source, wall layers, microlattice state, expandable insulation bladder
and the real heat-sink path while the numerical optimizer trace plays below it.

When GPU WebGL is unavailable, the same views automatically switch to the built-in
Canvas2D software 3D renderer. Drag orbit, wheel/pinch zoom, animation and the numerical
simulation remain active; WebGL support is an acceleration path rather than a gate.

## Run locally

Requirements: Node.js 20 or newer.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The simulation engine, genetic optimizer, and local neural models are self-contained
and make no external AI API calls. Visitors receive an anonymous workspace identifier
stored in their browser; simulation checkpoints and optimization results are saved to
the app's own persistent data volume without a login. Exact inputs stay in that private
workspace. Coarse climate bands and successful technical designs feed the shared
warm-start archive so later searches can reuse proven candidates without sharing exact
locations or personal information.

## Production deployment

The app includes a production Docker image, a Cloudflare Tunnel Compose service, and
an AWS deployment runbook for `abovebound.org`. See
[DEPLOY_INSTRUCTIONS.md](./DEPLOY_INSTRUCTIONS.md). Cloudflare Pages alone is not
enough because the app uses an Express API, WebSockets, and persistent server state.

## Verify changes

```powershell
npm run test:sims
npm run test:optimizer
npm run test:site
npm run test:existing-home
npm run test:hvac-cycle
npm run test:adaptive-wall
npm run test:height-airflow
npm run test:airflow-network
npm run test:whole-house
npm run test:physics-validation
npm run test:site-context
npm run lint
npm run build
```

Run the complete suite with `npm run test:all`.

`test:sims` instantiates and exercises Fundamental, V0, and every engine from V1 through V13 without requiring WebGL.

## Local state

The Express server stores novelty memory and saved simulation snapshots in `discovery_memory.json`. Novelty memory is deduplicated and capped at 2,048 states. The Save and Load controls persist snapshots through `/api/sim-state/:version`.

If Vite reports a `plugin:vite:react-babel UNKNOWN ... read` error while this repo is under OneDrive, run a working copy from a normal local folder such as `C:\Users\<you>\Projects\beyondboundforreal`. OneDrive file virtualization can interrupt Vite's synchronous source reads.
