import fs from 'fs';
import path from 'path';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

// Configuration
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Paths
const LEGISLATION_DIR = path.join(process.cwd(), 'content/legislation');
const PEOPLE_DIR = path.join(process.cwd(), 'content/people');
const CACHE_DIR = path.join(process.cwd(), '.cache');

// Initialize Anthropic
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

interface Sponsor {
  name: string;
  level: string; // "Chief" or "Regular"
  type: string; // "Member", "Committee", "Presession"
}

interface Bill {
  billNumber: string;
  title: string;
  summary: string;
  url: string;
  introduced: string;
  chamber: 'House' | 'Senate';
  status: string;
  sponsors: Sponsor[];
}

interface ClassificationResult {
  is_housing: boolean;
  relevance_explanation: string;
  one_sentence_summary: string;
}

async function main() {
  if (!ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  // Parse arguments
  const args = process.argv.slice(2);

  // Get positional arguments (non-flag arguments)
  const positionalArgs = args.filter(arg => !arg.startsWith('--'));
  const sessionArg = args.find(arg => arg.startsWith('--session='));
  const skipClassification = args.includes('--skip-classification');
  const debug = args.includes('--debug');

  if (positionalArgs.length === 0) {
    console.error('Error: year argument is required.');
    console.error('Usage: pnpm fetch-legislation <year> [--session=R1] [--skip-classification]');
    console.error('Examples:');
    console.error('  pnpm fetch-legislation 2025');
    console.error('  pnpm fetch-legislation 2024 --session=S1');
    console.error('  pnpm fetch-legislation 2023 --skip-classification');
    process.exit(1);
  }

  const year = positionalArgs[0];
  const session = sessionArg ? sessionArg.split('=')[1] : 'R1';
  const sessionCode = `${year}${session}`;

  console.log(`Fetching legislation for ${sessionCode}...`);

  // Create year-specific data directory
  const yearDataDir = path.join(LEGISLATION_DIR, year, 'data');
  if (!fs.existsSync(yearDataDir)) {
    fs.mkdirSync(yearDataDir, { recursive: true });
  }

  // Fetch all bills from API
  const { bills, legislators } = await fetchAllBills(sessionCode, debug);

  if (bills.length === 0) {
    console.error('No bills found. Exiting.');
    process.exit(1);
  }

  console.log(`Successfully fetched ${bills.length} bills from API.`);

  // Save raw data to JSON in year-specific directory
  const jsonPath = path.join(yearDataDir, `legislation-${sessionCode}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(bills, null, 2));
  console.log(`Saved raw data to ${jsonPath}`);

  // Update front matter on existing bill files regardless of classification
  let updatedCount = 0;
  for (const bill of bills) {
    const filename = generateFilename(year, bill.billNumber);
    const filepath = path.join(LEGISLATION_DIR, filename);
    if (fs.existsSync(filepath)) {
      updateBillFrontMatter(filepath, bill, legislators);
      updatedCount++;
    }
  }
  if (updatedCount > 0) {
    console.log(`Updated front matter on ${updatedCount} existing bill files.`);
  }

  if (skipClassification) {
    console.log('\nSkipping classification (--skip-classification flag set).');
    return;
  }

  // Load classification cache
  const cachePath = path.join(CACHE_DIR, `classifications-${sessionCode}.json`);
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  const classificationCache = new Map<string, ClassificationResult>();
  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as Record<string, ClassificationResult>;
    for (const [key, value] of Object.entries(cached)) {
      classificationCache.set(key, value);
    }
    console.log(`Loaded ${classificationCache.size} cached classifications.`);
  }

  // Classify and create files for housing-related bills
  const housingBills: Bill[] = [];
  let housingCount = 0;
  const BATCH_SIZE = 20;

  // Split bills into cached and uncached
  const uncachedBills: Bill[] = [];
  for (const bill of bills) {
    if (classificationCache.has(bill.billNumber)) {
      const classification = classificationCache.get(bill.billNumber)!;
      if (classification.is_housing) {
        housingBills.push(bill);
        const filename = generateFilename(year, bill.billNumber);
        const filepath = path.join(LEGISLATION_DIR, filename);
        if (!fs.existsSync(filepath)) {
          createBillFile(filepath, bill, classification, year, legislators);
          console.log(`  ${bill.billNumber} -> [CACHED: HOUSING] Created file: ${filename}`);
          housingCount++;
        }
      }
    } else {
      uncachedBills.push(bill);
    }
  }

  if (uncachedBills.length === 0) {
    console.log(`\nAll ${bills.length} bills already classified (cached). No API calls needed.`);
  } else {
    console.log(`\n${classificationCache.size} bills cached, ${uncachedBills.length} bills to classify...`);

    for (let batchStart = 0; batchStart < uncachedBills.length; batchStart += BATCH_SIZE) {
      const batch = uncachedBills.slice(batchStart, batchStart + BATCH_SIZE);
      console.log(`\nClassifying batch ${Math.floor(batchStart / BATCH_SIZE) + 1} (bills ${batchStart + 1}-${batchStart + batch.length} of ${uncachedBills.length})...`);

      const classifications = await classifyBillsBatch(batch);

      for (let i = 0; i < batch.length; i++) {
        const bill = batch[i];
        const classification = classifications[i] || { is_housing: false, relevance_explanation: 'Missing from batch response.', one_sentence_summary: '' };

        // Cache the result
        classificationCache.set(bill.billNumber, classification);

        if (classification.is_housing) {
          console.log(`  ${bill.billNumber} -> [HOUSING RELATED] ${classification.relevance_explanation}`);

          housingBills.push(bill);

          const filename = generateFilename(year, bill.billNumber);
          const filepath = path.join(LEGISLATION_DIR, filename);

          if (fs.existsSync(filepath)) {
            console.log(`    File already exists: ${filename}`);
          } else {
            createBillFile(filepath, bill, classification, year, legislators);
            console.log(`    Created file: ${filename}`);
            housingCount++;
          }
        }
      }

      // Save cache after each batch
      const cacheObj: Record<string, ClassificationResult> = {};
      for (const [key, value] of classificationCache) {
        cacheObj[key] = value;
      }
      fs.writeFileSync(cachePath, JSON.stringify(cacheObj, null, 2));
      console.log(`Saved ${classificationCache.size} classifications to cache.`);
    }
  }

  console.log(`\nDone! Created ${housingCount} new housing-related bill files.`);

  // Create person pages for sponsors of housing-related bills only
  const housingSponsorCodes = new Set<string>();
  for (const bill of housingBills) {
    for (const sponsor of bill.sponsors) {
      housingSponsorCodes.add(sponsor.name);
    }
  }

}

interface ODataMeasure {
  SessionKey: string;
  MeasurePrefix: string;
  MeasureNumber: number;
  CatchLine: string;
  MeasureSummary?: string;
  CurrentLocation: string;
  FiscalImpact?: string;
  RevenueImpact?: string;
  LCNumber?: number;
  CreatedDate: string;
  ModifiedDate: string;
  PrefixMeaning: string;
}

interface ODataResponse {
  'odata.metadata': string;
  value: ODataMeasure[];
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
}

interface ODataSponsorsResponse {
  'odata.metadata': string;
  value: ODataSponsor[];
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

interface ODataLegislatorsResponse {
  'odata.metadata': string;
  value: ODataLegislator[];
}

async function fetchAllBills(sessionCode: string, debug = false): Promise<{ bills: Bill[], legislators: Map<string, ODataLegislator> }> {
  const bills: Bill[] = [];

  // Use Oregon Legislature OData API to get all measures for the session
  const measuresUrl = `https://api.oregonlegislature.gov/odata/odataservice.svc/Measures?$format=json&$filter=SessionKey eq '${sessionCode}'`;
  const sponsorsUrl = `https://api.oregonlegislature.gov/odata/odataservice.svc/MeasureSponsors?$format=json&$filter=SessionKey eq '${sessionCode}'`;
  const legislatorsUrl = `https://api.oregonlegislature.gov/odata/odataservice.svc/Legislators?$format=json&$filter=SessionKey eq '${sessionCode}'`;

  console.log(`Fetching bill list from OData API for session ${sessionCode}...`);

  try {
    // Fetch measures, sponsors, and legislators in parallel
    const [measuresResponse, sponsorsResponse, legislatorsResponse] = await Promise.all([
      axios.get<ODataResponse>(measuresUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        timeout: 30000
      }),
      axios.get<ODataSponsorsResponse>(sponsorsUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        timeout: 30000
      }),
      axios.get<ODataLegislatorsResponse>(legislatorsUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        timeout: 30000
      })
    ]);

    const measures = measuresResponse.data.value;
    const allSponsors = sponsorsResponse.data.value;
    const allLegislators = legislatorsResponse.data.value;

    // Create map of LegislatorCode -> Legislator
    const legislatorsMap = new Map<string, ODataLegislator>();
    for (const legislator of allLegislators) {
      legislatorsMap.set(legislator.LegislatorCode, legislator);
    }

    console.log(`Found ${measures.length} measures, ${allSponsors.length} sponsor records, and ${allLegislators.length} legislators from API.`);

    // Group sponsors by bill
    const sponsorsByBill = new Map<string, Sponsor[]>();
    for (const sponsor of allSponsors) {
      const billNumber = `${sponsor.MeasurePrefix}${sponsor.MeasureNumber}`;
      if (!sponsorsByBill.has(billNumber)) {
        sponsorsByBill.set(billNumber, []);
      }

      // Only include sponsors with actual names (skip "Presession" type without names)
      if (sponsor.LegislatoreCode || sponsor.CommitteeCode) {
        sponsorsByBill.get(billNumber)!.push({
          name: sponsor.LegislatoreCode || sponsor.CommitteeCode || 'Unknown',
          level: sponsor.SponsorLevel,
          type: sponsor.SponsorType
        });
      }
    }

    // Convert OData measures to our Bill format
    for (const measure of measures) {
      const billNumber = `${measure.MeasurePrefix}${measure.MeasureNumber}`;
      const url = `https://olis.oregonlegislature.gov/liz/${sessionCode}/Measures/Overview/${billNumber}`;
      const chamber: 'House' | 'Senate' = measure.MeasurePrefix.startsWith('H') ? 'House' : 'Senate';

      bills.push({
        billNumber,
        title: measure.CatchLine || '',
        summary: measure.MeasureSummary || measure.CatchLine || '',
        url,
        introduced: measure.CreatedDate || '',
        chamber,
        status: measure.CurrentLocation || '',
        sponsors: sponsorsByBill.get(billNumber) || []
      });
    }

    // Debug: Save API response to file for inspection
    if (debug) {
      const debugPath = path.join(process.cwd(), `debug-${sessionCode}-api-response.json`);
      fs.writeFileSync(debugPath, JSON.stringify({
        measures: measuresResponse.data,
        sponsors: sponsorsResponse.data,
        legislators: legislatorsResponse.data
      }, null, 2));
      console.log(`Debug: Saved API response to ${debugPath}`);
    }

    return { bills, legislators: legislatorsMap };

  } catch (error: any) {
    console.error(`Error fetching bills from API: ${error.message}`);
    if (error.code === 'ECONNABORTED') {
      console.error('Request timed out. The API server may be slow or unreachable.');
    }
  }

  return { bills, legislators: new Map() };
}

