import axios from 'axios';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://api.oregonlegislature.gov/odata/odataservice.svc';
const LEGISLATION_DIR = path.join(process.cwd(), 'content/legislation');

interface LegislativeSession {
  SessionKey: string;
  SessionName: string;
  BeginDate: string;
  EndDate: string | null;
}

/**
 * Discovers which legislative sessions need daily fetching/refining.
 *
 * A session needs updating if it's from the current or previous year AND:
 * 1. We already track it (bills may still be getting signed after session ends), OR
 * 2. It's a new session we don't yet track (e.g., a special session was called)
 *
 * Older sessions (2+ years ago) are considered stable and skipped.
 * Interim sessions (*I1) are excluded as they don't contain legislation.
 *
 * Outputs one line per session: "YEAR SESSION_CODE"
 * e.g., "2026 R1" or "2025 S1"
 */
async function main() {
  const response = await axios.get<{ value: LegislativeSession[] }>(
    `${BASE_URL}/LegislativeSessions?$format=json`,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      timeout: 15000,
    }
  );

  const sessions = response.data.value;

  // Get existing session directories
  const existingDirs = new Set<string>();
  for (const entry of fs.readdirSync(LEGISLATION_DIR)) {
    const fullPath = path.join(LEGISLATION_DIR, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      existingDirs.add(entry);
    }
  }

  const currentYear = new Date().getFullYear();
  const results: string[] = [];

  for (const session of sessions) {
    const { SessionKey } = session;

    // Skip interim sessions
    if (SessionKey.includes('I')) continue;

    // Parse session key: "2025R1" → year=2025, session=R1
    const match = SessionKey.match(/^(\d{4})(.+)$/);
    if (!match) continue;
    const [, year, sessionType] = match;
    const yearNum = parseInt(year, 10);

    // Determine the expected directory name
    const dirName = sessionCodeToDir(SessionKey);

    // Only include sessions from the current or previous year
    const isRecent = yearNum >= currentYear - 1;

    if (isRecent) {
      results.push(`${year} ${sessionType}`);
    }
  }

  // Output each session on its own line
  for (const line of results) {
    console.log(line);
  }
}

function sessionCodeToDir(sessionCode: string): string {
  const match = sessionCode.match(/^(\d{4})(R|S)(\d+)$/);
  if (!match) return sessionCode;
  const [, year, type, num] = match;
  if (type === 'R') return `${year}-regular-session`;
  const ordinals = ['first', 'second', 'third', 'fourth', 'fifth'];
  const ordinal = ordinals[parseInt(num) - 1] || num;
  return `${year}-${ordinal}-special-session`;
}

main().catch((err) => {
  console.error(`Error discovering sessions: ${err.message}`);
  process.exit(1);
});
