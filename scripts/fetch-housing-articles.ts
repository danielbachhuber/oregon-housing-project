import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import xml2js from 'xml2js';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

// Configuration
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Paths
const CONTENT_DIR = path.join(process.cwd(), 'content/news-coverage');
const DATA_DIR = path.join(CONTENT_DIR, 'data');

// Initialize Anthropic
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

interface ArticleData {
  title: string;
  description: string;
  date: string;
  author: string;
  content: string;
  url: string;
}

interface ClassificationResult {
  is_housing: boolean;
  relevance_explanation: string;
}

interface SummaryResult {
  summary: string;
}

interface SourceConfig {
  id: string;
  name: string;
  sitemapUrl: string;
  processedFile: string;
  sitemapType: 'xml-index-news' | 'yoast-index' | 'flat' | 'rss';
  extractContent: (html: string, url: string) => ArticleData;
}

const SOURCES: SourceConfig[] = [
  {
    id: 'opb',
    name: 'OPB',
    sitemapUrl: 'https://www.opb.org/sitemap.xml',
    processedFile: path.join(DATA_DIR, 'processed-opb-urls.txt'),
    sitemapType: 'flat',
    extractContent: extractOPBContent,
  },
  {
    id: 'wweek',
    name: 'Willamette Week',
    sitemapUrl: 'https://www.wweek.com/arc/outboundfeeds/sitemap-index?outputType=xml',
    processedFile: path.join(DATA_DIR, 'processed-wweek-urls.txt'),
    sitemapType: 'xml-index-news',
    extractContent: extractWWeekContent,
  },
  {
    id: 'occ',
    name: 'Oregon Capital Chronicle',
    sitemapUrl: 'https://oregoncapitalchronicle.com/feed/',
    processedFile: path.join(DATA_DIR, 'processed-occ-urls.txt'),
    sitemapType: 'rss',
    extractContent: extractOCCContent,
  },
];

// Internal linking context for Claude summary generation
const INTERNAL_LINKS_CONTEXT = `
When writing the summary, use these internal link formats where relevant:

People (use when mentioned by name):
- [Tina Kotek](/people/tina-kotek)
- [Dick Anderson](/people/dick-anderson)
- [Keith Wilson](/people/keith-wilson)
- [Loretta Smith](/people/loretta-smith)
- [Raymond Lee](/people/raymond-lee)
- [Vikki Breese-Iverson](/people/vikki-breese-iverson)

Cities (use when mentioned):
- [Portland](/cities/portland)
- [Tualatin](/cities/tualatin)
- [Canby](/cities/canby)

Key legislation (use when referenced):
- [SB 100 (1973)](/legislation/1973/sb-100) - Urban Growth Boundaries
- [Measure 5 (1990)](/legislation/1990/measure-5)
- [HB 2001 (2019)](/legislation/2019/hb-2001)
- [HB 2003 (2019)](/legislation/2019/hb-2003)
- [SB 608 (2019)](/legislation/2019/sb-608)
- [EO 23-04 (2023)](/legislation/2023/eo-23-04)
- [HB 2138 (2025)](/legislation/2025/hb-2138)
- [HB 3644 (2025)](/legislation/2025/hb-3644)
- [SB 1566 (2026)](/legislation/2026/sb-1566)

Key concepts:
- [Urban Growth Boundary (UGB)](/key-concepts#urban-growth-boundary)

For any legislation mentioned that follows the pattern HB XXXX or SB XXXX, use the format:
[HB XXXX (YEAR)](/legislation/YEAR/hb-xxxx) or [SB XXXX (YEAR)](/legislation/YEAR/sb-xxxx)
Only link legislation that is explicitly referenced in the article.
`;

async function main() {
  // Parse arguments first so usage message works without API key
  const args = process.argv.slice(2);
  const positionalArgs = args.filter(a => !a.startsWith('--'));
  const sourceName = positionalArgs[0];
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit'));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || args[args.indexOf(limitArg) + 1], 10) : Infinity;

  if (!sourceName) {
    console.error('Usage: tsx scripts/fetch-housing-articles.ts <source> [--dry-run] [--limit=N]');
    console.error(`Available sources: ${SOURCES.map(s => s.id).join(', ')}`);
    process.exit(1);
  }

  const source = SOURCES.find(s => s.id === sourceName.toLowerCase());
  if (!source) {
    console.error(`Error: Unknown source '${sourceName}'. Available sources: ${SOURCES.map(s => s.id).join(', ')}`);
    process.exit(1);
  }

  if (!ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  if (dryRun) console.log('[DRY RUN] No files will be written.');
  if (limit < Infinity) console.log(`[LIMIT] Processing at most ${limit} articles.`);

  console.log(`Fetching housing articles from ${source.name}...`);

  // Ensure content directory exists
  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
  }

  await processSource(source, dryRun, limit);
  console.log('Done.');
}