async function classifyBillsBatch(bills: Bill[]): Promise<ClassificationResult[]> {
  const billsList = bills.map((bill, i) => `${i + 1}. Bill Number: ${bill.billNumber}\n   Title: ${bill.title}\n   Summary: ${bill.summary}`).join('\n\n');

  const prompt = `Analyze each of the following Oregon legislative bills to determine if it is primarily about housing.

${billsList}

Housing-related topics include:
- Residential construction and development
- Zoning and land use for housing
- Affordable housing programs and funding
- Rent control and tenant protections
- Homelessness and shelters
- Building codes for residential buildings
- Property taxes related to housing
- Housing supply and density
- ADUs (Accessory Dwelling Units)
- Middle housing (duplexes, triplexes, etc.)
- Manufactured housing and mobile home parks

NOT housing-related:
- Commercial real estate only
- General property law not specific to housing
- Business taxation
- Non-residential building codes

Respond ONLY with a JSON array of ${bills.length} objects, one per bill in the same order, each with this format:
{
  "bill_number": "the bill number",
  "is_housing": boolean,
  "relevance_explanation": "A 1-2 sentence explanation of why this is or isn't housing-related.",
  "one_sentence_summary": "A single clear sentence describing what the legislation does."
}
`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }]
    });

    const responseText = (msg.content[0] as any).text;
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ClassificationResult[];
      return parsed;
    }
    console.error("Failed to parse batch JSON response.");
    return bills.map(() => ({ is_housing: false, relevance_explanation: "Failed to parse batch response.", one_sentence_summary: "" }));

  } catch (e: any) {
    console.error("Batch classification error:", e);
    return bills.map(() => ({ is_housing: false, relevance_explanation: "Classification failed.", one_sentence_summary: "" }));
  }
}

