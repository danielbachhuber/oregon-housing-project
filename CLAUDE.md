# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Oregon Housing Project is a research-focused website about housing policy in Oregon. It uses Hugo (a static site generator) to publish in-depth research and analysis on housing legislation, key people, cities, and concepts. The project is biased towards the view that Oregon isn't building enough housing, housing is too expensive, and some regulations are counter-productive. See `content/about.md` for more detail about its aims.

**This is a research project, not a software development project.** When reviewing or contributing to this project, focus on accuracy, conciseness, quality of analysis, and proper sourcing rather than code quality.

## Content Architecture

### Content Types

The site is organized around five main content types:

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

## Meeting Transcription Framework

The project includes automated tools for downloading, transcribing, and publishing meeting videos from YouTube. Meetings are organized by jurisdiction with structured documentation.

### Supported Entities

- **dlcd**: Oregon DLCD meetings → `content/state/meetings/YYYY-MM-DD-dlcd.md`
- **tualatin**: Tualatin Planning Commission meetings → `content/cities/tualatin/meetings/YYYY-MM-DD-planning-commission.md`

### Processing Workflow

Use the orchestrator script to process a meeting in one step:

```bash
./scripts/process_meeting.sh \
  --url "https://www.youtube.com/watch?v=VIDEO_ID" \
  --date "YYYY-MM-DD" \
  --entity "dlcd" \
  --cleanup
```

This will:
1. Download video from YouTube to `/tmp/oregon-housing-meetings/`
2. Transcribe using OpenAI Whisper (medium model by default)
3. Generate Hugo markdown document with TOML front matter
4. Optionally delete video file after processing (with `--cleanup`)

Individual scripts can also be run separately:
- `scripts/download_meeting.py` - Download video
- `scripts/transcribe_meeting.py` - Transcribe video
- `scripts/create_meeting_doc.py` - Create Hugo document

### Meeting Document Structure

Generated meeting documents include:

1. **Front matter**: title, date, youtube_url, meeting_type, entity
2. **Summary**: Empty, requires manual curation
3. **Key Topics**: Empty, requires manual curation
4. **Full Transcript**: Auto-generated with timestamps

### Post-Processing Requirements

After automatic generation, meeting documents require human review:

1. **Add Summary**: 2-4 paragraph overview of key decisions, action items, and discussions
2. **Identify Key Topics**: Organize main discussion points with descriptive headings
3. **Add Internal Links**: Link to related legislation, people, cities, and key concepts
4. **Review Transcript**: Check for obvious errors (transcripts may contain minor inaccuracies)
5. **Add Citations**: Include footnotes for documents or data mentioned in the meeting

See `templates/meeting.md` for detailed structure guidance.

### Technical Details

- **Video Storage**: Videos downloaded to `/tmp/oregon-housing-meetings/` (never committed to repo)
- **Transcription**: Uses OpenAI Whisper with configurable model size (tiny, base, small, medium, large)
- **Timestamps**: Transcript includes HH:MM:SS timestamps for reference
- **Dependencies**: Install with `pip install -r scripts/requirements.txt` (requires yt-dlp, openai-whisper, and ffmpeg)

### Adding New Entities

To add support for a new jurisdiction:
1. Update `scripts/create_meeting_doc.py` with new entity configuration
2. Add entity to `--entity` choices in all three scripts
3. Create content directory structure
4. Update this documentation

## LLM-Assisted Research

The project explicitly uses LLMs (Gemini, Claude) for research, drafting, editing, and infographics. All AI-generated content receives human review before publication. This is documented in the About page.

## GitHub Actions Integration

The repository has two Claude Code GitHub Actions workflows:

1. **Claude PR Assistant** (`.github/workflows/claude.yml`): Triggered when `@claude` is mentioned in issues or PR comments. Has access to WebSearch.

2. **Claude Code Review** (`.github/workflows/claude-code-review.yml`): Automatically reviews pull requests using the code-review plugin.