async function processSource(source: SourceConfig, dryRun: boolean, limit: number) {
  const { name, sitemapUrl, processedFile, sitemapType, extractContent } = source;
  console.log(`\nProcessing ${name}...`);

  // 1. Load processed URLs
  const processedUrls = loadProcessedUrls(processedFile);
  const initialCount = processedUrls.size;
  console.log(`Loaded ${initialCount} previously processed URLs.`);

  // 2. Fetch candidates
  let articles: ArticleData[];
  if (sitemapType === 'rss') {
    articles = await fetchRssCandidates(sitemapUrl, processedUrls);
  } else {
    const candidateUrls = await fetchSitemapCandidates(sitemapUrl, sitemapType, processedUrls);
    console.log(`Found ${candidateUrls.length} new candidates to check.`);
    // Fetch and extract each URL
    articles = [];
    for (const url of candidateUrls) {
      const html = await fetchUrl(url);
      if (!html) continue;
      const data = extractContent(html, url);
      if (data && data.title) {
        articles.push(data);
      } else {
        // Mark unfetchable URLs as processed to avoid retrying
        if (!dryRun) appendProcessedUrl(processedFile, url);
      }
    }
  }
  console.log(`Found ${articles.length} new candidates to check.`);

  const toProcess = articles.slice(0, limit);
  if (toProcess.length < articles.length) {
    console.log(`Processing ${toProcess.length} of ${articles.length} (limited).`);
  }

  // 3. Classify and process candidates
  let created = 0;
  for (const articleData of toProcess) {
    try {
      console.log(`\nChecking: ${articleData.url}`);

      // Step 1: Classify with Haiku
      const classification = await classifyArticle(articleData);

      if (classification.is_housing) {
        console.log('  -> [MATCH] Housing related.');
        console.log(`  -> Reason: ${classification.relevance_explanation}`);

        // Step 2: Generate summary with Sonnet
        const { summary } = await generateSummary(articleData);
        console.log(`  -> Summary: ${summary.substring(0, 120)}...`);

        const filename = generateFilename(articleData.date, articleData.title);
        const filepath = path.join(CONTENT_DIR, filename);

        if (dryRun) {
          console.log(`  -> [DRY RUN] Would create: ${filename}`);
        } else if (fs.existsSync(filepath)) {
          console.log(`  -> File already exists: ${filename}`);
        } else {
          createArticleFile(filepath, articleData, summary, name);
          console.log(`  -> Created: ${filename}`);
        }
        created++;
      } else {
        console.log('  -> Not housing related, skipping.');
      }

      // Mark as processed incrementally so killed runs don't reprocess
      if (!dryRun) appendProcessedUrl(processedFile, articleData.url);
    } catch (error: any) {
      console.error(`  -> Error processing ${articleData.url}:`, error.message);
    }
  }

  console.log(`\n${name}: ${created} housing articles found out of ${toProcess.length} checked.`);
}

// --- URL tracking ---

function loadProcessedUrls(filepath: string): Set<string> {
  if (!fs.existsSync(filepath)) return new Set();
  const content = fs.readFileSync(filepath, 'utf-8');
  return new Set(content.split('\n').filter(line => line.trim() !== ''));
}

function appendProcessedUrl(filepath: string, url: string) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(filepath, url + '\n');
}

// --- HTTP ---

async function fetchUrl(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
    });
    return response.data;
  } catch (error: any) {
    const status = error.response?.status;
    console.error(`  -> Failed to fetch (${status || error.code || 'unknown'}): ${url}`);
    return null;
  }
}

// --- Sitemap parsing ---

