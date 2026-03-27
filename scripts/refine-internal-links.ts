import fs from 'fs';
import path from 'path';

const CONTENT_DIR = path.join(process.cwd(), 'content');

// --- Types ---

interface Entity {
  type: 'legislation' | 'people' | 'cities';
  name: string;        // display name, e.g. "HB 2138", "Tina Kotek", "Portland"
  url: string;         // e.g. "/legislation/2025/hb-2138"
  patterns: RegExp[];  // word-boundary patterns to match in text
}

interface Change {
  line: number;
  original: string;
  replaced: string;
  entityName: string;
  entityUrl: string;
}

// --- Entity Registry ---

function extractTitle(filePath: string): string | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/^title\s*=\s*'([^']+)'/m)
    || content.match(/^title\s*=\s*"([^"]+)"/m);
  return match ? match[1] : null;
}

function buildPeopleEntities(): Entity[] {
  const dir = path.join(CONTENT_DIR, 'people');
  const entities: Entity[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (file === '_index.md' || !file.endsWith('.md')) continue;
    const title = extractTitle(path.join(dir, file));
    if (!title) continue;
    const slug = file.replace('.md', '');
    entities.push({
      type: 'people',
      name: title,
      url: `/people/${slug}`,
      patterns: [new RegExp(`\\b${escapeRegex(title)}\\b`, 'g')],
    });
  }
  return entities;
}

function buildCityEntities(): Entity[] {
  const dir = path.join(CONTENT_DIR, 'cities');
  const entities: Entity[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '_index.md') continue;

    if (entry.isDirectory()) {
      const indexPath = path.join(dir, entry.name, '_index.md');
      if (!fs.existsSync(indexPath)) continue;
      const title = extractTitle(indexPath);
      if (!title) continue;
      entities.push({
        type: 'cities',
        name: title,
        url: `/cities/${entry.name}`,
        // Negative lookahead: don't match "Portland" in "Portland Housing Bureau" or "Portland-area"
        patterns: [new RegExp(`\\b${escapeRegex(title)}\\b(?!\\s+[A-Z])(?!-)`, 'g')],
      });
    } else if (entry.name.endsWith('.md')) {
      const title = extractTitle(path.join(dir, entry.name));
      if (!title) continue;
      const slug = entry.name.replace('.md', '');
      entities.push({
        type: 'cities',
        name: title,
        url: `/cities/${slug}`,
        // Negative lookahead: don't match city name as part of a compound proper noun
        patterns: [new RegExp(`\\b${escapeRegex(title)}\\b(?!\\s+[A-Z])(?!-)`, 'g')],
      });
    }
  }
  return entities;
}

// Legislation prefix mappings for long-form matching
const LEGISLATION_LONG_FORMS: Record<string, string> = {
  'HB': 'House Bill',
  'SB': 'Senate Bill',
  'HJR': 'House Joint Resolution',
  'SJR': 'Senate Joint Resolution',
  'HCR': 'House Concurrent Resolution',
  'SCR': 'Senate Concurrent Resolution',
};

