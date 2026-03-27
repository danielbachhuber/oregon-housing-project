+++
title = '[Link Title]'
date = 'YYYY-MM-DD'
original_url = '[Full URL]'
source = '[Publication or Blog Name]'
author = '[Author Name]'
description = '[One or two sentences on why this is interesting.]'
+++

---

**Template Notes:**

**File Location:**
- Place file in `content/links/[slug].md`
- Example: `content/links/some-interesting-post.md`

**File Naming:**
- Use lowercase, hyphen-separated slugs
- Keep filename descriptive but concise (under 50 characters)

**Front Matter:**
- `date`: Publication date (YYYY-MM-DD format)
- `original_url`: Full URL to the original content (use `original_url` not `url` to avoid Hugo conflicts)
- `source`: Publication or blog name (e.g., "Sightline Institute", "Strong Towns")
- `author`: Author's name
- `description`: One or two sentences explaining why this link is interesting or relevant

**No body content** — the `description` front matter serves as the blurb.

**Automatic List Display:**
- The `layouts/links/list.html` template automatically displays all links in reverse chronological order
- Each entry shows title (linked to `original_url`), metadata line, and description
- No need to manually update index pages