async function fetchSitemapCandidates(
  sitemapUrl: string,
  type: SourceConfig['sitemapType'],
  processedSet: Set<string>
): Promise<string[]> {
  const candidates: string[] = [];
  const parser = new xml2js.Parser();

  try {
    const xml = await fetchUrl(sitemapUrl);
    if (!xml) return [];

    const result = await parser.parseStringPromise(xml);

    if (type === 'flat') {
      // Flat urlset — e.g. OPB
      const urls = result.urlset?.url || [];
      for (const entry of urls) {
        const loc = entry.loc?.[0];
        if (loc && !processedSet.has(loc)) {
          candidates.push(loc);
        }
      }
    } else {
      // Index-based sitemaps (WWeek, OCC)
      let targetSitemaps: string[] = [];

      if (type === 'xml-index-news') {
        const sitemaps = result.sitemapindex?.sitemap || [];
        targetSitemaps = sitemaps.map((s: any) => s.loc[0]);
      } else if (type === 'yoast-index') {
        const sitemaps = result.sitemapindex?.sitemap || [];
        targetSitemaps = sitemaps
          .map((s: any) => s.loc[0])
          .filter((url: string) => url.includes('post-sitemap'));
      }

      console.log(`  Found ${targetSitemaps.length} sub-sitemaps.`);

      for (const subUrl of targetSitemaps) {
        console.log(`  Fetching sub-sitemap: ${subUrl}`);
        const subXml = await fetchUrl(subUrl);
        if (!subXml) continue;

        const subResult = await parser.parseStringPromise(subXml);
        const urls = subResult.urlset?.url || [];

        for (const entry of urls) {
          const loc = entry.loc?.[0];
          if (loc && !processedSet.has(loc)) {
            candidates.push(loc);
          }
        }
      }
    }
  } catch (err: any) {
    console.error(`Error parsing sitemap ${sitemapUrl}:`, err.message);
  }

  return candidates;
}

async function fetchRssCandidates(
  feedUrl: string,
  processedSet: Set<string>
): Promise<ArticleData[]> {
  const articles: ArticleData[] = [];
  const parser = new xml2js.Parser();

  try {
    const xml = await fetchUrl(feedUrl);
    if (!xml) return [];

    const result = await parser.parseStringPromise(xml);
    const items = result.rss?.channel?.[0]?.item || [];

    for (const item of items) {
      const url = item.link?.[0] || '';
      if (!url || processedSet.has(url)) continue;

      const title = item.title?.[0] || '';
      const author = item['dc:creator']?.[0] || '';
      const pubDate = item.pubDate?.[0] || '';
      const encoded = item['content:encoded']?.[0] || '';
      const description = item.description?.[0] || '';

      // Strip HTML from content:encoded to get plain text
      const $ = cheerio.load(encoded);
      const content = $('p').map((_i, el) => $(el).text()).get().join('\n\n');

      articles.push({
        title: title.trim(),
        description: typeof description === 'string' ? cheerio.load(description).text().trim() : '',
        date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        author: author.trim(),
        content: content.trim(),
        url,
      });
    }
  } catch (err: any) {
    console.error(`Error parsing RSS feed ${feedUrl}:`, err.message);
  }

  return articles;
}

// --- Content extraction helpers ---

function extractMeta($: cheerio.CheerioAPI, field: string): string {
  // Check both property= and name= since sites vary (OPB uses property=, WWeek uses name=)
  return (
    $(`meta[property="${field}"]`).attr('content') ||
    $(`meta[name="${field}"]`).attr('content') ||
    ''
  );
}

function extractJsonLd($: cheerio.CheerioAPI): { date?: string; author?: string } {
  const result: { date?: string; author?: string } = {};
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const data = JSON.parse($(el).text());
      if (data.datePublished) result.date = data.datePublished;
      if (data.author?.name) result.author = data.author.name;
    } catch {}
  });
  return result;
}

