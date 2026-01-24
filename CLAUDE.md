# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Oregon Housing Project is a research-focused website about housing policy in Oregon. It uses Hugo (a static site generator) to publish in-depth research and analysis on housing legislation, key people, cities, and concepts. The project is biased towards the view that Oregon isn't building enough housing, housing is too expensive, and some regulations are counter-productive. See `content/about.md` for more detail about its aims.

**This is a research project, not a software development project.** When reviewing or contributing to this project, focus on accuracy, conciseness, quality of analysis, and proper sourcing rather than code quality.

## Content Architecture

### Content Types

The site is organized around four main content types:

1. **Legislation** (`content/legislation/`): Bills, executive orders, and ballot measures organized by year
   - Example: `content/legislation/2025/hb-2258.md`
   - Should include: title, date, description, and link to original bill text
   - Use internal links to reference related legislation, people, and cities

2. **People** (`content/people/`): Politicians and policymakers involved in housing policy
   - Template guidance in `templates/person.md`
   - Should list key housing-related actions with internal links to relevant legislation

3. **Cities** (`content/cities/`): Individual Oregon cities and their housing situations
   - Template guidance in `templates/city.md`
   - Should include: Overview, Housing Statistics, Zoning and Land Use, Buildable Land, Recent Housing Developments, Key Housing Challenges, Local Housing Policies
   - Must cite all sources using footnote format

4. **Key Concepts** (`content/key-concepts.md`): Educational content explaining housing policy terms

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
- Legislation: `[HB 2001](/legislation/2019/hb-2001)`
- People: `[Tina Kotek](/people/tina-kotek)`
- Cities: `[Tualatin](/cities/tualatin)`

### Citations

Research pages should include comprehensive footnote citations:

```markdown
According to the 2019 Housing Needs Analysis, Tualatin has 96 buildable acres.[^8]

[^8]: [City of Tualatin Housing Needs Analysis](https://www.tualatinoregon.gov/...)
```

Download a copy of documents to the files directory as relevant.

## LLM-Assisted Research

The project explicitly uses LLMs (Gemini, Claude) for research, drafting, editing, and infographics. All AI-generated content receives human review before publication. This is documented in the About page.

## GitHub Actions Integration

The repository has two Claude Code GitHub Actions workflows:

1. **Claude PR Assistant** (`.github/workflows/claude.yml`): Triggered when `@claude` is mentioned in issues or PR comments. Has access to WebSearch.

2. **Claude Code Review** (`.github/workflows/claude-code-review.yml`): Automatically reviews pull requests using the code-review plugin.

