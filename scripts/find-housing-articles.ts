import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import xml2js from 'xml2js';
import { parseISO, subHours, isAfter } from 'date-fns';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

// Configuration
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const HOURS_LOOKBACK = 48; // Check articles from the last 48 hours

// Paths
const DATA_DIR = path.join(process.cwd(), 'data');
const CONTENT_DIR = path.join(process.cwd(), 'content/news');
const WWEEK_URLS_FILE = path.join(DATA_DIR, 'processed-wweek-urls.txt');
const OCC_URLS_FILE = path.join(DATA_DIR, 'processed-occ-urls.txt');

// Initialize Anthropic
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

interface ArticleData {
  title: string;
  description: string;
  date: string;
  content: string;
  url: string;
}

interface ClassificationResult {
  is_housing: boolean;
  relevance_explanation: string;
  article_summary: string;
}

interface SourceConfig {
  id: string;
  name: string;
  sitemapIndex: string;
  processedFile: string;
  sitemapType: 'xml-index-news' | 'yoast-index';
  extractContent: (html: string, url: string) => ArticleData;
}

async function main() {
  if (!ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  // Parse arguments
  const args = process.argv.slice(2);
  const sourceArg = args.find(arg => arg.startsWith('--source='));
  const targetSource = sourceArg ? sourceArg.split('=')[1].toLowerCase() : null;

  console.log('Starting housing article search...');
  if (targetSource) console.log(`Targeting source: ${targetSource}`);

  // Ensure content directory exists
  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
  }

  const sources: SourceConfig[] = [
    {
      id: 'wweek',
      name: 'Willamette Week',
      sitemapIndex: 'https://www.wweek.com/arc/outboundfeeds/sitemap-index?outputType=xml',
      processedFile: WWEEK_URLS_FILE,
      sitemapType: 'xml-index-news',
      extractContent: extractWWeekContent
    },
    {
      id: 'occ',
      name: 'Oregon Capital Chronicle',
      sitemapIndex: 'https://oregoncapitalchronicle.com/sitemap_index.xml',
      processedFile: OCC_URLS_FILE,
      sitemapType: 'yoast-index',
      extractContent: extractOCCContent
    }
  ];

  const sourcesToProcess = targetSource 
    ? sources.filter(s => s.id === targetSource)
    : sources;

  if (sourcesToProcess.length === 0) {
    console.error(`Error: Source '${targetSource}' not found. Available sources: ${sources.map(s => s.id).join(', ')}`);
    process.exit(1);
  }

  for (const source of sourcesToProcess) {
    await processSource(source);
  }

  console.log('Done.');
}

async function processSource({ name, sitemapIndex, processedFile, sitemapType, extractContent }: SourceConfig) {
  console.log(`\nProcessing ${name}...`);

  // 1. Load processed URLs
  const processedUrls = loadProcessedUrls(processedFile);
  const initialCount = processedUrls.size;
  console.log(`Loaded ${initialCount} processed URLs.`);

  // 2. Fetch Candidates from Sitemap
  const candidates = await fetchSitemapCandidates(sitemapIndex, sitemapType, processedUrls);
  console.log(`Found ${candidates.length} new candidates to check.`);

  // 3. Process Candidates
  for (const url of candidates) {
    try {
      console.log(`Checking: ${url}`);
      
      // Fetch Article HTML
      const html = await fetchUrl(url);
      if (!html) continue;

      // Extract Content
      const articleData = extractContent(html, url);
      if (!articleData) {
        console.log('  -> Could not extract content, skipping.');
        processedUrls.add(url); // Mark as processed anyway to avoid retry loop
        continue;
      }

      // Classify
      const classification = await classifyArticle(articleData);
      
      // Update State (always mark as seen)
      processedUrls.add(url);

      if (classification.is_housing) {
        console.log('  -> [MATCH] identified as HOUSING related.');
        console.log(`  -> Relevance: ${classification.relevance_explanation}`);
        console.log(`  -> Summary: ${classification.article_summary}`);
        
        // Generate File
        const filename = generateFilename(articleData.date, articleData.title);
        const filepath = path.join(CONTENT_DIR, filename);
        
        // Check if file exists (double check)
        if (fs.existsSync(filepath)) {
           console.log(`  -> File already exists: ${filename}`);
        } else {
           createArticleFile(filepath, articleData, classification, name);
           console.log(`  -> Created file: ${filename}`);
        }
      } else {
        console.log('  -> Not housing related.');
      }

    } catch (error: any) {
      console.error(`  -> Error processing ${url}:`, error.message);
    }
  }

  // 4. Save State
  if (processedUrls.size > initialCount) {
    saveProcessedUrls(processedFile, processedUrls);
    console.log(`Updated processed URLs file (Total: ${processedUrls.size})`);
  } else {
    console.log('No new URLs processed.');
  }
}

