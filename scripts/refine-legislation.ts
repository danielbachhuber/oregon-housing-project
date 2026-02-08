import fs from 'fs';
import path from 'path';
import axios from 'axios';

const BASE_URL = 'https://api.oregonlegislature.gov/odata/odataservice.svc';
const LEGISLATION_DIR = path.join(process.cwd(), 'content/legislation');

const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
};

// --- Interfaces ---

interface ODataMeasure {
  SessionKey: string;
  MeasurePrefix: string;
  MeasureNumber: number;
  CatchLine: string;
  MinorityCatchLine: string | null;
  MeasureSummary: string | null;
  CurrentVersion: string | null;
  RelatingToFull: string | null;
  RelatingTo: string | null;
  AtTheRequestOf: string | null;
  ChapterNumber: string | null;
  CurrentLocation: string;
  CurrentCommitteeCode: string | null;
  CurrentSubCommittee: string | null;
  FiscalImpact: string | null;
  RevenueImpact: string | null;
  EmergencyClause: boolean;
  EffectiveDate: string | null;
  FiscalAnalyst: string | null;
  RevenueEconomist: string | null;
  LCNumber: number | null;
  Vetoed: boolean;
  CreatedDate: string;
  ModifiedDate: string;
  PrefixMeaning: string;
}

interface ODataSponsor {
  MeasureSponsorId: string;
  SessionKey: string;
  MeasurePrefix: string;
  MeasureNumber: number;
  SponsorType: string;
  LegislatoreCode: string | null;
  CommitteeCode: string | null;
  SponsorLevel: string;
  PrintOrder: string;
  PresessionFiledMessage: string | null;
  CreatedDate: string;
  ModifiedDate: string | null;
}

interface ODataHistoryAction {
  MeasureHistoryId: number;
  SessionKey: string;
  MeasurePrefix: string;
  MeasureNumber: number;
  Chamber: string;
  ActionDate: string;
  ActionText: string;
  VoteText: string | null;
  CreatedDate: string;
  ModifiedDate: string | null;
  PublicNotification: boolean;
}

interface ODataDocument {
  SessionKey: string;
  MeasurePrefix: string;
  MeasureNumber: number;
  VersionDescription: string;
  DocumentUrl: string;
  CreatedDate: string;
  ModifiedDate: string | null;
}

interface ODataLegislator {
  SessionKey: string;
  LegislatorCode: string;
  FirstName: string;
  LastName: string;
  CapitolAddress: string;
  CapitolPhone: string;
  Title: string;
  Chamber: string;
  Party: string;
  DistrictNumber: string;
  EmailAddress: string;
  WebSiteUrl: string;
}

interface ODataTestimony {
  CommTestId: number;
  SubmitterFirstName: string;
  SubmitterLastName: string;
  BehalfOf: string | null;
  Organization: string | null;
  DocumentDescription: string | null;
  CreatedDate: string;
  ModifiedDate: string | null;
  PdfCreatedFlag: string | null;
  PositionOnMeasureId: number | null;
  SessionKey: string;
  CommitteeCode: string | null;
  MeetingDate: string | null;
  MeasurePrefix: string;
  MeasureNumber: number;
  DocumentUrl: string | null;
  FirstName: string | null;
  LastName: string | null;
  ExecApptId: number | null;
  Topic: string | null;
}

interface SponsorInfo {
  name: string;
  slug: string;
  level: string;
  party: string;
  district: string;
}

interface TestimonyInfo {
  name: string;
  organization: string;
  position: string;
  date: string;
  file: string;
  url: string;
}

// Position ID mapping (observed from HB 4035 cross-referenced with OLIS website)
const POSITION_MAP: Record<number, string> = {
  3983: 'Support',
  3982: 'Oppose',
  3981: 'Neutral',
};

// --- TOML helpers ---

function tomlString(value: string): string {
  if (value.includes("'")) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return `'${value}'`;
}

