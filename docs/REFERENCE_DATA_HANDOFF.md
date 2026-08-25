# Source-audited reference data for Australian housing screening

Prepared 26 August 2026 for AboveBound. This is an evidence handoff, not a
calibration certificate. Every numerical claim below names a document,
publisher, year and page/table locator. Where the requested source boundary was
not found, the value is deliberately `null` / **no reliable source**.

## Model-use contract

1. Do not populate missing terrace or apartment embodied-energy defaults from
   the contextual case studies below.
2. Keep `sourceBoundary`, `includesCommonStructure`, `confidence` and
   `modelUse` attached to every factor presented in the UI or downloaded report.
3. Treat comfort as a constraint and report exceedance independently. Do not
   convert temperature deviation into an invented energy penalty.
4. The solar arithmetic below is a unit/sensitivity check only. It is not an
   annual vertical-window heat-gain model.
5. BESTEST ranges are software-validation targets, not Australian dwelling-load
   benchmarks.

Confidence labels used here:

- **High** — exact value or rule in the cited primary/standards source and a
  matching unit.
- **Medium** — exact published evidence, but the requested archetype or system
  boundary is imperfectly matched.
- **Low for model use** — reproducible single-case context that must not become
  a general default.

## A. Embodied energy

| quantity | value | units | source | year | confidence |
|---|---:|---|---|---:|---|
| Detached house — strict timber-frame / brick-veneer, modern cradle-to-gate A1–A3 range | **No reliable source** meeting all requested conditions | GJ/m² and kWh/m² private dwelling floor | Closest evidence: Bill Randolph, Darren Holloway, Stephen Pullen & Patrick Troy, *The Environmental Impacts of Residential Development: Case Studies of 12 Estates in Sydney*, City Futures Research Centre, UNSW, updated March 2007, pp. 70–75, Table 8.2 | 2007 | Medium confidence in evidence gap |
| Detached house — closest observed Australian range | **6.4 / 6.5 / 7.1** low / median / high; **1,778 / 1,806 / 1,972** | GJ/m²; kWh/m² dwelling floor | Randolph et al., City Futures/UNSW, *The Environmental Impacts of Residential Development*, updated 2007, pp. 70–75, Table 8.2. Median calculated from the eight detached-estate entries. kWh conversion uses the exact identity 1 kWh = 3.6 MJ | 2007 | Medium |
| Detached common structure treatment | No shared structure; garage area is included in the study floor-area denominator | scope | Randolph et al., City Futures/UNSW, updated 2007, pp. 70–75 and Table 8.2 | 2007 | Medium |
| Mid-row terrace / townhouse — qualifying range | **No reliable source**. The Sydney study's Kings Bay result combines townhouses and apartments and cannot isolate a mid-row dwelling | GJ/m² and kWh/m² private dwelling floor | Randolph et al., City Futures/UNSW, updated 2007, pp. 71–72 and Table 8.2 | 2007 | Medium confidence in evidence gap |
| Low-rise apartment, 3–5 storeys — qualifying inclusive range | **No reliable source** in the requested cradle-to-gate, private-dwelling-floor boundary | GJ/m² and kWh/m² private dwelling floor | No qualifying range in the audited Australian sources. The nearest single case is Roger Brewster, *Sustainable Urban Residential Forms in an Oil-constrained Future*, Bond University PhD thesis, pp. 165–167, Tables 5.3–5.4 | 2017 | Medium confidence in evidence gap |
| Low-rise apartment — inclusive single-case context only | **24.29 GJ/m²; 6,747 kWh/m²**. Derived from **3,943 GJ / 162.3 m²** private apartment area. Allocation includes **75.4 m²** share of foyers, ground floor and parking. Boundary is broader than A1–A3 | GJ/m²; kWh/m² private dwelling floor | Roger Brewster, *Sustainable Urban Residential Forms in an Oil-constrained Future*, Bond University, 2017, pp. 165–167, Tables 5.3–5.4 | 2017 | Low for model use; high arithmetic confidence |
| Low-rise apartment — exclusive of common structure | **No reliable source**; Brewster allocates common areas but does not publish a dwelling-only embodied-energy split | GJ/m² and kWh/m² private dwelling floor | Brewster, Bond University, 2017, pp. 165–167, Tables 5.3–5.4 | 2017 | Medium confidence in evidence gap |
| Tower apartment, 15+ storeys — qualifying inclusive range | **No reliable source** in the requested cradle-to-gate, private-dwelling-floor boundary | GJ/m² and kWh/m² private dwelling floor | No qualifying range in the audited Australian sources. The nearest single case is Brewster, Bond University, pp. 181–182, Tables 5.10–5.11 | 2017 | Medium confidence in evidence gap |
| Tower apartment — inclusive single-case context only | **24.84 GJ/m²; 6,900 kWh/m²**. Derived from **3,075 GJ / 123.8 m²** apartment area including balcony. Allocation includes **62.6 m²** share of core, basements, ground common area and roof terrace. Boundary is broader than A1–A3 | GJ/m²; kWh/m² private dwelling floor | Brewster, Bond University, 2017, pp. 181–182, Tables 5.10–5.11 | 2017 | Low for model use; high arithmetic confidence |
| Tower apartment — exclusive of common structure | **No reliable source**; the case allocates common areas but does not publish a dwelling-only embodied-energy split | GJ/m² and kWh/m² private dwelling floor | Brewster, Bond University, 2017, pp. 181–182, Tables 5.10–5.11 | 2017 | Medium confidence in evidence gap |