function formatBillNumber(billNumber: string): string {
  // "HB2001" -> "HB 2001", "SJR202" -> "SJR 202"
  return billNumber.replace(/^([A-Za-z]+)(\d+)$/, '$1 $2').toUpperCase();
}

function generateFilename(year: string, billNumber: string): string {
  // "HB2001" -> "hb-2001", "SJR202" -> "sjr-202"
  const slug = billNumber.replace(/^([A-Za-z]+)(\d+)$/, '$1-$2').toLowerCase();
  return `${year}/${slug}.md`;
}

function generatePersonSlug(legislator: ODataLegislator | null): string {
  if (!legislator) {
    // Fallback for unknown legislators
    return 'unknown';
  }
  // Convert "Tom" "Andersen" -> "tom-andersen"
  const firstName = legislator.FirstName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const lastName = legislator.LastName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${firstName}-${lastName}`;
}

function generatePersonName(legislator: ODataLegislator | null): string {
  if (!legislator) {
    return 'Unknown Legislator';
  }
  // "Tom Andersen"
  return `${legislator.FirstName} ${legislator.LastName}`;
}

async function generateLegislatorBio(legislator: ODataLegislator): Promise<string> {
  const name = generatePersonName(legislator);
  const title = legislator.Title;
  const party = legislator.Party;
  const district = legislator.DistrictNumber;

  const prompt = `Write a brief 2-3 paragraph biography for ${name}, a ${party} ${title} representing District ${district} in the Oregon Legislature.

Include:
1. A brief introduction (1-2 sentences)
2. Background and career before legislature (if you have this information, otherwise skip)
3. Focus areas in the legislature (mention housing if relevant, but don't fabricate housing involvement if you don't know)

Keep it factual and professional. If you don't have specific information about this person, write a general placeholder bio that acknowledges this is a ${party} ${title} for District ${district}.

Write in third person, past and present tense as appropriate.`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }]
    });

    const responseText = (msg.content[0] as any).text;
    return responseText.trim();

  } catch (e: any) {
    console.error(`Error generating bio for ${name}: ${e.message}`);
    return `${title}, District ${district} (${party})`;
  }
}

async function createPersonFile(legislator: ODataLegislator, year: string): Promise<string> {
  const slug = generatePersonSlug(legislator);
  const filepath = path.join(PEOPLE_DIR, `${slug}.md`);

  // Don't overwrite if file already exists
  if (fs.existsSync(filepath)) {
    return slug;
  }

  const name = generatePersonName(legislator);

  // Generate bio using Claude API
  console.log(`  Generating bio for ${name}...`);
  const bio = await generateLegislatorBio(legislator);

  const content = `+++
title = '${name}'
date = '${year}-01-01'
+++

# ${name}

${bio}

## Key Housing Actions

_This page was auto-generated. Please add housing-related legislative actions with internal links._

<!--
Auto-generated by fetch-legislation.ts
LegislatorCode: ${legislator.LegislatorCode}
District: ${legislator.DistrictNumber}
Party: ${legislator.Party}
-->
`;

  fs.writeFileSync(filepath, content);
  return slug;
}

function updateBillFrontMatter(filepath: string, bill: Bill, legislators: Map<string, ODataLegislator>) {
  const existing = fs.readFileSync(filepath, 'utf-8');

  // Parse TOML front matter between +++ delimiters
  const match = existing.match(/^\+\+\+\n([\s\S]*?)\n\+\+\+/);
  if (!match) return;

  const frontMatter = match[1];
  const body = existing.slice(match[0].length);

  // Only update status — the single field that changes over time.
  // All other structured fields are managed by refine-legislation.
  let updatedFrontMatter = frontMatter
    .replace(/^status\s*=\s*['"].*['"]$\n?/m, '')
    .trim();

  const escapedStatus = bill.status.includes("'")
    ? `"${bill.status.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    : `'${bill.status}'`;
  updatedFrontMatter += `\nstatus = ${escapedStatus}`;

  fs.writeFileSync(filepath, `+++\n${updatedFrontMatter}\n+++${body}`);
}