function cleanText(text: string): string {
  return text.replace(/\t/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

// Match the slug generation from fetch-legislation.ts
function legislatorSlug(legislator: ODataLegislator): string {
  const firstName = legislator.FirstName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const lastName = legislator.LastName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${firstName}-${lastName}`;
}

function nameToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-');
}

// --- API fetching ---

async function fetchJSON<T>(url: string): Promise<T[]> {
  const response = await axios.get<{ value: T[] }>(url, {
    headers: HEADERS,
    timeout: 30000
  });
  return response.data.value;
}

async function loadOrFetchLegislators(sessionCode: string, year: string): Promise<Map<string, ODataLegislator>> {
  const dataDir = path.join(LEGISLATION_DIR, year, 'data');
  const cachePath = path.join(dataDir, `legislators-${sessionCode}.json`);

  if (fs.existsSync(cachePath)) {
    console.log(`Loading cached legislators from ${cachePath}`);
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as ODataLegislator[];
    const map = new Map<string, ODataLegislator>();
    for (const leg of data) {
      map.set(leg.LegislatorCode, leg);
    }
    return map;
  }

  console.log(`Fetching legislators for session ${sessionCode}...`);
  const url = `${BASE_URL}/Legislators?$format=json&$filter=SessionKey eq '${sessionCode}'`;
  const legislators = await fetchJSON<ODataLegislator>(url);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(cachePath, JSON.stringify(legislators, null, 2));
  console.log(`Cached ${legislators.length} legislators to ${cachePath}`);

  const map = new Map<string, ODataLegislator>();
  for (const leg of legislators) {
    map.set(leg.LegislatorCode, leg);
  }
  return map;
}

// --- Testimony fetching ---

async function fetchAllTestimony(filter: string): Promise<ODataTestimony[]> {
  const allRecords: ODataTestimony[] = [];
  const PAGE_SIZE = 40;
  let skip = 0;

  while (true) {
    const encodedFilter = encodeURIComponent(filter);
    const url = `${BASE_URL}/CommitteePublicTestimonies?$format=json&$filter=${encodedFilter}&$top=${PAGE_SIZE}&$skip=${skip}`;
    const page = await fetchJSON<ODataTestimony>(url);
    allRecords.push(...page);
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return allRecords;
}

async function downloadTestimonyPdf(
  commTestId: number,
  sessionCode: string,
  destPath: string
): Promise<boolean> {
  if (fs.existsSync(destPath)) return true;

  const url = `https://olis.oregonlegislature.gov/liz/${sessionCode}/Downloads/PublicTestimonyDocument/${commTestId}`;
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: HEADERS,
      timeout: 30000
    });
    fs.writeFileSync(destPath, response.data);
    return true;
  } catch (e: any) {
    console.error(`  Failed to download testimony ${commTestId}: ${e.message}`);
    return false;
  }
}

function positionLabel(positionId: number | null): string {
  if (positionId === null) return 'Unknown';
  return POSITION_MAP[positionId] || 'Unknown';
}

// --- Sponsor resolution ---

function extractSponsorsFromAtTheRequestOf(
  atTheRequestOf: string,
  legislators: Map<string, ODataLegislator>
): SponsorInfo[] {
  // Extract representative names from strings like:
  // "(at the request of ... for Representative Pam Marsh)"
  const match = atTheRequestOf.match(/for (?:Representative|Senator) ([\w\s.]+)\)/i);
  if (!match) return [];

  const name = match[1].trim();
  // Try to find this legislator in the map by name
  for (const [, leg] of legislators) {
    const fullName = `${leg.FirstName} ${leg.LastName}`;
    if (fullName === name) {
      return [{
        name: fullName,
        slug: legislatorSlug(leg),
        level: 'Chief',
        party: leg.Party,
        district: leg.DistrictNumber
      }];
    }
  }

  // Fallback: return with limited info
  return [{
    name,
    slug: nameToSlug(name),
    level: 'Chief',
    party: '',
    district: ''
  }];
}

function buildSponsors(
  sponsorRecords: ODataSponsor[],
  legislators: Map<string, ODataLegislator>,
  atTheRequestOf: string | null
): SponsorInfo[] {
  const linkedSponsors = sponsorRecords.filter(s => s.LegislatoreCode);

  if (linkedSponsors.length > 0) {
    return linkedSponsors.map(s => {
      const leg = legislators.get(s.LegislatoreCode!);
      if (leg) {
        return {
          name: `${leg.FirstName} ${leg.LastName}`,
          slug: legislatorSlug(leg),
          level: s.SponsorLevel,
          party: leg.Party,
          district: leg.DistrictNumber
        };
      }
      return {
        name: s.LegislatoreCode!,
        slug: nameToSlug(s.LegislatoreCode!),
        level: s.SponsorLevel,
        party: '',
        district: ''
      };
    });
  }

  // No legislator-linked sponsors; try extracting from AtTheRequestOf
  if (atTheRequestOf) {
    return extractSponsorsFromAtTheRequestOf(atTheRequestOf, legislators);
  }

  return [];
}

// --- Front matter generation ---

