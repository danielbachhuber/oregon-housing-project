+++
title = 'Career Mastermind: Oregon Housing Project'
date = '2026-02-16'
layout = 'single'
extra_js = ['/js/presentations/career-mastermind-charts.js']
+++

## Oregon needs more housing

<p style="font-weight: bold; font-size: 0.7em; margin-bottom: 0.2em;">Oregon's housing deficit</p>

<div style="height: 40vh; width: 80%; margin: 0 auto;">
<canvas id="underproduction-chart"></canvas>
</div>

<div style="height: 10vh; width: 80%; margin: 0.5em auto 0;">
<canvas id="drivers-chart"></canvas>
</div>

<p style="font-size: 0.4em; color: #999; margin-top: 0.3em;">Sources: Up for Growth 2024; OHNA 2026 Results Report</p>

<aside class="notes">
CHART DATA: Up for Growth, "Housing Underproduction in the U.S." 2024 report, state-level dataset (https://upforgrowth.org/apply-the-vision/housing-underproduction-reports/). "Units needed" = total housing units + estimated underproduction. "Units built" = total housing units from Census data. The gap between the two lines is the underproduction estimate.

METHODOLOGY: Underproduction is calculated using the Up for Growth methodology, which Oregon's OHNA adopted (OHNA 2026 Results Report, p. 5, Figure 4). It compares the target number of housing units a market should have (based on households, missing household formation since 2000, and uninhabitable units) against actual units available for year-round occupancy. Regions where demand exceeds supply are experiencing underproduction.

KEY NUMBERS: The gap grew from ~34,000 units in 2012 to ~88,000 in 2018. By 2022 it was ~78,000 (Up for Growth 2024 dataset, "States" tab). The 2026 OHNA estimates current statewide underproduction at 50,191 units (OHNA 2026 Results Report, p. 29, Figure 15), with a total 20-year need of 491,347 units and an annual production target of 29,359 units (OHNA 2026 Results Report, p. 28). Oregon ranked 3rd-8th worst among all states for underproduction as a share of housing stock from 2012-2022 (Up for Growth 2024 dataset, "States" tab, RANK_BY_UNDERPRODUCTION_SHARE_OF_UNITS column).

KEY DRIVERS (OHNA 2026 Results Report, p. 30, Figure 15):
- Population growth: 242,675 units (49%) — Oregon's population continues to grow, requiring new housing
- Demographic change: 135,718 units (28%) — Aging population, smaller household sizes shifting demand
- Underproduction backlog: 50,191 units (10%) — Accumulated deficit from years of building below demand
- Homelessness: 45,637 units (9%) — Units needed to house people currently experiencing homelessness
- Second/vacation homes: 17,126 units (3%) — Housing stock lost to non-primary-residence use

SOURCES:
- Up for Growth, "Housing Underproduction in the U.S." 2024 dataset (XLSX), States sheet
- Oregon Housing Needs Analysis 2026 Production Targets and Adopted Methodology (December 2025), Oregon Dept. of Administrative Services, Office of Economic Analysis
</aside>

---

## Fortunately, I can build websites

<div style="display: flex; gap: 2em; align-items: flex-start;">
<div style="flex: 1;">

![Oregon Housing Project](/presentations/images/oregonhousingproject-screenshot.png)

</div>
<div style="flex: 1; font-size: 0.7em;">

- Cataloged every housing-related bill from 2019–2026 with sponsors, history, and testimony
- GitHub Actions fetch new bills daily and scan three news outlets for housing articles
- Claude classifies bills, drafts summaries, refines city profiles, and reviews PRs

</div>
</div>

---

## What worked, what didn't

<div style="font-size: 0.75em;">

- ✅ Claude Code and spinning up multiple terminal windows
- ✅ So fun I could easily lose hours working on it
- ✅ GitHub workflows to monitor for legislation updates and news coverage
- ❌ GitHub Copilot was meh — no access to my Anthropic API key
- ❌ Failed to use ClawdBot to work on the go
- ❌ No clear audience for the website
- ❌ Didn't figure out running agents in the background continously

</div>
