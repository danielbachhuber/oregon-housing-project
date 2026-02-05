# Oregon Housing Project - Copilot Instructions

This is a research-focused website about housing policy in Oregon using Hugo (a static site generator). The project is biased towards the view that Oregon isn't building enough housing, housing is too expensive, and some regulations are counter-productive.

**This is a research project, not a software development project.** When reviewing or contributing to this project, focus on accuracy, conciseness, quality of analysis, and proper sourcing rather than code quality.

## Code Standards

### Development Flow

- **Build**: `hugo server` - Start Hugo development server
- **Test**: Hugo doesn't require traditional tests, validate by viewing site locally
- **Scripts**: Use `pnpm install` for TypeScript dependencies, then `pnpm run find-housing-articles` to run article finder

### Python Scripts

The project includes meeting transcription tools. Install dependencies with:

```bash
pip install -r scripts/requirements.txt
```

Process meetings using:

```bash
./scripts/process_meeting.sh \
  --url "https://www.youtube.com/watch?v=VIDEO_ID" \
  --date "YYYY-MM-DD" \
  --entity "dlcd" \
  --cleanup
```

## Repository Structure

- `content/`: Hugo content organized by type
  - `legislation/YYYY/`: Bills, executive orders, ballot measures by year
  - `people/`: Politicians and policymakers
  - `cities/`: Oregon cities and their housing situations
  - `news-coverage/YYYY/`: Media coverage organized by year
  - `key-concepts.md`: Educational content on housing policy terms
- `templates/`: Content templates for consistency
  - `legislation.md`, `person.md`, `city.md`, `news-coverage.md`, `meeting.md`
- `scripts/`: Python and TypeScript automation tools
- `layouts/`: Hugo templates for rendering
- `themes/`: Hugo theme (hugo-book)
- `CLAUDE.md`: Additional instructions for Claude Code

## Content Creation Guidelines

### Front Matter Format

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

Research pages must include comprehensive footnote citations:

```markdown
According to the 2019 Housing Needs Analysis, Tualatin has 96 buildable acres.[^8]

[^8]: [City of Tualatin Housing Needs Analysis](https://www.tualatinoregon.gov/...)
```

Download copies of referenced documents to the files directory when relevant.

### Content Type Guidelines

1. **Legislation**: Include title, date, description, and link to original bill text. Use internal links to reference related legislation, people, and cities.

2. **People**: List key housing-related actions with internal links to relevant legislation. Follow template at `templates/person.md`.

3. **Cities**: Include Overview, Housing Statistics, Zoning and Land Use, Buildable Land, Recent Housing Developments, Key Housing Challenges, Local Housing Policies. Must cite all sources. Follow template at `templates/city.md`.

4. **News Coverage**: Front matter must include title, date, source, original_url, author. Content should be a single paragraph summary (3-5 sentences) with internal links. Follow template at `templates/news-coverage.md`.

5. **Meeting Transcripts**: After automatic generation, add summary (2-4 paragraphs), identify key topics, add internal links, review transcript, and add citations. Follow template at `templates/meeting.md`.

## Key Guidelines

1. Focus on research quality, accuracy, and proper sourcing
2. Maintain existing content structure and organization
3. Use internal links extensively to connect related content
4. Include comprehensive citations for all claims
5. Follow content templates for consistency
6. The project explicitly uses LLMs for research assistance - all AI-generated content receives human review
7. Do not add build tools, linters, or testing infrastructure - this is a content project
8. When editing Python scripts, ensure compatibility with existing workflow
9. Update relevant templates when changing content standards