function createBillFile(filepath: string, bill: Bill, classification: ClassificationResult, year: string, legislators: Map<string, ODataLegislator>) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Use the bill's introduced date if available, otherwise use Jan 1 of the session year
  const date = bill.introduced ? bill.introduced.split('T')[0] : `${year}-01-01`;

  // Generate sponsors section with links
  let sponsorsSection = '';
  if (bill.sponsors.length > 0) {
    const chiefSponsors = bill.sponsors.filter(s => s.level === 'Chief');
    const regularSponsors = bill.sponsors.filter(s => s.level === 'Regular');

    sponsorsSection = '\n## Sponsors\n\n';

    if (chiefSponsors.length > 0) {
      sponsorsSection += '**Chief Sponsors:** ';
      sponsorsSection += chiefSponsors
        .map(s => {
          const legislator = legislators.get(s.name);
          const name = generatePersonName(legislator);
          const slug = generatePersonSlug(legislator);
          return `[${name}](/people/${slug})`;
        })
        .join(', ');
      sponsorsSection += '\n\n';
    }

    if (regularSponsors.length > 0) {
      sponsorsSection += '**Co-Sponsors:** ';
      sponsorsSection += regularSponsors
        .map(s => {
          const legislator = legislators.get(s.name);
          const name = generatePersonName(legislator);
          const slug = generatePersonSlug(legislator);
          return `[${name}](/people/${slug})`;
        })
        .join(', ');
      sponsorsSection += '\n\n';
    }
  }

  // Build sponsors string for front matter
  let sponsorNames = '';
  if (bill.sponsors.length > 0) {
    const chiefSponsors = bill.sponsors.filter(s => s.level === 'Chief');
    sponsorNames = chiefSponsors
      .map(s => {
        const legislator = legislators.get(s.name);
        return generatePersonName(legislator);
      })
      .join(', ');
  }

  const displayName = formatBillNumber(bill.billNumber);

  const content = `+++
title = '${displayName}'
date = '${date}'
status = '${bill.status.replace(/'/g, "''")}'
sponsors = '${sponsorNames.replace(/'/g, "''")}'
+++

${classification.one_sentence_summary}

[Original Bill Text](${bill.url})
${sponsorsSection}
## Overview

${bill.summary || classification.one_sentence_summary}

<!--
Auto-generated by fetch-legislation.ts

Classification: ${classification.relevance_explanation}
-->
`;

  fs.writeFileSync(filepath, content);
}

main().catch(console.error);