Source documents:

- [UNSW residential-development report](https://www.be.unsw.edu.au/sites/default/files/upload/FinalLandcomEnergyandWaterReport.pdf)
- [Brewster, Bond University thesis](https://pure.bond.edu.au/ws/portalfiles/portal/36143002/Roger_Brewster_Thesis.pdf)

### Required representation in the model

The only candidate for a provisional Australian screening range is the UNSW
detached-house series, and it must be labelled `initial as-built materials`, not
modern EN 15978 A1–A3. Terrace and apartment qualifying defaults should remain
`null`. The apartment single cases may appear in an evidence inspector but must
have `modelUse: false`.

## B. Comfort criteria

| quantity | value | units | source | year | confidence |
|---|---:|---|---|---:|---|
| ASHRAE 55 mechanically conditioned comfort band | **−0.5 ≤ PMV ≤ +0.5**; approximately **90%** thermal acceptability before separate local-discomfort checks | PMV; % | ASHRAE, *ANSI/ASHRAE Addenda o, p, q to Standard 55-2010*, p. 6 §7.4.2.2.1 and p. 7 | 2013 | High |
| ASHRAE fixed operative-temperature deviation for a fixed share of occupied hours | **No reliable source**. The standard does not prescribe a universal ±X K for Y% of occupied hours | K; % occupied hours | ASHRAE, *Addenda o, p, q to Standard 55-2010*, p. 14, Informative Appendix Y: exceedance metrics are described, but no limits are prescribed or recommended | 2013 | High |
| EN 16798-1 Category II default | **−0.5 < PMV < +0.5**; residential design operative temperatures **20°C heating / 26°C cooling** | PMV; °C | CEN, *EN 16798-1:2019 Energy performance of buildings—Ventilation for buildings—Part 1*, Annex B, pp. 44–45, Tables B.1–B.2 | 2019 | High |
| EN 16798-1 accepted annual exceedance | No universal percentage; it must be specified by the project or national method | % occupied hours | CEN, *EN 16798-1:2019*, p. 25, §§7.1 and 7.2.3 | 2019 | High |
| NatHERS heating thermostat schedules | **20°C** living/kitchen/day zones and conditioned garage; **18°C** bedroom/night zones. No universal ±X K for Y% pass criterion | °C | NatHERS Administrator, DCCEEW, *NatHERS Whole of Home Calculations Method for new and existing homes*, version 20250626, p. 27 §3.2.6, Table 3 | 2025 | High |
| Comfort deviation converted to energy penalty | **No accepted direct conversion**. Temperature-hours or PMV-hours may be reported separately, but ASHRAE sets no required limit | temperature·h or PMV·h | ASHRAE, *Addenda o, p, q to Standard 55-2010*, p. 14, Informative Appendix Y | 2013 | High |
| Screening implementation | Test the selected PMV/category constraint at each occupied timestep; report exceedance hours and degree-hours separately from energy | model policy | Derived from ASHRAE 55 Addenda o/p/q, pp. 6–7 and 14; CEN EN 16798-1:2019, p. 25 and Annex B | 2013; 2019 | High |

Source documents:

- [ASHRAE 55-2010 Addenda o, p and q](https://www.ashrae.org/file%20library/technical%20resources/standards%20and%20guidelines/standards%20addenda/55_2010_opq_final_08012013.pdf)
- [EN 16798-1:2019](https://cdn.standards.iteh.ai/samples/41425/b93918356f7346248f36f4a48228a7da/SIST-EN-16798-1-2019.pdf)
- [NatHERS Whole of Home Calculations Method v20250626](https://www.nathers.gov.au/sites/default/files/2025-07/NatHERS%20Whole%20of%20Home%20Calculation%20Method%20v20250626.pdf)

## C. Solar gain inputs and arithmetic check

| quantity | value | units | source | year | confidence |
|---|---:|---|---|---:|---|
| Typical glazing-to-floor ratio in an Australian 6-star design sample | **19.9–27.9** across reported climate locations; Victorian entries are Mildura **19.9** and Tullamarine **22.4** | % net conditioned floor area | Tony Isaacs, *A review of industry feedback and approaches to upgrading to 7-star building fabric*, Tony Isaacs Consulting for the Australian Building Codes Board, p. 25, Table 8 | 2022 | High for sample; medium nationally |
| NCC Volume Two dwelling-wide energy glazing minimum | **No dwelling-wide minimum.** The separate daylight rule requires windows of at least **10%** of each habitable room floor area, or rooflights of at least **3%** | % of each habitable room floor area | Australian Building Codes Board, *NCC 2022 Housing Provisions Standard*, p. 267, Part 10.5, Clause 10.5.1 | 2022 | High |
| Standard residential glazing | **0.75** for single clear glazing in a standard aluminium frame | whole-system SHGC | pitt&sherry for the Australian Government Department of Climate Change and Energy Efficiency, *Pathway to 2020 for Increased Stringency in New Building Energy Efficiency Standards: Benefit Cost Analysis*, p. 93, Table A3.9 | 2012 | High for modelled system |
| Improved residential glazing | **0.44–0.64** across the listed improved systems; single low-e in a standard aluminium frame is **0.52** | whole-system SHGC | pitt&sherry / DCCEE, *Pathway to 2020... Benefit Cost Analysis*, p. 93, Table A3.9 | 2012 | High for modelled systems |
| Victorian solar-exposure reference | **16.6** mean daily horizontal solar exposure; **6,059** annual horizontal exposure | MJ/m²·day; MJ/m²·year | Australian Bureau of Meteorology, *Climate statistics for Australian locations—Avoca (Post Office)*, site 081000, Climate Data Online, annual row “Mean daily solar exposure”; annual arithmetic is 16.6 × 365 | 1990–2026 observations | High for station statistic |
| Horizontal-equivalent transmitted gain, standard glazing | **1,017.91 MJ/m² floor·year; 282.75 kWh/m² floor·year** from **6,059 × 0.224 × 0.75** | MJ/m² floor·year; kWh/m² floor·year | Derived from BOM Avoca site 081000; Isaacs/ABCB 2022 p. 25 Table 8; pitt&sherry/DCCEE 2012 p. 93 Table A3.9; 1 kWh = 3.6 MJ | 2012; 2022; 1990–2026 | High arithmetic; low physical applicability |
| Horizontal-equivalent transmitted gain, improved glazing | **597.18–868.62 MJ/m² floor·year; 165.88–241.28 kWh/m² floor·year** from **6,059 × 0.224 × SHGC 0.44–0.64** | MJ/m² floor·year; kWh/m² floor·year | Derived from the same BOM, Isaacs/ABCB and pitt&sherry/DCCEE sources | 2012; 2022; 1990–2026 | High arithmetic; low physical applicability |
| Actual annual gain through vertical windows | **No reliable value from horizontal exposure alone** | MJ/m² floor·year | Method limitation: the cited inputs do not provide hourly direct/diffuse vertical irradiance, façade orientation, horizon, self/external shading or angular glazing response | — | High |

Declared assumptions for the arithmetic check are an equal façade split and no
external shading. These are scenario assumptions, not measured Australian
practice. The production equation must instead be:

`Q_solar / A_floor = Σ(H_vertical,orientation × A_glazing,orientation / A_floor × SHGC × F_shade,orientation)`

with hourly direct/diffuse transposition and solar/shadow geometry.

Source documents:

- [Isaacs/ABCB window-ratio review](https://www.abcb.gov.au/sites/default/files/resources/2022/Energy%202022%20RIS%20-%20TIC%20Industry%20Consultation%20on%20Building%20Fabric%20Costs.pdf)
- [NCC 2022 Housing Provisions](https://ncc.abcb.gov.au/sites/default/files/resources/2025/ncc2022-abcb-housing-provisions.pdf)
- [Australian Government glazing-system analysis](https://www.energy.gov.au/sites/default/files/pathway-2020-increase-stringency-new-building-energy-efficiency-standards-benefit-cost-analysis-residential-update-2016.pdf)
- [BOM Avoca site 081000 climate statistics](https://www.bom.gov.au/climate/averages/tables/cw_081000_All.shtml)

## D. ASHRAE Standard 140 / BESTEST acceptance ranges

| quantity | value | units | source | year | confidence |
|---|---:|---|---|---:|---|
| Case 600 annual heating | **3.75–4.98** | MWh/year | ASHRAE/IBPSA, *ANSI/ASHRAE/IBPSA Addendum a to ANSI/ASHRAE Standard 140-2023*, p. 3, Table A3-1 | 2025 | High |
| Case 600 annual sensible cooling | **5.00–6.83** | MWh/year | ASHRAE/IBPSA, *Addendum a to Standard 140-2023*, p. 3, Table A3-1 | 2025 | High |
| Case 900 annual heating | **1.04–2.28** | MWh/year | ASHRAE/IBPSA, *Addendum a to Standard 140-2023*, p. 5, replacement high-mass annual-load table shown as Table A3-4 in the redline | 2025 | High |
| Case 900 annual sensible cooling | **2.35–2.60** | MWh/year | ASHRAE/IBPSA, *Addendum a to Standard 140-2023*, p. 5, replacement high-mass annual-load table shown as Table A3-4 in the redline | 2025 | High |

Source document:

- [ASHRAE/IBPSA Standard 140-2023 Addendum a](https://www.ashrae.org/file%20library/technical%20resources/standards%20and%20guidelines/standards%20addenda/140_2023_a_20250829.pdf)

## Recommended implementation order

1. Add the four BESTEST ranges to the external benchmark harness as exact test
   acceptance bands.
2. Replace any comfort-deviation energy penalty with a hard/soft constraint plus
   separately reported occupied exceedance hours and degree-hours.
3. Mark all current terrace/apartment embodied factors as assumptions until a
   qualifying source or product-EPD bill of quantities is available.
4. Keep the UNSW detached range behind an evidence label describing its older
   `initial as-built materials` boundary.
5. Replace horizontal-equivalent solar arithmetic with façade-resolved hourly
   weather and the existing sun/shadow geometry.