// Extract date/author from Arc Fusion globalContent JS object (used by WWeek)
function extractFusionData(html: string): { date?: string; author?: string } {
  const result: { date?: string; author?: string } = {};
  const dateMatch = html.match(/["']publish_date["']\s*:\s*["']([^"']+)["']/);
  if (dateMatch) result.date = dateMatch[1];
  const authorMatch = html.match(/"credits":\{"by":\[\{"[^}]*"name":"([^"]+)"/);
  if (authorMatch) result.author = authorMatch[1];
  return result;
}

function extractDate($: cheerio.CheerioAPI, html: string): string {
  return (
    extractMeta($, 'article:published_time') ||
    extractJsonLd($).date ||
    extractFusionData(html).date ||
    ''
  );
}

function extractAuthor($: cheerio.CheerioAPI, html: string): string {
  return (
    extractMeta($, 'article:author') ||
    extractMeta($, 'author') ||
    extractJsonLd($).author ||
    extractFusionData(html).author ||
    ''
  );
}

// --- Content extraction ---

function extractOPBContent(html: string, url: string): ArticleData {
  const $ = cheerio.load(html);

  const title = extractMeta($, 'og:title') || $('h1').first().text() || '';
  const description = extractMeta($, 'og:description');
  const dateStr = extractDate($, html);
  const author = extractAuthor($, html);

  let content = '';
  $('article p').each((_i, el) => {
    content += $(el).text() + '\n\n';
  });
  if (!content) {
    $('p').each((_i, el) => {
      content += $(el).text() + '\n\n';
    });
  }

  return {
    title: title.trim(),
    description: description.trim(),
    date: dateStr || new Date().toISOString(),
    author: author.trim(),
    content: content.trim(),
    url,
  };
}

function extractWWeekContent(html: string, url: string): ArticleData {
  const $ = cheerio.load(html);

  const title = extractMeta($, 'og:title') || $('h1').first().text() || '';
  const description = extractMeta($, 'og:description');
  const dateStr = extractDate($, html);
  const author = extractAuthor($, html) || $('a[rel="author"]').first().text() || '';

  let content = '';
  $('.article-body p').each((_i, el) => {
    content += $(el).text() + '\n\n';
  });
  if (!content) {
    $('p').each((_i, el) => {
      content += $(el).text() + '\n\n';
    });
  }

  return {
    title: title.trim(),
    description: description.trim(),
    date: dateStr || new Date().toISOString(),
    author: author.trim(),
    content: content.trim(),
    url,
  };
}

function extractOCCContent(html: string, url: string): ArticleData {
  const $ = cheerio.load(html);

  const title = extractMeta($, 'og:title') || $('h1').first().text() || '';
  const description = extractMeta($, 'og:description');
  const dateStr = extractDate($, html);
  const author = extractAuthor($, html) || $('.author-name').text() || '';

  let content = '';
  $('.entry-content p').each((_i, el) => {
    content += $(el).text() + '\n\n';
  });
  if (!content) {
    $('article p').each((_i, el) => {
      content += $(el).text() + '\n\n';
    });
  }

  return {
    title: title.trim(),
    description: description.trim(),
    date: dateStr || new Date().toISOString(),
    author: author.trim(),
    content: content.trim(),
    url,
  };
}

// --- Claude API: Classification ---

async function classifyArticle(article: ArticleData): Promise<ClassificationResult> {
  const contentSnippet = article.content.substring(0, 10000);

  const prompt = `Analyze this news article and determine if it is primarily about housing in Oregon.

Topics of interest include:
- Housing policy and legislation
- Homelessness and shelters
- Real estate market trends (rent, home prices)
- Zoning and land use
- Tenant rights and landlord regulations
- Affordable housing developments
- Construction and building permits

Title: ${article.title}
Description: ${article.description}
Content: ${contentSnippet}

Respond ONLY with a JSON object:
{
  "is_housing": boolean,
  "relevance_explanation": "Brief explanation of why this is or isn't related to Oregon housing."
}`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = (msg.content[0] as any).text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ClassificationResult;
    }
    return { is_housing: false, relevance_explanation: 'Failed to parse classification response.' };
  } catch (e: any) {
    console.error('  -> Classification error:', e.message);
    return { is_housing: false, relevance_explanation: 'Classification failed.' };
  }
}

// --- Claude API: Summary generation ---

async function generateSummary(article: ArticleData): Promise<SummaryResult> {
  const contentSnippet = article.content.substring(0, 15000);

  const prompt = `Write a concise summary (3 sentences max) of this Oregon housing news article. Focus on the main housing policy news, key actors involved, and significance.

IMPORTANT: Include internal links using the formats below wherever the article mentions these entities. Only link entities that are actually mentioned in the article.

${INTERNAL_LINKS_CONTEXT}

Article title: ${article.title}
Article content: ${contentSnippet}

Respond with ONLY the summary paragraph, no preamble or explanation. Use markdown link syntax for internal links.`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = (msg.content[0] as any).text;
    return { summary: responseText.trim() };
  } catch (e: any) {
    console.error('  -> Summary generation error:', e.message);
    // Fall back to description
    return { summary: article.description || article.title };
  }
}

// --- File generation ---

function generateFilename(dateStr: string, title: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50)
    .replace(/-$/, '');

  return `${year}/${slug}.md`;
}

function createArticleFile(
  filepath: string,
  article: ArticleData,
  summary: string,
  sourceName: string
) {
  const date = new Date(article.date).toISOString().split('T')[0]; // YYYY-MM-DD

  // Ensure directory exists
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Escape single quotes in TOML values
  const escTitle = article.title.replace(/'/g, "''");
  const escAuthor = (article.author || 'Staff').replace(/'/g, "''");

  const content = `+++
title = '${escTitle}'
date = '${date}'
source = '${sourceName}'
original_url = '${article.url}'
author = '${escAuthor}'
+++

${summary}
`;

  fs.writeFileSync(filepath, content);
}

main().catch(console.error);
