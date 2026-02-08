import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function parseArticle(filepath: string): { frontMatter: string; summary: string; title: string } {
  const content = fs.readFileSync(filepath, 'utf-8');
  const match = content.match(/^\+\+\+\n([\s\S]*?)\n\+\+\+\n\n?([\s\S]*)$/);
  if (!match) throw new Error(`Could not parse front matter in ${filepath}`);

  const frontMatter = match[1];
  const summary = match[2].trim();
  const titleMatch = frontMatter.match(/title\s*=\s*'(.+?)'/);
  const title = titleMatch ? titleMatch[1] : '';

  return { frontMatter, summary, title };
}

async function regenerateSummary(title: string, currentSummary: string): Promise<string> {
  const prompt = `Rewrite this news article summary to be 2-3 short sentences. Each sentence should be concise and direct. Preserve all existing markdown links exactly as they appear. Do not add any new information.

Article title: ${title}
Current summary: ${currentSummary}

Respond with ONLY the rewritten summary paragraph, no preamble or explanation.`;

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  return (msg.content[0] as any).text.trim();
}

async function main() {
  const dir = path.join(process.cwd(), 'content/news-coverage/2026');
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md') && f !== '_index.md')
    .map(f => path.join(dir, f));

  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');

  for (const filepath of files) {
    const filename = path.basename(filepath);
    const { frontMatter, summary, title } = parseArticle(filepath);

    // Count sentences roughly
    const sentenceCount = summary.split(/[.!?]+\s/).filter(s => s.trim()).length;
    if (!force && sentenceCount <= 3) {
      console.log(`[SKIP] ${filename} (${sentenceCount} sentences)`);
      continue;
    }

    console.log(`[REGEN] ${filename} (${sentenceCount} sentences)`);

    const newSummary = await regenerateSummary(title, summary);

    if (dryRun) {
      console.log(`  -> [DRY RUN] New summary: ${newSummary.substring(0, 120)}...`);
    } else {
      const newContent = `+++\n${frontMatter}\n+++\n\n${newSummary}\n`;
      fs.writeFileSync(filepath, newContent);
      console.log(`  -> Updated: ${newSummary.substring(0, 120)}...`);
    }
  }

  console.log('Done.');
}

main().catch(console.error);
