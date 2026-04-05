# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Oregon Housing Project is a research-focused website about housing policy in Oregon. It uses Hugo (a static site generator) to publish in-depth research and analysis on housing legislation, key people, cities, and concepts. The project is biased towards the view that Oregon isn't building enough housing, housing is too expensive, and some regulations are counter-productive. See `content/_index.md` for more detail about its aims.

**This is a research project, not a software development project.** When reviewing or contributing to this project, focus on accuracy, conciseness, quality of analysis, and proper sourcing rather than code quality.

## Content Architecture

### Content Types

The site is organized around five main content types:

1. **Legislation** (`content/legislation/`): Bills, executive orders, and ballot measures organized by legislative session
   - Example: `content/legislation/2025-regular-session/hb-2258.md`
   - Should include: title, date, description, and link to original bill text
   - Use internal links to reference related legislation, people, and cities

2. **People** (`content/people/`): Politicians and policymakers involved in housing policy
   - Template guidance in `templates/person.md`
   - Should list key housing-related actions with internal links to relevant legislation

3. **Cities** (`content/cities/`): Individual Oregon cities and their housing situations
   - Template guidance in `templates/city.md`
   - Should include: Overview, Housing Statistics, Zoning and Land Use, Buildable Land, Recent Housing Developments, Key Housing Challenges, Local Housing Policies
   - Must cite all sources using footnote format

4. **News Coverage** (`content/news-coverage/`): Media coverage of housing policy developments organized by year
   - Example: `content/news-coverage/2026/anderson-seeks-prevailing-wage-reforms.md`
   - Template guidance in `templates/news-coverage.md`
   - Front matter must include: title, date, source, original_url, author
   - Content should be a single paragraph summary (3-5 sentences)
   - Must include internal links to related legislation, people, and cities
   - List template at `layouts/news-coverage/list.html` automatically displays articles in reverse chronological order

5. **Key Concepts** (`content/key-concepts.md`): Educational content explaining housing policy terms

### Front Matter

All content files use Hugo front matter with TOML format:

```toml
+++
title = 'Page Title'
date = '2026-01-23'
+++
```

### Internal Linking

Always use Hugo's internal linking format when referencing other pages:
- Legislation: `[HB 2001 (2019)](/legislation/2019-regular-session/hb-2001)`
- People: `[Tina Kotek](/people/tina-kotek)`
- Cities: `[Tualatin](/cities/tualatin)`

### Citations

Research pages should include comprehensive footnote citations:

```markdown
According to the 2019 Housing Needs Analysis, Tualatin has 96 buildable acres.[^8]

[^8]: [City of Tualatin Housing Needs Analysis](https://www.tualatinoregon.gov/...)
```

Download a copy of documents to the files directory as relevant.

## Using Repository Content as Source Material

When researching or refining any content (people, legislation, cities, etc.), **search the repository first** before relying solely on web searches. This repository contains thousands of primary source documents that are more reliable and specific than web results.

### How to Find Relevant Sources

1. **Search existing content pages** with Grep for the person, bill, or topic name across `content/`. These markdown files often contain curated summaries, citations, and internal links that are directly useful.

2. **Search legislation PDF testimony and documents.** Legislation directories (e.g., `content/legislation/2025-regular-session/files/hb-2258/`) contain PDFs of testimony, staff reports, amendments, and fiscal analyses. Use Glob to find PDFs under a bill's files directory, then read relevant ones. These are organized by OLIS document ID (numeric filenames like `6219.pdf`).

3. **Search news coverage** in `content/news-coverage/` for summaries of media articles that may mention the topic.

4. **Search meeting transcripts** in `content/state/dlcd/meetings/` and `content/cities/*/meetings/` for discussions that reference the topic.

### Reading PDFs

The repository contains ~23,000 PDFs, mostly legislative testimony and documents. Claude Code can read PDFs directly with the Read tool (up to 20 pages per request). When a PDF is large, use the `pages` parameter to read specific page ranges. Look at the first few pages to determine relevance before reading the full document.

## YouTube Video Capture

### Manual Capture

To capture a single YouTube video:

```bash
pnpm capture-youtube -- <youtube-url> [--type news-coverage|meeting|research] [--entity dlcd|tualatin] [--date YYYY-MM-DD]
```

This fetches the transcript, cleans it with Claude, generates a summary, and creates a Hugo markdown file. It also runs `refine-internal-links` on the output.

### Automated Workflow

The `fetch-youtube-accounts` workflow (`.github/workflows/fetch-youtube-accounts.yml`) runs daily to discover new videos from configured YouTube accounts:

- **@HFOInvestmentRealEstate** → news coverage (`content/news-coverage/`)
- **@OregonDLCD** → DLCD meetings (`content/state/dlcd/meetings/`)

Videos published within the last 6 weeks are processed. Each new video gets its own PR. Processed URLs are tracked in `content/news-coverage/data/processed-youtube-{account}-urls.txt`.

### Supported Meeting Entities

- **dlcd**: Oregon DLCD meetings → `content/state/dlcd/meetings/dlcd-YYYY-MM-DD.md`
- **tualatin**: Tualatin Planning Commission meetings → `content/cities/tualatin/meetings/YYYY-MM-DD-planning-commission.md`

### Adding New YouTube Accounts

1. Add account configuration to `scripts/fetch-youtube-accounts.ts` (id, channelId, captureArgs)
2. Add the account id to the matrix in `.github/workflows/fetch-youtube-accounts.yml`

### Adding New Meeting Entities

1. Add entity configuration to `scripts/capture-youtube.ts` ENTITY_CONFIGS
2. Create content directory structure

## Scripting Language

When writing new scripts or rewriting existing ones, **prefer JavaScript (Node.js)** over Python.

## Package Management

This project uses **PNPM** as its package manager. Always use `pnpm` commands for package management:
- Install dependencies: `pnpm install`
- Add a package: `pnpm add <package-name>`
- Add a dev dependency: `pnpm add -D <package-name>`
- Run scripts: `pnpm <script-name>`

**Do NOT use NPM** commands (`npm install`, etc.) as this will create conflicting lock files.

## Running the Site

This project uses **Hugo** as its static site generator. To run the development server:

```bash
hugo server
```

This will start a local development server at `http://localhost:1313/`. If port 1313 is already in use (e.g., another worktree's Hugo server is running), Hugo will automatically select the next available port.

## Git Worktrees

When creating a worktree (via the `EnterWorktree` tool or otherwise), always initialize submodules and copy the `.env` file immediately after:

```bash
git submodule update --init
cp /Users/danielbachhuber/projects/oregon-housing-project/.env .env
pnpm install
```

- `git submodule update --init`: The site depends on the `themes/hugo-book` submodule and Hugo will fail to build without it.
- `cp .../.env .env`: Copies the `.env` file from the main repo (not committed to git).
- `pnpm install`: Installs Node dependencies in the new worktree.

## LLM-Assisted Research

The project explicitly uses LLMs (Gemini, Claude) for research, drafting, editing, and infographics. All AI-generated content receives human review before publication. This is documented in the About page.

## GitHub Actions Integration

The repository has two Claude Code GitHub Actions workflows:

1. **Claude PR Assistant** (`.github/workflows/claude.yml`): Triggered when `@claude` is mentioned in issues or PR comments. Has access to WebSearch.

2. **Claude Code Review** (`.github/workflows/claude-code-review.yml`): Automatically reviews pull requests using the code-review plugin.

