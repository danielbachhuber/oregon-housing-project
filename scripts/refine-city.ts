import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

// Configuration
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CONTENT_DIR = path.join(process.cwd(), 'content');
const TEMPLATES_DIR = path.join(process.cwd(), 'templates');

// Initialize Anthropic
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

// Exemplar city profiles used as style references
const EXEMPLAR_SLUGS = ['tualatin', 'canby'];

// --- Helpers ---

function extractTitle(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/^title\s*=\s*'([^']+)'/m)
    || content.match(/^title\s*=\s*"([^"]+)"/m);
  return match ? match[1] : null;
}

function slugToName(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Resolve the file path for a city slug.
 * All cities use the directory structure: content/cities/<slug>/_index.md
 */
function resolveCityPath(slug: string): { filePath: string; isExisting: boolean } {
  const dirPath = path.join(CONTENT_DIR, 'cities', slug);
  const filePath = path.join(dirPath, '_index.md');

  if (fs.existsSync(filePath)) {
    return { filePath, isExisting: true };
  }

  return { filePath, isExisting: false };
}

// --- Context Building ---

function loadExemplarProfiles(): string {
  const profiles: string[] = [];

  for (const slug of EXEMPLAR_SLUGS) {
    const { filePath, isExisting } = resolveCityPath(slug);
    if (!isExisting) continue;
    const content = fs.readFileSync(filePath, 'utf-8');
    profiles.push(`--- Example: ${slug} ---\n${content}\n--- End example ---`);
  }

  return profiles.join('\n\n');
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);
  const positionalArgs = args.filter(a => !a.startsWith('--'));
  const slug = positionalArgs[0];
  const dryRun = args.includes('--dry-run');

  if (!slug) {
    console.error('Usage: pnpm refine-city <slug> [--dry-run]');
    console.error('  e.g. pnpm refine-city tualatin');
    console.error('  e.g. pnpm refine-city bend --dry-run');
    process.exit(1);
  }

  if (!ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  if (dryRun) console.log('[DRY RUN] No files will be written.\n');

  const { filePath, isExisting } = resolveCityPath(slug);
  const existingContent = isExisting ? fs.readFileSync(filePath, 'utf-8') : null;

  if (isExisting) {
    console.log(`Found existing city profile: ${filePath}`);
  } else {
    console.log(`No existing city profile found. Will create new profile for: ${slug}`);
  }

  // Build context
  console.log('Building context...');
  const template = fs.readFileSync(path.join(TEMPLATES_DIR, 'city.md'), 'utf-8');
  const exemplarProfiles = loadExemplarProfiles();

  const systemPrompt = `You are a researcher writing city profiles for the Oregon Housing Project, a website focused on housing policy in Oregon.

${template}

## Example City Profiles

${exemplarProfiles}`;

  // Build user prompt
  const cityName = isExisting
    ? (extractTitle(filePath) || slugToName(slug))
    : slugToName(slug);

  let userPrompt: string;
  if (isExisting) {
    userPrompt = `Refine and improve this existing city profile for ${cityName}, Oregon. Keep any accurate information and citations, but improve the structure, add missing context, ensure proper internal linking, and fill in any gaps using the template instructions.

IMPORTANT: Respond with ONLY the markdown file content starting with +++. No preamble, no explanation, no code fences.

Here is the existing profile:

${existingContent}`;
  } else {
    userPrompt = `Create a new city profile for ${cityName}, Oregon. Research the city's housing situation and write a complete profile following the template instructions.

IMPORTANT: Respond with ONLY the markdown file content starting with +++. No preamble, no explanation, no code fences.`;
  }

  // Call Anthropic API with web search enabled
  console.log(`Calling Anthropic API (claude-opus-4-6) with web search to ${isExisting ? 'refine' : 'create'} city profile...`);

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 16384,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    tools: [{
      type: 'web_search_20250305' as const,
      name: 'web_search',
      max_uses: 10,
    }],
  });

  // Log search usage
  const searchRequests = (msg.usage as any).server_tool_use?.web_search_requests || 0;
  console.log(`  Web searches performed: ${searchRequests}`);

  // Extract the final text block(s) from the response — web search responses
  // contain interleaved text, server_tool_use, and web_search_tool_result blocks
  const responseText = msg.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');

  // Extract the markdown content: find the front matter start and strip any preamble/fences
  let cleaned = responseText;
  // Strip markdown code fences
  cleaned = cleaned.replace(/^```(?:markdown|md)?\s*\n/, '').replace(/\n```\s*$/, '');
  // If model included preamble before the front matter, extract from +++ onward
  const frontMatterStart = cleaned.indexOf('+++');
  if (frontMatterStart > 0) {
    cleaned = cleaned.substring(frontMatterStart);
  }
  // Ensure file ends with a newline
  if (!cleaned.endsWith('\n')) {
    cleaned += '\n';
  }

  console.log(`\nGenerated city profile (${cleaned.length} chars):\n`);

  if (dryRun) {
    console.log('--- START PREVIEW ---');
    console.log(cleaned);
    console.log('--- END PREVIEW ---');
    console.log('\n[DRY RUN] No files written. Run without --dry-run to save.');
  } else {
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(filePath, cleaned);
    console.log(`Wrote city profile to: ${filePath}`);

    // Run refine-internal-links to add internal links to this file
    console.log('\nRunning refine-internal-links --write...');
    execSync(`pnpm refine-internal-links ${filePath} --write`, { stdio: 'inherit' });
  }
}

main().catch(console.error);