// --- Helpers ---

function loadProcessedUrls(filepath: string): Set<string> {
  if (!fs.existsSync(filepath)) return new Set();
  const content = fs.readFileSync(filepath, 'utf-8');
  return new Set(content.split('\n').filter(line => line.trim() !== ''));
}

function saveProcessedUrls(filepath: string, urlSet: Set<string>) {
  const sortedUrls = Array.from(urlSet).sort();
  fs.writeFileSync(filepath, sortedUrls.join('\n') + '\n');
}

async function fetchUrl(url: string, useBrowser = false): Promise<string | null> {
    // Try Axios first if not forced to browser
    if (!useBrowser) {
        try {
            const response = await axios.get(url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            });
            return response.data;
        } catch (error: any) {
            // Only fall back to browser on 403 or specific errors
            if (error.response && (error.response.status === 403 || error.response.status === 404)) {
                console.log(`  -> Axios failed with ${error.response.status}, retrying with Puppeteer...`);
            } else {
                console.error(`Failed to fetch ${url} with Axios: ${error.message}`);
                return null;
            }
        }
    }

    // Puppeteer fallback
    try {
        const browser = await puppeteer.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        
        // Go to URL and wait for network idle to allow Cloudflare check to pass
        // Cloudflare often reloads the page, so we use a loose timeout/wait strategy
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        } catch (e) {
            // Sometimes timeout happens but page is loaded
            console.log('  -> Puppeteer navigation timeout (continuing anyway)');
        }

        // Strategy: Use fetch() inside the browser context.
        // This leverages the cookies/auth established by the browser (if the challenge passed)
        // and returns the RAW text content, avoiding DOM XML parsing issues.
        const content = await page.evaluate(async (targetUrl) => {
            try {
                const response = await fetch(targetUrl);
                return await response.text();
            } catch (err: any) {
                return null;
            }
        }, url);

        await browser.close();
        return content;
        
    } catch (error: any) {
         console.error(`Failed to fetch ${url} with Puppeteer: ${error.message}`);
         return null;
    }
}

async function fetchSitemapCandidates(indexUrl: string, type: 'xml-index-news' | 'yoast-index', processedSet: Set<string>): Promise<string[]> {
  const cutoffDate = subHours(new Date(), HOURS_LOOKBACK);
  const candidates: string[] = [];

  try {
    const parser = new xml2js.Parser();
    const indexXml = await fetchUrl(indexUrl);
    if (!indexXml) return [];
    
    // Debug: Log first 100 chars
    console.log(`  -> Sitemap Content Preview: ${indexXml.substring(0, 100).replace(/\n/g, ' ')}...`);

    const indexResult = await parser.parseStringPromise(indexXml);
    
    let targetSitemaps: string[] = [];

    // Different handling based on sitemap structure
    if (type === 'xml-index-news') {
       // Expect <sitemapindex><sitemap><loc>...</loc></sitemap>...</sitemapindex>
       // For WWeek, we specifically want the 'news' sitemap if possible, or iterate all.
       // The index usually contains links to other sitemaps.
        const sitemaps = indexResult.sitemapindex?.sitemap || [];
        // Filter for specific sitemaps if needed, or just take them all.
        // WWeek has /news-sitemap which is likely best.
        targetSitemaps = sitemaps.map((s: any) => s.loc[0]);
    } else if (type === 'yoast-index') {
        const sitemaps = indexResult.sitemapindex?.sitemap || [];
        // For OCC, we want post-sitemap.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        targetSitemaps = sitemaps.map((s: any) => s.loc[0]).filter((url: string) => url.includes('post-sitemap'));
    }

    console.log(`Found ${targetSitemaps.length} sub-sitemaps.`);

    for (const sitemapUrl of targetSitemaps) {
       console.log(`  Fetching sitemap: ${sitemapUrl}`);
       const sitemapXml = await fetchUrl(sitemapUrl);
       if (!sitemapXml) continue;
       
       const sitemapResult = await parser.parseStringPromise(sitemapXml);
       const urls = sitemapResult.urlset?.url || [];
       
       for (const entry of urls) {
         const loc = entry.loc[0];
         const lastmod = entry.lastmod ? entry.lastmod[0] : null;
         
         if (processedSet.has(loc)) continue;
         
         // If we have a date, check if it's recent
         if (lastmod) {
            try {
                const date = parseISO(lastmod);
                if (isAfter(date, cutoffDate)) {
                    candidates.push(loc);
                }
            } catch (e) {
                // If date parsing fails, maybe include it just in case? Or skip.
                // Safest to include if close call, but sitemaps are usually ISO.
            }
         } else {
             // No date? If we haven't seen it, maybe check it. 
             // But for daily runs on large sites, this might be risky.
             // Let's assume most news sitemaps have dates.
         }
       }
    }

  } catch (err) {
    console.error(`Error parsing sitemap ${indexUrl}:`, err);
    // Log content preview if available (would need to pass it down or fetch again, but simple logging helps)
  }
  
  return candidates;
}

