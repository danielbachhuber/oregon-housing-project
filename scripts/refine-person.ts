import fs from 'fs';
import path from 'path';
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

function buildLegislationList(): string {
  const dir = path.join(CONTENT_DIR, 'legislation');
  const entries: string[] = [];

  for (const yearDir of fs.readdirSync(dir)) {
    const yearPath = path.join(dir, yearDir);
    if (!fs.statSync(yearPath).isDirectory()) continue;

    for (const file of fs.readdirSync(yearPath)) {
      if (file === '_index.md' || !file.endsWith('.md')) continue;
      const title = extractTitle(path.join(yearPath, file));
      if (!title) continue;
      const slug = file.replace('.md', '');
      entries.push(`- ${title} (${yearDir}): /legislation/${yearDir}/${slug}`);
    }
  }

  return entries.join('\n');
}

function buildPeopleList(): string {
  const dir = path.join(CONTENT_DIR, 'people');
  const entries: string[] = [];

  for (const file of fs.readdirSync(dir)) {
    if (file === '_index.md' || !file.endsWith('.md')) continue;
    const title = extractTitle(path.join(dir, file));
    if (!title) continue;
    const slug = file.replace('.md', '');
    entries.push(`- ${title}: /people/${slug}`);
  }

  return entries.join('\n');
}

function buildCitiesList(): string {
  const dir = path.join(CONTENT_DIR, 'cities');
  const entries: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '_index.md') continue;

    if (entry.isDirectory()) {
      const indexPath = path.join(dir, entry.name, '_index.md');
      if (!fs.existsSync(indexPath)) continue;
      const title = extractTitle(indexPath);
      if (!title) continue;
      entries.push(`- ${title}: /cities/${entry.name}`);
    } else if (entry.name.endsWith('.md')) {
      const title = extractTitle(path.join(dir, entry.name));
      if (!title) continue;
      const slug = entry.name.replace('.md', '');
      entries.push(`- ${title}: /cities/${slug}`);
    }
  }

  return entries.join('\n');
}

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
  const legislationList = buildLegislationList();
  const peopleList = buildPeopleList();
  const citiesList = buildCitiesList();
  const exemplarProfiles = loadExemplarProfiles();

  const systemPrompt = `${template}

## Available Internal Links

### Legislation
${legislationList}

### People
${peopleList}

### Cities
${citiesList}

## Example Profiles

${exemplarProfiles}`;

  // Build user prompt
  const personName = isExisting
    ? (extractTitle(filePath) || slugToName(slug))
    : slugToName(slug);

  let userPrompt: string;
  if (isExisting) {
    userPrompt = `Refine and improve this existing profile for ${personName}. Keep any accurate information and citations, but improve the structure, add missing context, ensure proper internal linking, and fill in any gaps. Use web search to find additional relevant housing actions and citations.

Here is the existing profile:

${existingContent}`;
  } else {
    userPrompt = `Create a new profile for ${personName}. Research their role in Oregon housing policy and write a complete profile following the template instructions. Use web search to find relevant information and citations.`;
  }

  // Call Anthropic API
  console.log(`Calling Anthropic API (claude-sonnet-4-5-20250929) to ${isExisting ? 'refine' : 'create'} profile...`);

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const responseText = (msg.content[0] as Anthropic.TextBlock).text;

  // Strip any markdown code fences the model may wrap around the output
  const cleaned = responseText
    .replace(/^```(?:markdown|md)?\s*\n/, '')
    .replace(/\n```\s*$/, '');

  console.log(`\nGenerated profile (${cleaned.length} chars):\n`);

  if (dryRun) {
    console.log('--- START PREVIEW ---');
    console.log(cleaned);
    console.log('--- END PREVIEW ---');
    console.log('\n[DRY RUN] No files written. Run without --dry-run to save.');
  } else {
    fs.writeFileSync(filePath, cleaned);
    console.log(`Wrote profile to: ${filePath}`);
  }
}

main().catch(console.error);
