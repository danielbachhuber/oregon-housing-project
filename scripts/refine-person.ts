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

// Exemplar profiles used as style references
const EXEMPLAR_SLUGS = ['keith-wilson', 'tina-kotek'];

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

// --- Context Building ---

function loadExemplarProfiles(): string {
  const profiles: string[] = [];

  for (const slug of EXEMPLAR_SLUGS) {
    const filePath = path.join(CONTENT_DIR, 'people', `${slug}.md`);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf-8');
    profiles.push(`--- Example: ${slug}.md ---\n${content}\n--- End example ---`);
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
    console.error('Usage: pnpm refine-person <slug> [--dry-run]');
    console.error('  e.g. pnpm refine-person tina-kotek');
    console.error('  e.g. pnpm refine-person tina-kotek --dry-run');
    process.exit(1);
  }

  if (!ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  if (dryRun) console.log('[DRY RUN] No files will be written.\n');

  const filePath = path.join(CONTENT_DIR, 'people', `${slug}.md`);
  const isExisting = fs.existsSync(filePath);
  const existingContent = isExisting ? fs.readFileSync(filePath, 'utf-8') : null;

  if (isExisting) {
    console.log(`Found existing profile: ${filePath}`);
  } else {
    console.log(`No existing profile found. Will create new profile for: ${slug}`);
  }

  // Build context
  console.log('Building context...');
  const template = fs.readFileSync(path.join(TEMPLATES_DIR, 'person.md'), 'utf-8');
  const exemplarProfiles = loadExemplarProfiles();

  const systemPrompt = `${template}

## Example Profiles

${exemplarProfiles}`;

  // Build user prompt
  const personName = isExisting
    ? (extractTitle(filePath) || slugToName(slug))
    : slugToName(slug);

  let userPrompt: string;
  if (isExisting) {
    userPrompt = `Refine and improve this existing profile for ${personName}. Keep any accurate information and citations, but improve the structure, add missing context, ensure proper internal linking, and fill in any gaps.

IMPORTANT: Respond with ONLY the markdown file content starting with +++. No preamble, no explanation, no code fences.

Here is the existing profile:

${existingContent}`;
  } else {
    userPrompt = `Create a new profile for ${personName}. Research their role in Oregon housing policy and write a complete profile following the template instructions.

IMPORTANT: Respond with ONLY the markdown file content starting with +++. No preamble, no explanation, no code fences.`;
  }

  // Call Anthropic API with web search enabled
  console.log(`Calling Anthropic API (claude-opus-4-6) with web search to ${isExisting ? 'refine' : 'create'} profile...`);

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

  console.log(`\nGenerated profile (${cleaned.length} chars):\n`);

  if (dryRun) {
    console.log('--- START PREVIEW ---');
    console.log(cleaned);
    console.log('--- END PREVIEW ---');
    console.log('\n[DRY RUN] No files written. Run without --dry-run to save.');
  } else {
    fs.writeFileSync(filePath, cleaned);
    console.log(`Wrote profile to: ${filePath}`);

    // Run refine-internal-links to add internal links to this file
    console.log('\nRunning refine-internal-links --write...');
    execSync(`pnpm refine-internal-links ${filePath} --write`, { stdio: 'inherit' });
  }
}

main().catch(console.error);
