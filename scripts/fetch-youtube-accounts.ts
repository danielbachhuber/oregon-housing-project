import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import 'dotenv/config';

const ACCOUNTS: {
  id: string;
  channelId: string;
  captureArgs: string;
}[] = [
  {
    id: 'hfoinvestmentrealestate',
    channelId: 'UCdkwHMx8xf6tbgBC0T2DZKw',
    captureArgs: '--type news-coverage',
  },
  {
    id: 'oregondlcd',
    channelId: 'UCnwvgu7RwSIAh0i1iaPVlyQ',
    captureArgs: '--type meeting --entity dlcd',
  },
];

const SIX_WEEKS_MS = 6 * 7 * 24 * 60 * 60 * 1000;

function getProcessedUrlsPath(accountId: string): string {
  return path.join(process.cwd(), 'content', 'news-coverage', 'data', `processed-youtube-${accountId}-urls.txt`);
}

function loadProcessedUrls(accountId: string): Set<string> {
  const filepath = getProcessedUrlsPath(accountId);
  if (!fs.existsSync(filepath)) return new Set();
  return new Set(
    fs.readFileSync(filepath, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
  );
}

function saveProcessedUrl(accountId: string, url: string): void {
  const filepath = getProcessedUrlsPath(accountId);
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.appendFileSync(filepath, url + '\n');
}

interface VideoEntry {
  url: string;
  title: string;
  published: Date;
}

async function fetchRecentVideos(channelId: string): Promise<VideoEntry[]> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const resp = await axios.get(feedUrl, { timeout: 15000 });
  const parsed = await parseStringPromise(resp.data);
  const entries = parsed.feed?.entry || [];
  const cutoff = new Date(Date.now() - SIX_WEEKS_MS);

  const videos: VideoEntry[] = [];
  for (const entry of entries) {
    const videoId = entry['yt:videoId']?.[0];
    const title = entry.title?.[0];
    const published = new Date(entry.published?.[0]);
    if (!videoId || !title || isNaN(published.getTime())) continue;
    if (published < cutoff) continue;
    videos.push({
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title,
      published,
    });
  }

  return videos;
}

async function main() {
  const args = process.argv.slice(2);
  const accountId = args[0];

  if (!accountId) {
    console.error(`Usage: tsx scripts/fetch-youtube-accounts.ts <account-id>`);
    console.error(`Available accounts: ${ACCOUNTS.map(a => a.id).join(', ')}`);
    process.exit(1);
  }

  const account = ACCOUNTS.find(a => a.id === accountId);
  if (!account) {
    console.error(`Unknown account: ${accountId}`);
    console.error(`Available accounts: ${ACCOUNTS.map(a => a.id).join(', ')}`);
    process.exit(1);
  }

  console.log(`Fetching recent videos for ${account.id}...`);
  const processedUrls = loadProcessedUrls(account.id);
  console.log(`  ${processedUrls.size} previously processed URLs`);

  const videos = await fetchRecentVideos(account.channelId);
  console.log(`  ${videos.length} videos published within the last 6 weeks`);

  const newVideos = videos.filter(v => !processedUrls.has(v.url));
  console.log(`  ${newVideos.length} new videos to process`);

  if (newVideos.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  for (const video of newVideos) {
    console.log(`\nProcessing: ${video.title}`);
    console.log(`  URL: ${video.url}`);
    console.log(`  Published: ${video.published.toISOString().split('T')[0]}`);

    try {
      const cmd = `npx tsx scripts/capture-youtube.ts "${video.url}" ${account.captureArgs}`;
      execSync(cmd, { stdio: 'inherit', timeout: 300000 });
      saveProcessedUrl(account.id, video.url);
      console.log(`  Done.`);
    } catch (err: any) {
      console.error(`  Error processing ${video.url}: ${err.message}`);
      // Still mark as processed to avoid retrying failures indefinitely
      saveProcessedUrl(account.id, video.url);
    }
  }

  console.log('\nFinished.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