function buildFrontMatter(
  measure: ODataMeasure,
  sponsors: SponsorInfo[],
  documents: ODataDocument[],
  history: ODataHistoryAction[],
  testimony: TestimonyInfo[],
  sessionCode: string
): string {
  const billNumber = `${measure.MeasurePrefix}${measure.MeasureNumber}`;
  const displayTitle = `${measure.MeasurePrefix} ${measure.MeasureNumber}`;
  const chamber = measure.MeasurePrefix.startsWith('H') ? 'House' : 'Senate';
  const date = measure.CreatedDate ? measure.CreatedDate.split('T')[0] : '';
  const modifiedDate = measure.ModifiedDate ? measure.ModifiedDate.split('T')[0] : '';
  const billUrl = `https://olis.oregonlegislature.gov/liz/${sessionCode}/Measures/Overview/${billNumber}`;

  let fm = '';

  fm += `title = ${tomlString(displayTitle)}\n`;
  fm += `date = '${date}'\n`;
  fm += `bill_number = '${billNumber}'\n`;
  fm += `session = '${sessionCode}'\n`;
  fm += `chamber = '${chamber}'\n`;
  fm += `status = ${tomlString(measure.CurrentLocation || '')}\n`;
  fm += `catch_line = ${tomlString(cleanText(measure.CatchLine || ''))}\n`;

  if (measure.MeasureSummary) {
    fm += `summary = ${tomlString(cleanText(measure.MeasureSummary))}\n`;
  }

  if (measure.RelatingTo) {
    fm += `relating_to = ${tomlString(cleanText(measure.RelatingTo))}\n`;
  }

  if (measure.AtTheRequestOf) {
    fm += `at_the_request_of = ${tomlString(cleanText(measure.AtTheRequestOf))}\n`;
  }

  if (measure.CurrentCommitteeCode) {
    fm += `current_committee = '${measure.CurrentCommitteeCode}'\n`;
  }

  if (measure.FiscalImpact) {
    fm += `fiscal_impact = ${tomlString(measure.FiscalImpact)}\n`;
  }

  if (measure.RevenueImpact) {
    fm += `revenue_impact = ${tomlString(measure.RevenueImpact)}\n`;
  }

  fm += `emergency_clause = ${measure.EmergencyClause}\n`;
  fm += `vetoed = ${measure.Vetoed}\n`;
  fm += `introduced_date = '${date}'\n`;

  if (modifiedDate) {
    fm += `modified_date = '${modifiedDate}'\n`;
  }

  fm += `bill_url = '${billUrl}'\n`;

  // Sponsors array of tables
  for (const sponsor of sponsors) {
    fm += `\n[[sponsors]]\n`;
    fm += `name = ${tomlString(sponsor.name)}\n`;
    fm += `slug = '${sponsor.slug}'\n`;
    fm += `level = '${sponsor.level}'\n`;
    if (sponsor.party) {
      fm += `party = '${sponsor.party}'\n`;
    }
    if (sponsor.district) {
      fm += `district = '${sponsor.district}'\n`;
    }
  }

  // Documents array of tables
  for (const doc of documents) {
    fm += `\n[[documents]]\n`;
    fm += `version = ${tomlString(doc.VersionDescription)}\n`;
    fm += `url = '${doc.DocumentUrl}'\n`;
  }

  // History array of tables (chronological order)
  const sortedHistory = [...history].sort((a, b) =>
    new Date(a.ActionDate).getTime() - new Date(b.ActionDate).getTime()
  );
  for (const action of sortedHistory) {
    fm += `\n[[history]]\n`;
    fm += `date = '${action.ActionDate.split('T')[0]}'\n`;
    fm += `chamber = '${action.Chamber}'\n`;
    fm += `action = ${tomlString(action.ActionText)}\n`;
  }

  // Testimony array of tables (sorted by date)
  const sortedTestimony = [...testimony].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  for (const t of sortedTestimony) {
    fm += `\n[[testimony]]\n`;
    fm += `name = ${tomlString(t.name)}\n`;
    if (t.organization) {
      fm += `organization = ${tomlString(t.organization)}\n`;
    }
    fm += `position = '${t.position}'\n`;
    fm += `date = '${t.date}'\n`;
    fm += `file = '${t.file}'\n`;
    fm += `url = '${t.url}'\n`;
  }

  return fm;
}

// --- File update ---

