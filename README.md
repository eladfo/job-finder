# Job Finder

Skip the ghost jobs. Go straight to a company's official careers page, find real openings that match your title and location, and score how well your CV fits — all in one tool.

## What It Does

Job Finder is a two-step tool for job seekers:

1. **Search** — Enter a company name, job title, and location. The app uses a headless browser to navigate the company's actual careers page, find the search box, and extract matching job listings.

2. **Score** — Found a job that looks interesting? Click "Score My Fit" and the app analyzes your CV against the job's must-have requirements, giving you a 0-100% fit score with a full breakdown.

No LinkedIn. No job boards. No ghost jobs. Real listings, straight from the source.

## How to Use It

### Step 1: Fill in the search form

- **Your CV** — Upload a PDF or paste your CV text. This is optional for searching, but required if you want to score your fit later. Uploaded once, reused for all scoring in the session.
- **Company** — The company you want to work at (e.g. "Google", "Stripe", "NVIDIA").
- **Job Title** — What you're looking for (e.g. "Software Engineer", "Product Manager").
- **Location** — Where you want to work (e.g. "Tel Aviv", "Remote", "New York").

Hit **Search Jobs** and wait while the app navigates the company's careers site.

### Step 2: Browse results

Results appear in a two-panel layout:
- **Left** — List of matching jobs with title and location.
- **Right** — Full job description for the selected job, plus an **Apply** link to the original posting.

### Step 3: Score your fit (optional)

If you uploaded your CV, click **Score My Fit** on any job. The scorer:

1. Parses the JD into **must-haves** (ignoring nice-to-haves and responsibilities).
2. Matches each must-have against your CV:
   - **Full match (1.0)** — Your CV clearly has this skill/experience.
   - **Adjacent (0.5)** — Related but not identical (e.g. Docker vs Kubernetes). Flagged for your review.
   - **No match (0)** — Gap. Nothing in your CV covers this.
3. Calculates **Score = (sum / count) x 100**.

The score view shows:
- The overall percentage and fraction (e.g. "82% — 5.75/7 must-haves").
- A breakdown table with evidence for each must-have.
- **Confirm/Deny toggles** on adjacent matches — the score recalculates live when you toggle these.
- Flagged gaps (must-haves you're missing).
- Nice-to-haves you do meet (listed as upside, don't affect the score).

## Scoring Formula

```
Score = (sum of match points / number of must-haves) x 100

Full match  = 1.0 points
Adjacent    = 0.5 points (pending your confirmation)
No match    = 0.0 points
```

Adjacent matches are flagged — you decide if they count. Deny one and the score drops; confirm it and it stays at 0.5. Nice-to-haves are listed but never move the number.

## Tech Stack

- **Next.js** (App Router, TypeScript, Tailwind)
- **Playwright** — Headless Chromium for navigating company career pages
- **pdf-parse** — Extract text from PDF uploads
- **Keyword scorer** — Heuristic matching with an equivalents map (no API key needed)

## Running It

### Local development

```bash
npm install
npx playwright install chromium
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Docker

```bash
docker build -t job-finder .
docker run -p 3000:3000 job-finder
```

### Deploy

Deploy to Railway, Fly.io, or any platform that supports Docker. Playwright needs Chromium installed at the OS level, so serverless platforms like Vercel won't work.

### Tests

```bash
npx vitest run                          # unit + scorer tests
RUN_INTEGRATION=true npx vitest run     # includes live scraper test
```
