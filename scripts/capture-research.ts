import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';
import { slugify, escapeToml } from './utils';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CONTENT_DIR = path.join(process.cwd(), 'content/research');

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

async function fetchUrl(url: string): Promise<string> {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 15000,
  });
  return response.data;
}

function extractMeta($: cheerio.CheerioAPI, field: string): string {
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
      if (Array.isArray(data.author) && data.author[0]?.name) result.author = data.author[0].name;
    } catch {}
  });
  return result;
}

interface PageData {
  title: string;
  author: string;
  source: string;
  date: string;
  content: string;
  wordCount: number;
  readingTime: number;
}

function extractPageData(html: string, url: string): PageData {
  const $ = cheerio.load(html);
  const jsonLd = extractJsonLd($);

  const title =
    extractMeta($, 'og:title') ||
    $('h1').first().text().trim() ||
    $('title').text().trim() ||
    '';

  const author =
    extractMeta($, 'article:author') ||
    extractMeta($, 'author') ||
    jsonLd.author ||
    $('[rel="author"]').first().text().trim() ||
    $('.author').first().text().trim() ||
    '';

  const dateStr =
    extractMeta($, 'article:published_time') ||
    jsonLd.date ||
    $('time[datetime]').first().attr('datetime') ||
    '';

  const hostname = new URL(url).hostname.replace(/^www\./, '');
  // Map common domains to publication names
  const sourceMap: Record<string, string> = {
    'construction-physics.com': 'Construction Physics',
    'substack.com': 'Substack',
    'sightline.org': 'Sightline Institute',
    'strongtowns.org': 'Strong Towns',
    'marketurbanism.com': 'Market Urbanism',
  };
  const source = sourceMap[hostname] || hostname;

  // Extract article text
  let content = '';
  const selectors = ['article', '.post-content', '.entry-content', 'main', 'body'];
  for (const sel of selectors) {
    const el = $(sel);
    if (el.length) {
      el.find('p').each((_i, p) => {
        content += $(p).text() + '\n\n';
      });
      if (content.trim()) break;
    }
  }

  // Try metadata date, then URL date pattern, then fall back to today
  let date: string;
  if (dateStr) {
    date = new Date(dateStr).toISOString().split('T')[0];
  } else {
    const urlDateMatch = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
    if (urlDateMatch) {
      date = `${urlDateMatch[1]}-${urlDateMatch[2]}-${urlDateMatch[3]}`;
    } else {
      date = new Date().toISOString().split('T')[0];
    }
  }

  const trimmedContent = content.trim();
  const wordCount = trimmedContent ? trimmedContent.split(/\s+/).length : 0;
  const readingTime = Math.ceil(wordCount / 250);

  return {
    title: title.replace(/\s+/g, ' ').trim(),
    author: author.replace(/\s+/g, ' ').trim(),
    source,
    date,
    content: trimmedContent,
    wordCount,
    readingTime,
  };
}

async function generateDescription(url: string, page: PageData): Promise<string> {
  const contentSnippet = page.content.substring(0, 12000);

  const prompt = `You are helping curate an Oregon housing policy research site. Write 1-2 sentences summarizing this article. Be direct and specific — focus on the key insight or finding.

Title: ${page.title}
URL: ${url}
Content: ${contentSnippet}

Respond with ONLY the description sentences, no preamble.`;

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  return ((msg.content[0] as any).text as string).trim();
}


async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: tsx scripts/capture-link.ts <url>');
    process.exit(1);
  }

  if (!ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  console.log(`Fetching: ${url}`);
  const html = await fetchUrl(url);

  console.log('Extracting metadata...');
  const page = extractPageData(html, url);
  console.log(`  Title:  ${page.title}`);
  console.log(`  Author: ${page.author}`);
  console.log(`  Source: ${page.source}`);
  console.log(`  Date:   ${page.date}`);
  console.log(`  Words:  ${page.wordCount}`);
  console.log(`  Reading: ~${page.readingTime} min`);

  console.log('Generating description via Claude...');
  const description = await generateDescription(url, page);
  console.log(`  Description: ${description}`);

  const slug = slugify(page.title);
  const filepath = path.join(CONTENT_DIR, `${slug}.md`);

  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
  }

  const exists = fs.existsSync(filepath);
  if (exists) {
    console.log(`Updating existing file: ${filepath}`);
  }

  const escTitle = escapeToml(page.title);
  const escAuthor = escapeToml(page.author);
  const escDescription = escapeToml(description);

  const fileContent = `+++
title = "${escTitle}"
date = '${page.date}'
original_url = '${url}'
source = '${page.source}'
author = "${escAuthor}"
description = "${escDescription}"
word_count = ${page.wordCount}
reading_time = ${page.readingTime}
+++
`;

  fs.writeFileSync(filepath, fileContent);
  console.log(`${exists ? 'Updated' : 'Created'}: ${filepath}`);

  // Output the filepath for use by the workflow
  console.log(`OUTPUT_FILE=${filepath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
