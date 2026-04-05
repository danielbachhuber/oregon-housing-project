import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { YoutubeTranscript } from 'youtube-transcript';
import 'dotenv/config';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const CONTENT_DIR = path.join(process.cwd(), 'content');

// Entity configs for meetings (ported from create_meeting_doc.py)
const ENTITY_CONFIGS: Record<string, {
  path: string;
  filename: string;
  title: string;
  entityName: string;
  meetingType: string;
}> = {
  dlcd: {
    path: 'content/state/dlcd/meetings',
    filename: 'dlcd-{date}.md',
    title: 'DLCD Meeting - {formattedDate}',
    entityName: 'DLCD',
    meetingType: 'dlcd',
  },
  tualatin: {
    path: 'content/cities/tualatin/meetings',
    filename: '{date}-planning-commission.md',
    title: 'Tualatin Planning Commission Meeting - {formattedDate}',
    entityName: 'Tualatin Planning Commission',
    meetingType: 'planning-commission',
  },
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60)
    .replace(/-$/, '');
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function escToml(str: string): string {
  return str.replace(/'/g, "''");
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let url = '';
  let type = 'news-coverage';
  let entity = '';
  let date = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      type = args[++i];
    } else if (args[i] === '--entity' && args[i + 1]) {
      entity = args[++i];
    } else if (args[i] === '--date' && args[i + 1]) {
      date = args[++i];
    } else if (!args[i].startsWith('--')) {
      url = args[i];
    }
  }

  return { url, type, entity, date };
}

interface VideoMetadata {
  title: string;
  channel: string;
  uploadDate: string;
}

async function fetchMetadata(url: string): Promise<VideoMetadata> {
  // Get title and channel from oEmbed
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const oembedResp = await axios.get(oembedUrl);
  const title = oembedResp.data.title || '';
  const channel = oembedResp.data.author_name || '';

  // Get upload date from page HTML
  let uploadDate = '';
  try {
    const pageResp = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
    });
    const html = pageResp.data as string;

    // Try to extract publishDate or uploadDate from embedded JSON
    // The date may be a full ISO timestamp (e.g. "2026-03-17T08:15:06-07:00")
    const dateMatch = html.match(/"publishDate"\s*:\s*"(\d{4}-\d{2}-\d{2})/)
      || html.match(/"uploadDate"\s*:\s*"(\d{4}-\d{2}-\d{2})/)
      || html.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      uploadDate = dateMatch[1];
    }
  } catch (e: any) {
    console.warn('  Warning: Could not fetch upload date from page:', e.message);
  }

  if (!uploadDate) {
    uploadDate = new Date().toISOString().split('T')[0];
    console.warn(`  Warning: Could not determine upload date, using today: ${uploadDate}`);
  }

  return { title, channel, uploadDate };
}

