+++
title = '[Article Headline]'
date = 'YYYY-MM-DD'
source = '[Publication Name]'
original_url = '[Full URL to original article]'
author = '[Author Name]'
+++

# [Article Headline]

[Write a single concise paragraph (3-5 sentences) summarizing the key points of the article. Focus on the main housing policy news, key actors involved, and significance. Include internal links to relevant legislation, people, cities, and concepts throughout the summary.]

---

**Template Notes:**

**File Location:**
- Place file in `content/news-coverage/[YEAR]/[slug].md`
- Example: `content/news-coverage/2026/anderson-seeks-prevailing-wage-reforms.md`

**File Naming:**
- Use lowercase, hyphen-separated slugs
- Keep filename descriptive but concise (under 50 characters)

**Front Matter:**
- `date`: Publication date of the article (YYYY-MM-DD format)
- `source`: Publication name (e.g., "Willamette Week", "The Oregonian", "OPB")
- `original_url`: Full URL to the original article (use `original_url` not `url` to avoid Hugo conflicts)
- `author`: Article author's name

**Content Guidelines:**
- Keep the summary to one paragraph (3-5 sentences maximum)
- Focus on actionable information and policy implications
- Always include internal links when referencing:
  - Legislation: `[SB 1566](/legislation/2026/sb-1566)`
  - People: `[Tina Kotek](/people/tina-kotek)`
  - Cities: `[Tualatin](/cities/tualatin)`
  - Concepts: `[Key Concepts](/key-concepts)` with anchor links as needed
- Create legislation or people pages if they don't exist yet
- Avoid editorial commentary; present factual summary

**Automatic List Display:**
- The `layouts/news-coverage/list.html` template automatically displays all news coverage articles
- Articles appear in reverse chronological order with date, title, source, and summary
- No need to manually update index pages
