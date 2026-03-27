# Fetch Legislation Script

This script automates the process of:
1. Downloading all bills from a given Oregon legislative session
2. Storing raw data in JSON format
3. Using Claude API to classify bills as housing-related
4. Creating markdown files for housing-related legislation

## Data Source

This script uses the **Oregon Legislature OData API**, which provides free access to all legislative data:
- **API Endpoint**: https://api.oregonlegislature.gov/odata/odataservice.svc/
- **Documentation**: https://www.oregonlegislature.gov/citizen_engagement/Pages/data.aspx
- **Support**: Leg.Helpdesk@oregonlegislature.gov or 1-800-332-2313

## Prerequisites

- Node.js and pnpm installed
- `ANTHROPIC_API_KEY` set in your `.env` file

## Usage

### Fetch and classify legislation for a year

```bash
pnpm fetch-legislation 2025
```

This will:
- Fetch all bills from the 2025 regular session (2025R1)
- Save raw data to `content/legislation/2025/data/legislation-2025R1.json`
- Classify each bill using Claude API
- Create markdown files in `content/legislation/2025/` for housing-related bills

### Specify a different session

For special sessions, use the `--session` flag:

```bash
pnpm fetch-legislation 2024 --session=S1
```

This fetches bills from the 2024 special session (2024S1).

### Skip classification (download only)

To download bills without classification:

```bash
pnpm fetch-legislation 2023 --skip-classification
```

This only downloads and saves raw data to JSON without creating markdown files.

## Output

### Person Pages

The script automatically creates person pages for sponsors of **housing-related bills only** in `content/people/`:

```markdown
+++
title = 'Anna Scharf'
date = '2024-01-01'
+++

# Anna Scharf

[AI-generated 2-3 paragraph biography based on public information]

## Key Housing Actions

_This page was auto-generated. Please add housing-related legislative actions with internal links._
```

**Features:**
- AI-generated biographies using Claude Haiku
- Only created for sponsors of housing-related bills
- Existing person pages are not overwritten

### JSON Data File

Raw bill data is saved to `content/legislation/<year>/data/legislation-{sessionCode}.json`:

```json
[
  {
    "billNumber": "HB2258",
    "title": "Relating to housing",
    "summary": "Requires LCDC to adopt rules...",
    "url": "https://olis.oregonlegislature.gov/liz/2025R1/Measures/Overview/HB2258",
    "introduced": "2025-01-15",
    "chamber": "House",
    "status": "In Committee"
  }
]
```

### Markdown Files

Housing-related bills create files like `content/legislation/2024/hb-4134.md`:

```markdown
+++
title = 'HB 4134'
date = '2024-01-19'
+++

# HB 4134

Requires LCDC to adopt rules for local governments to expedite housing approvals.

[Original Bill Text](https://olis.oregonlegislature.gov/liz/2024R1/Measures/Overview/HB4134)

## Sponsors

**Chief Sponsors:** [Rep. Wallan](/people/rep-wallan), [Sen. Jama](/people/sen-jama)

**Co-Sponsors:** [Rep. Levy B](/people/rep-levy-b), [Rep. Fahey](/people/rep-fahey)

## Overview

...
```

**Features:**
- Sponsors are automatically linked to their person pages
- Chief sponsors and co-sponsors are listed separately
- Person pages are created automatically if they don't exist

## Filling Gaps Since 2010

To ensure complete coverage of housing legislation since 2010, run the script for each year:

```bash
# Regular sessions (odd years)
pnpm fetch-legislation 2011
pnpm fetch-legislation 2013
pnpm fetch-legislation 2015
pnpm fetch-legislation 2017
pnpm fetch-legislation 2019
pnpm fetch-legislation 2021
pnpm fetch-legislation 2023
pnpm fetch-legislation 2025

# Even years may have special sessions
pnpm fetch-legislation 2020 --session=S1
pnpm fetch-legislation 2024 --session=S1
```

## How It Works

The script uses the **Oregon Legislature OData API** to get all data in a single request:

1. **Fetches all measures from API**: `https://api.oregonlegislature.gov/odata/odataservice.svc/Measures`
   - Gets complete bill list for the session in one API call
   - Includes all needed data: bill number, title, summary, status, dates

2. **Saves to JSON** in `content/legislation/<year>/data/`

3. **Classifies bills** using Claude API (optional)
   - Identifies housing-related bills
   - Creates markdown files for housing bills
   - Generates person pages with AI bios for sponsors of housing bills

This approach is:
- **Fast**: Single API call gets everything (~5 seconds)
- **Reliable**: Uses official Oregon Legislature API
- **Accurate**: Only includes bills that actually exist
- **Simple**: No web scraping, no caching needed

## Notes

- Single API call fetches all bills - no rate limiting concerns
- Existing markdown files are not overwritten
- Classification uses Claude Haiku 4.5 for cost-effectiveness
- Bills are classified based on topics like: zoning, affordable housing, rent control, ADUs, homelessness, etc.
- JSON data files are committed to the repository for reference