async function fetchTranscriptText(url: string): Promise<{ fullText: string; timestamped: string }> {
  const segments = await YoutubeTranscript.fetchTranscript(url);

  const fullText = segments.map(s => s.text).join(' ');

  // Build timestamped transcript for meetings
  const timestamped = segments.map(s => {
    const totalSec = Math.floor(s.offset / 1000);
    const h = Math.floor(totalSec / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
    const sec = (totalSec % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec} ${s.text}`;
  }).join('\n');

  return { fullText, timestamped };
}

async function cleanTranscript(title: string, timestamped: string): Promise<string> {
  // Process in chunks if the transcript is very long
  const maxChunkSize = 25000;
  const lines = timestamped.split('\n');
  const chunks: string[] = [];
  let currentChunk = '';

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = line;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  const cleanedParts: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (chunks.length > 1) {
      console.log(`  Processing transcript chunk ${i + 1}/${chunks.length}...`);
    }
    const prompt = `Clean up this auto-generated YouTube transcript into a readable format. The video is titled "${title}".

Rules:
- Merge the fragmented caption segments into proper sentences and paragraphs
- Identify speakers where possible and label them (e.g. "**Michael Larson:** ...")
- Keep timestamps, but only at the start of each new speaker turn or every 2-3 minutes, whichever comes first. Use the format [HH:MM:SS].
- Fix obvious transcription errors, capitalization, and punctuation
- Do NOT summarize or omit any content — keep the full transcript
- Do NOT add commentary, notes, or a title heading

Raw transcript:
${chunks[i]}

Respond with ONLY the cleaned transcript, no preamble.`;

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    cleanedParts.push(((msg.content[0] as any).text as string).trim());
  }

  return cleanedParts.join('\n\n');
}

async function generateNewsCoverageSummary(title: string, transcript: string): Promise<string> {
  const snippet = transcript.substring(0, 15000);
  const prompt = `Write a concise summary (3-5 sentences) of this YouTube video about Oregon housing. Focus on the main housing policy news, key actors involved, and significance.

Video title: ${title}
Transcript: ${snippet}

Respond with ONLY the summary paragraph, no preamble, headings, or explanation. Do not include a heading like "# Summary".`;

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  return ((msg.content[0] as any).text as string).trim();
}

async function generateMeetingSummary(title: string, transcript: string): Promise<{ summary: string; keyTopics: string }> {
  const snippet = transcript.substring(0, 30000);
  const prompt = `You are summarizing a government meeting transcript for the Oregon Housing Project website.

Provide two sections:

1. **Summary**: 2-4 paragraph overview of key decisions, action items, and discussions.
2. **Key Topics**: A markdown list of main discussion points with descriptive headings.

Meeting title: ${title}
Transcript: ${snippet}

Respond in this exact format:
SUMMARY:
[your summary paragraphs]

KEY TOPICS:
[your bullet points]`;

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = ((msg.content[0] as any).text as string).trim();
  const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*?)(?=KEY TOPICS:)/);
  const topicsMatch = text.match(/KEY TOPICS:\s*([\s\S]*)/);

  return {
    summary: summaryMatch ? summaryMatch[1].trim() : text,
    keyTopics: topicsMatch ? topicsMatch[1].trim() : '',
  };
}

async function generateResearchDescription(title: string, transcript: string): Promise<string> {
  const snippet = transcript.substring(0, 12000);
  const prompt = `You are helping curate an Oregon housing policy research site. Write 1-2 sentences summarizing this video. Be direct and specific — focus on the key insight or finding.

Title: ${title}
Transcript: ${snippet}

Respond with ONLY the description sentences, no preamble.`;

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  return ((msg.content[0] as any).text as string).trim();
}

async function writeNewsCoverage(url: string, meta: VideoMetadata, summary: string, timestampedTranscript: string): Promise<string> {
  const year = meta.uploadDate.split('-')[0];
  const dir = path.join(CONTENT_DIR, 'news-coverage', year);
  fs.mkdirSync(dir, { recursive: true });

  const slug = slugify(meta.title);
  const filepath = path.join(dir, `${slug}.md`);

  const content = `+++
title = '${escToml(meta.title)}'
date = '${meta.uploadDate}'
source = '${escToml(meta.channel)}'
original_url = '${url}'
author = '${escToml(meta.channel)}'
+++

${summary}

<!--more-->

## Transcript

${timestampedTranscript}
`;

  fs.writeFileSync(filepath, content);
  return filepath;
}

async function writeMeeting(url: string, meta: VideoMetadata, date: string, entity: string, meetingSummary: { summary: string; keyTopics: string }, timestampedTranscript: string): Promise<string> {
  const config = ENTITY_CONFIGS[entity];
  const dir = path.join(process.cwd(), config.path);
  fs.mkdirSync(dir, { recursive: true });

  const filename = config.filename.replace('{date}', date);
  const filepath = path.join(dir, filename);
  const formattedDate = formatDate(date);
  const title = config.title.replace('{formattedDate}', formattedDate);

  const content = `+++
title = '${escToml(title)}'
date = '${date}'
youtube_url = '${url}'
meeting_type = '${config.meetingType}'
entity = '${config.entityName}'
+++

## Summary

${meetingSummary.summary}

## Key Topics

${meetingSummary.keyTopics}

## Full Transcript

${timestampedTranscript}
`;

  fs.writeFileSync(filepath, content);
  return filepath;
}

async function writeResearch(url: string, meta: VideoMetadata, description: string, wordCount: number, timestampedTranscript: string): Promise<string> {
  const dir = path.join(CONTENT_DIR, 'research');
  fs.mkdirSync(dir, { recursive: true });

  const slug = slugify(meta.title);
  const filepath = path.join(dir, `${slug}.md`);
  const readingTime = Math.ceil(wordCount / 250);

  const content = `+++
title = '${escToml(meta.title)}'
date = '${meta.uploadDate}'
original_url = '${url}'
source = '${escToml(meta.channel)}'
author = '${escToml(meta.channel)}'
description = '${escToml(description)}'
word_count = ${wordCount}
reading_time = ${readingTime}
+++

## Transcript

${timestampedTranscript}
`;

  fs.writeFileSync(filepath, content);
  return filepath;
}

async function main() {
  const { url, type, entity, date: dateOverride } = parseArgs(process.argv);

  if (!url) {
    console.error('Usage: tsx scripts/capture-youtube.ts <youtube-url> [--type news-coverage|meeting|research] [--entity dlcd|tualatin] [--date YYYY-MM-DD]');
    process.exit(1);
  }

  if (!ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  const validTypes = ['news-coverage', 'meeting', 'research'];
  if (!validTypes.includes(type)) {
    console.error(`Error: --type must be one of: ${validTypes.join(', ')}`);
    process.exit(1);
  }

  if (type === 'meeting') {
    if (!entity) {
      console.error(`Error: --entity is required for meetings. Available: ${Object.keys(ENTITY_CONFIGS).join(', ')}`);
      process.exit(1);
    }
    if (!ENTITY_CONFIGS[entity]) {
      console.error(`Error: Unknown entity '${entity}'. Available: ${Object.keys(ENTITY_CONFIGS).join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`Capturing YouTube video as ${type}...`);
  console.log(`URL: ${url}`);

  console.log('Fetching video metadata...');
  const meta = await fetchMetadata(url);
  if (dateOverride) meta.uploadDate = dateOverride;
  console.log(`  Title:   ${meta.title}`);
  console.log(`  Channel: ${meta.channel}`);
  console.log(`  Date:    ${meta.uploadDate}`);

  console.log('Fetching transcript...');
  const { fullText, timestamped } = await fetchTranscriptText(url);
  const wordCount = fullText.split(/\s+/).length;
  console.log(`  Words: ${wordCount}`);

  console.log('Cleaning transcript...');
  const cleanedTranscript = await cleanTranscript(meta.title, timestamped);

  let filepath: string;

  if (type === 'news-coverage') {
    console.log('Generating summary via Claude...');
    const summary = await generateNewsCoverageSummary(meta.title, fullText);
    console.log(`  Summary: ${summary.substring(0, 200)}...`);
    filepath = await writeNewsCoverage(url, meta, summary, cleanedTranscript);
  } else if (type === 'meeting') {
    const meetingDate = dateOverride || meta.uploadDate;
    console.log('Generating meeting summary via Claude...');
    const meetingSummary = await generateMeetingSummary(meta.title, fullText);
    filepath = await writeMeeting(url, meta, meetingDate, entity, meetingSummary, cleanedTranscript);
  } else {
    console.log('Generating description via Claude...');
    const description = await generateResearchDescription(meta.title, fullText);
    console.log(`  Description: ${description}`);
    filepath = await writeResearch(url, meta, description, wordCount, cleanedTranscript);
  }

  console.log(`\nCreated: ${filepath}`);

  console.log('Adding internal links...');
  execSync(`npx tsx scripts/refine-internal-links.ts --write ${filepath}`, { stdio: 'inherit' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
