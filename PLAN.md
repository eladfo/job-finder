# Job Finder — Implementation Plan

## Context

You're job hunting and tired of ghost jobs on LinkedIn. This app goes directly to a company's official careers page, finds real jobs matching your title/location, and lets you explore them. When you find one you like, you can score your CV fit against that specific job.

**Two-step flow:**
1. **Search** — enter company + title + location → browse matching jobs from the careers page (no CV needed)
2. **Score** — pick a job that interests you → upload/paste your CV → get a detailed must-have-by-must-have fit score (0-100%)

## Architecture

**Single Next.js app** deployed on Railway (or run locally). No microservices, no separate backend. Playwright + Claude API both run server-side in Next.js API routes.

Why not Vercel: Playwright needs Chromium (~400MB) and scraping takes 30-60s — exceeds Vercel's serverless limits.

## Stack

- **Next.js 14** (App Router, TypeScript, Tailwind)
- **Playwright** — headless Chromium for navigating career pages
- **Claude API** (`@anthropic-ai/sdk`) — two uses: (1) guide the browser through career pages, (2) score CV against a specific job's must-haves
- **pdf-parse** — extract text from PDF uploads

One env var: `ANTHROPIC_API_KEY`

## File Structure

```
job-finder/
├── package.json
├── next.config.js
├── Dockerfile
├── .env.local                  # ANTHROPIC_API_KEY (gitignored)
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Search form (company + title + location)
│   │   └── api/
│   │       ├── search/
│   │       │   └── route.ts    # POST — scrape careers page, return job listings
│   │       └── score/
│   │           └── route.ts    # POST — score CV against one specific job
│   └── lib/
│       ├── scraper.ts          # Playwright: LLM-guided career page navigation
│       └── scorer.ts           # Claude API: CV fit scoring
```

## UI Design

### Single page app (`page.tsx`) — three states:

**State 1: Search Form**
- CV upload (PDF drag-and-drop) or paste text — uploaded once, stored in client state for all scoring
- Company name, job title, location inputs
- Big search button
- Clean, centered, minimal

**State 2: Results Explorer** (after search completes)
Two-panel layout:
- **Left panel — Job list**: all matching jobs as cards, sorted by title. Each shows job title + location. Click to select -> detail appears on right.
- **Right panel — Job detail**: full JD text (scrollable), company & location at top, link to original posting. **"Score My Fit" button** at the top — uses the CV already uploaded on the search form (no re-upload needed).
- **Back button** to return to search form

**State 3: Score View** (after CV scoring completes for a specific job)
Replaces or overlays the job detail panel:
- **Score header**: big number (e.g. "82%") with fraction (5.75/7 must-haves), colored green/yellow/red
- **Must-haves breakdown table**: each must-have as a row:
  - Requirement name
  - Status: Full match (1.0) | Adjacent (0.5) | No match (0)
  - Evidence from CV
  - **Adjacent items get a confirm/deny toggle** — score recalculates live client-side
- **Flagged gaps**: must-haves that scored 0
- **Nice-to-haves met**: listed as upside, don't affect score
- **Back to job** button to return to the JD view

All states live in one `page.tsx` — no routing needed, just `useState` for the current view and data.

## API Endpoints

### `POST /api/search`
```
Body: { company: string, jobTitle: string, location: string }
Returns: { jobs: JobListing[] }
```
Scrapes the company careers page, returns matching jobs.

### `POST /api/score`
```
Body: FormData with cv (File) or cvText (string) + jobDescription (string)
Returns: { score: ScoreResult }
```
Scores one CV against one job description.

## Types
```ts
type JobListing = { title: string; location: string; url: string; description: string }
type MustHave = { requirement: string; status: 'full' | 'adjacent' | 'none'; score: number; evidence: string | null }
type ScoreResult = { mustHaves: MustHave[]; niceToHaves: string[]; totalScore: number; totalFraction: string }
```

## Scoring Formula

1. Parse JD into must-haves only (ignore nice-to-haves and responsibilities for the math)
2. For each must-have, classify fit as: Full match (1.0), Adjacent (0.5), No match (0)
3. Score = (sum of points / number of must-haves) x 100
4. Separately list flagged gaps (scored 0) and nice-to-haves met
5. Adjacent matches require user confirmation via toggle in the UI