function buildLegislationEntities(): { entities: Entity[]; ambiguous: string[] } {
  const dir = path.join(CONTENT_DIR, 'legislation');
  const entities: Entity[] = [];

  // First pass: collect all bill numbers to detect ambiguity
  const billNumberToYears = new Map<string, string[]>();

  for (const yearDir of fs.readdirSync(dir)) {
    const yearPath = path.join(dir, yearDir);
    if (!fs.statSync(yearPath).isDirectory()) continue;
    if (yearDir === '_index.md') continue;

    for (const file of fs.readdirSync(yearPath)) {
      if (file === '_index.md' || !file.endsWith('.md')) continue;
      const title = extractTitle(path.join(yearPath, file));
      if (!title) continue;

      const existing = billNumberToYears.get(title) || [];
      existing.push(yearDir);
      billNumberToYears.set(title, existing);
    }
  }

  // Identify ambiguous bill numbers
  const ambiguous: string[] = [];
  for (const [title, years] of billNumberToYears) {
    if (years.length > 1) {
      ambiguous.push(title);
    }
  }

  // Second pass: build entities, skipping ambiguous ones
  for (const yearDir of fs.readdirSync(dir)) {
    const yearPath = path.join(dir, yearDir);
    if (!fs.statSync(yearPath).isDirectory()) continue;

    for (const file of fs.readdirSync(yearPath)) {
      if (file === '_index.md' || !file.endsWith('.md')) continue;
      const title = extractTitle(path.join(yearPath, file));
      if (!title) continue;
      if (ambiguous.includes(title)) continue;

      const slug = file.replace('.md', '');
      const url = `/legislation/${yearDir}/${slug}`;
      const patterns: RegExp[] = [];

      // Short form: exact title match (e.g. "HB 2138", "SB 100", "EO 23-04", "Measure 5", "SJR202")
      patterns.push(new RegExp(`\\b${escapeRegex(title)}\\b`, 'g'));

      // Long form: e.g. "House Bill 2138" → links as "HB 2138"
      const prefixMatch = title.match(/^(HB|SB|HJR|SJR|HCR|SCR)\s+(.+)$/);
      if (prefixMatch) {
        const longForm = LEGISLATION_LONG_FORMS[prefixMatch[1]];
        if (longForm) {
          patterns.push(new RegExp(`\\b${escapeRegex(longForm)}\\s+${escapeRegex(prefixMatch[2])}\\b`, 'g'));
        }
      }

      entities.push({
        type: 'legislation',
        name: title,
        url,
        patterns,
      });
    }
  }

  return { entities, ambiguous };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Protected Zones ---

interface ProtectedZone {
  start: number;
  end: number;
}

function findProtectedZones(content: string): ProtectedZone[] {
  const zones: ProtectedZone[] = [];

  // Front matter (TOML +++ blocks)
  const fmMatch = content.match(/^\+\+\+\n[\s\S]*?\n\+\+\+/);
  if (fmMatch) {
    zones.push({ start: 0, end: fmMatch[0].length });
  }

  // Fenced code blocks
  for (const m of content.matchAll(/^```[^\n]*\n[\s\S]*?^```/gm)) {
    zones.push({ start: m.index!, end: m.index! + m[0].length });
  }

  // Inline code
  for (const m of content.matchAll(/`[^`]+`/g)) {
    zones.push({ start: m.index!, end: m.index! + m[0].length });
  }

  // HTML comments
  for (const m of content.matchAll(/<!--[\s\S]*?-->/g)) {
    zones.push({ start: m.index!, end: m.index! + m[0].length });
  }

  return zones;
}

function isInProtectedZone(pos: number, zones: ProtectedZone[]): boolean {
  return zones.some(z => pos >= z.start && pos < z.end);
}

// Per-line protections: headings, existing links, footnote definitions
function isLineLevelProtected(line: string): boolean {
  // Headings
  if (/^#+\s/.test(line)) return true;
  // Footnote definition lines
  if (/^\[\^\d+\]:/.test(line)) return true;
  return false;
}

// Check if a match position is inside an existing markdown link or image
function isInsideLink(line: string, matchStart: number, matchEnd: number): boolean {
  // Find all markdown links and images in the line: [...](...)  ![...](...)
  const linkRegex = /!?\[([^\]]*)\]\([^)]*\)/g;
  let m;
  while ((m = linkRegex.exec(line)) !== null) {
    const linkStart = m.index;
    const linkEnd = m.index + m[0].length;
    if (matchStart >= linkStart && matchEnd <= linkEnd) return true;
  }
  return false;
}

// --- File Processing ---

function getFileEntityUrl(filePath: string): string | null {
  // Determine the URL for a content file (for self-link detection)
  const rel = path.relative(CONTENT_DIR, filePath);
  // e.g. "people/tina-kotek.md" → "/people/tina-kotek"
  // e.g. "cities/canby/_index.md" → "/cities/canby"
  // e.g. "legislation/2025/hb-2138.md" → "/legislation/2025/hb-2138"
  let url = '/' + rel.replace(/\.md$/, '').replace(/_index$/, '').replace(/\/$/, '');
  return url;
}

function processFile(
  filePath: string,
  entities: Entity[],
  writeMode: boolean,
): Change[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileUrl = getFileEntityUrl(filePath);
  const protectedZones = findProtectedZones(content);

  // Build a set of entity URLs already linked in this file
  const existingLinks = new Set<string>();
  const linkRegex = /\]\(([^)]+)\)/g;
  let lm;
  while ((lm = linkRegex.exec(content)) !== null) {
    existingLinks.add(lm[1]);
  }

  const lines = content.split('\n');
  const changes: Change[] = [];

  // Track which entities have been linked in this file (first occurrence only)
  const linkedEntities = new Set<string>();

  // Compute line offsets for protected zone checking
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1; // +1 for \n
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip line-level protected zones
    if (isLineLevelProtected(line)) continue;

    // Check if entire line is in a protected zone (front matter, code block, etc.)
    const lineStart = lineOffsets[i];
    const lineEnd = lineStart + line.length;
    if (isInProtectedZone(lineStart, protectedZones)) continue;

    let newLine = line;
    let lineChanged = false;

    for (const entity of entities) {
      // Skip self-links
      if (fileUrl === entity.url) continue;

      // Skip if already linked anywhere in file
      if (existingLinks.has(entity.url)) continue;

      // Skip if already linked in this run
      if (linkedEntities.has(entity.url)) continue;

      for (const pattern of entity.patterns) {
        // Reset regex lastIndex
        pattern.lastIndex = 0;

        const match = pattern.exec(newLine);
        if (!match) continue;

        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        // Check if the match is inside a markdown link
        if (isInsideLink(newLine, matchStart, matchEnd)) continue;

        // Check if position is in a file-level protected zone
        if (isInProtectedZone(lineStart + matchStart, protectedZones)) continue;

        // Determine display text: for long-form legislation, use short form
        let displayText = entity.name;
        // If this matched a long form pattern (not the first pattern), use the short name
        if (entity.patterns.indexOf(pattern) > 0) {
          displayText = entity.name;
        }

        const replacement = `[${displayText}](${entity.url})`;
        newLine = newLine.substring(0, matchStart) + replacement + newLine.substring(matchEnd);

        linkedEntities.add(entity.url);
        lineChanged = true;

        changes.push({
          line: i + 1,
          original: match[0],
          replaced: replacement,
          entityName: entity.name,
          entityUrl: entity.url,
        });

        // Only link first occurrence, so break out of pattern loop
        break;
      }
    }

    if (lineChanged) {
      lines[i] = newLine;
    }
  }

  if (writeMode && changes.length > 0) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }

  return changes;
}

// --- Main ---

function getAllContentFiles(): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  walk(CONTENT_DIR);
  return files;
}

function main() {
  const args = process.argv.slice(2);
  const writeMode = args.includes('--write');
  const positionalArgs = args.filter(a => !a.startsWith('--'));
  const targetFile = positionalArgs[0] || null;

  // Build entity registry
  const people = buildPeopleEntities();
  const cities = buildCityEntities();
  const { entities: legislation, ambiguous } = buildLegislationEntities();

  // Sort each group: longer names first (more specific matches first)
  const sortByLength = (a: Entity, b: Entity) => b.name.length - a.name.length;
  people.sort(sortByLength);
  cities.sort(sortByLength);
  legislation.sort(sortByLength);

  // Priority order: legislation → people → cities
  const allEntities = [...legislation, ...people, ...cities];

  console.log('Entity Registry:');
  console.log(`  People: ${people.length} entities`);
  console.log(`  Cities: ${cities.length} entities`);
  const ambigNote = ambiguous.length > 0
    ? ` (${ambiguous.length} ambiguous, skipped: ${ambiguous.join(', ')})`
    : '';
  console.log(`  Legislation: ${legislation.length} entities${ambigNote}`);
  console.log('');

  // Determine which files to process
  let contentFiles: string[];
  if (targetFile) {
    const resolvedPath = path.resolve(targetFile);
    if (!fs.existsSync(resolvedPath)) {
      console.error(`Error: File not found: ${resolvedPath}`);
      process.exit(1);
    }
    contentFiles = [resolvedPath];
    console.log(`Processing single file: ${targetFile}\n`);
  } else {
    contentFiles = getAllContentFiles();
  }

  let filesWithChanges = 0;
  let totalLinks = 0;

  for (const file of contentFiles) {
    const changes = processFile(file, allEntities, writeMode);
    if (changes.length > 0) {
      filesWithChanges++;
      totalLinks += changes.length;

      const relPath = path.relative(process.cwd(), file);
      console.log(`${relPath}:`);
      for (const change of changes) {
        console.log(`  Line ${change.line}: "${change.original}" → [${change.entityName}](${change.entityUrl})`);
      }
      console.log('');
    }
  }

  console.log('Summary:');
  console.log(`  Files scanned: ${contentFiles.length}`);
  console.log(`  Files with changes: ${filesWithChanges}`);
  console.log(`  Total links added: ${totalLinks}`);

  if (!writeMode && totalLinks > 0) {
    console.log('');
    console.log('Run with --write to apply changes.');
  }
}

main();