function extractWWeekContent(html: string, url: string): ArticleData {
  const $ = cheerio.load(html);
  // WWeek Structure (approximate, needs adjustment based on actual page)
  // Usually json-ld or meta tags are best for reliable extraction.
  
  const title = $('meta[property="og:title"]').attr('content') || $('h1').first().text();
  const description = $('meta[property="og:description"]').attr('content') || '';
  const dateStr = $('meta[property="article:published_time"]').attr('content') || new Date().toISOString();
  const author = $('meta[name="author"]').attr('content') || $('a[rel="author"]').first().text() || '';
  
  // Content extraction
  // WWeek uses specific classes?
  // Try generic paragraph extraction for now
  let content = '';
  $('.article-body p').each((i, el) => {
    content += $(el).text() + '\n\n';
  });
  
  if (!content) {
      // Fallback
       $('p').each((i, el) => {
        content += $(el).text() + '\n\n';
      });
  }
  
  return {
    title: title.trim(),
    description: description.trim(),
    date: dateStr, // ISO String preferred
    author: author.trim(),
    content: content.trim(),
    url: url
  };
}

function extractOCCContent(html: string, url: string): ArticleData {
  const $ = cheerio.load(html);
  
  const title = $('meta[property="og:title"]').attr('content') || $('h1').first().text();
  const description = $('meta[property="og:description"]').attr('content') || '';
  const dateStr = $('meta[property="article:published_time"]').attr('content') || new Date().toISOString();
  const author = $('meta[name="author"]').attr('content') || $('.author-name').text() || '';
  
  let content = '';
  // OCC often uses .entry-content or similar
  $('.entry-content p').each((i, el) => {
    content += $(el).text() + '\n\n';
  });
  
   if (!content) {
       $('article p').each((i, el) => {
        content += $(el).text() + '\n\n';
      });
  }

  return {
    title: title.trim(),
    description: description.trim(),
    date: dateStr,
    author: author.trim(),
    content: content.trim(),
    url: url
  };
}

async function classifyArticle(article: ArticleData): Promise<ClassificationResult> {
  // Truncate content to avoid token limits if necessary, though recent models have large context.
  // 10k chars should be plenty for classification.
  const contentSnippet = article.content.substring(0, 15000);
  
  const prompt = `
  Analyze the following news article.
  1. Determine if it is primarily about housing in Oregon.
  2. Write a 1-2 sentence summary of the article content.
  
  Topics of interest include:
  - Housing policy and legislation
  - Homelessness and shelters
  - Real estate market trends (rent, home prices)
  - Zoning and land use
  - Tenant rights and landlord regulations
  - Affordable housing developments
  
  Title: ${article.title}
  Content: ${contentSnippet}
  
  Respond ONLY with a JSON object in the following format:
  {
    "is_housing": boolean,
    "relevance_explanation": "A 1-2 sentence explanation of why this is or isn't related to housing.",
    "article_summary": "A 1-2 sentence summary of the article content."
  }
  `;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-3-haiku-20240307", // Fast and cheap
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }]
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseText = (msg.content[0] as any).text;
    // extract JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ClassificationResult;
    }
    return { is_housing: false, relevance_explanation: "Failed to parse JSON response.", article_summary: "" };

  } catch (e: any) {
    console.error("Classification error:", e);
    return { is_housing: false, relevance_explanation: "Classification failed.", article_summary: "" };
  }
}

interface ArticleData {
  title: string;
  description: string;
  date: string;
  author: string;
  content: string; // Still needed for classification/summary generation
  url: string;
}

// ... (previous interfaces)

function generateFilename(dateStr: string, title: string): string {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const formattedDate = date.toISOString().split('T')[0];
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    // Limit slug length to 50 chars as per template note
    const truncatedSlug = slug.substring(0, 50).replace(/-$/, '');
    
    return `${year}/${truncatedSlug}.md`;
}

function createArticleFile(filepath: string, article: ArticleData, classification: ClassificationResult, sourceName: string) {
    const date = new Date(article.date).toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Ensure directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const content = `+++
title = '${article.title.replace(/'/g, "''")}'
date = '${date}'
source = '${sourceName}'
original_url = '${article.url}'
author = '${(article.author || "Staff").replace(/'/g, "''")}'
+++

${classification.article_summary}

<!--
Auto-generated by find-housing-articles.ts

Relevance: ${classification.relevance_explanation}
-->
`;
    fs.writeFileSync(filepath, content);
}

main().catch(console.error);