function updateMarkdownFile(filepath: string, frontMatter: string) {
  const existing = fs.readFileSync(filepath, 'utf-8');

  // Extract body after +++ delimiters
  const match = existing.match(/^\+\+\+\n[\s\S]*?\n\+\+\+\n?([\s\S]*)$/);
  let body = match ? match[1] : '';

  // Strip leading tabs from body lines (API summaries have tabs that render as code blocks)
  body = body.replace(/^\t+/gm, '');

  const newContent = `+++\n${frontMatter}+++\n${body}`;
  fs.writeFileSync(filepath, newContent);
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);
  const positionalArgs = args.filter(arg => !arg.startsWith('--'));
  const yearArg = args.find(arg => arg.startsWith('--year='));

  if (positionalArgs.length === 0) {
    console.error('Usage: pnpm refine-legislation <bill-identifier> [--year=YYYY]');
    console.error('Examples:');
    console.error('  pnpm refine-legislation hb-4035');
    console.error('  pnpm refine-legislation hb-4035 --year=2025');
    process.exit(1);
  }

  const billIdentifier = positionalArgs[0].toLowerCase();
  const year = yearArg ? yearArg.split('=')[1] : '2026';
  const sessionCode = `${year}R1`;

  // Parse bill identifier: "hb-4035" -> prefix "HB", number 4035
  const billMatch = billIdentifier.match(/^([a-z]+)-(\d+)$/);
  if (!billMatch) {
    console.error(`Invalid bill identifier: ${billIdentifier}`);
    console.error('Expected format: hb-4035, sb-1234, sjr-202');
    process.exit(1);
  }

  const prefix = billMatch[1].toUpperCase();
  const number = parseInt(billMatch[2], 10);
  const billNumber = `${prefix}${number}`;

  console.log(`Refining ${billNumber} for session ${sessionCode}...`);

  // Check that the .md file exists
  const mdFilepath = path.join(LEGISLATION_DIR, year, `${billIdentifier}.md`);
  if (!fs.existsSync(mdFilepath)) {
    console.error(`Bill file not found: ${mdFilepath}`);
    process.exit(1);
  }

  // Fetch all endpoints in parallel (legislators may be cached)
  const filter = `SessionKey eq '${sessionCode}' and MeasurePrefix eq '${prefix}' and MeasureNumber eq ${number}`;
  const encodedFilter = encodeURIComponent(filter);

  const [measures, sponsorRecords, historyActions, documents, testimonyRecords, legislators] = await Promise.all([
    fetchJSON<ODataMeasure>(`${BASE_URL}/Measures?$format=json&$filter=${encodedFilter}`),
    fetchJSON<ODataSponsor>(`${BASE_URL}/MeasureSponsors?$format=json&$filter=${encodedFilter}`),
    fetchJSON<ODataHistoryAction>(`${BASE_URL}/MeasureHistoryActions?$format=json&$filter=${encodedFilter}`),
    fetchJSON<ODataDocument>(`${BASE_URL}/MeasureDocuments?$format=json&$filter=${encodedFilter}`),
    fetchAllTestimony(filter),
    loadOrFetchLegislators(sessionCode, year)
  ]);

  if (measures.length === 0) {
    console.error(`No measure found for ${billNumber} in session ${sessionCode}`);
    process.exit(1);
  }

  const measure = measures[0];
  console.log(`Found: ${measure.CatchLine}`);
  console.log(`  Sponsors: ${sponsorRecords.length} records`);
  console.log(`  History: ${historyActions.length} actions`);
  console.log(`  Documents: ${documents.length} versions`);
  console.log(`  Testimony: ${testimonyRecords.length} records`);

  // Store full combined JSON blob
  const dataDir = path.join(LEGISLATION_DIR, year, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const jsonBlob = {
    measure: measures[0],
    sponsors: sponsorRecords,
    historyActions,
    documents,
    testimony: testimonyRecords
  };

  const jsonPath = path.join(dataDir, `${billIdentifier}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(jsonBlob, null, 2));
  console.log(`Saved full API data to ${jsonPath}`);

  // Build sponsors
  const sponsors = buildSponsors(sponsorRecords, legislators, measure.AtTheRequestOf);
  console.log(`  Resolved sponsors: ${sponsors.map(s => s.name).join(', ') || '(none)'}`);

  // Download testimony PDFs
  const testimony: TestimonyInfo[] = [];
  if (testimonyRecords.length > 0) {
    const filesDir = path.join(LEGISLATION_DIR, year, 'files', billIdentifier);
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
    }

    console.log(`Downloading ${testimonyRecords.length} testimony PDFs...`);
    for (const t of testimonyRecords) {
      const filename = `${t.CommTestId}.pdf`;
      const destPath = path.join(filesDir, filename);
      const downloaded = await downloadTestimonyPdf(t.CommTestId, sessionCode, destPath);
      if (downloaded) {
        const name = `${t.SubmitterFirstName} ${t.SubmitterLastName}`.trim();
        testimony.push({
          name: name || 'Anonymous',
          organization: t.Organization || '',
          position: positionLabel(t.PositionOnMeasureId),
          date: t.CreatedDate ? t.CreatedDate.split('T')[0] : '',
          file: `files/${billIdentifier}/${filename}`,
          url: `https://olis.oregonlegislature.gov/liz/${sessionCode}/Downloads/PublicTestimonyDocument/${t.CommTestId}`,
        });
      }
    }
    console.log(`  Downloaded ${testimony.length} testimony PDFs to ${filesDir}`);
  }

  // Build front matter and update file
  const frontMatter = buildFrontMatter(measure, sponsors, documents, historyActions, testimony, sessionCode);
  updateMarkdownFile(mdFilepath, frontMatter);
  console.log(`Updated ${mdFilepath}`);

  console.log('Done!');
}

main().catch(console.error);
