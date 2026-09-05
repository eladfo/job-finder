import { chromium, type Page } from 'playwright'
import type { JobListing } from './types'

// ponytail: heuristic scraper, no LLM. Finds search inputs, types the job title,
// extracts job-like links. Works on most career pages. Upgrade to LLM-guided if needed.

async function tryFillSearch(page: Page, jobTitle: string): Promise<boolean> {
  // ponytail: common search input selectors across career sites
  const selectors = [
    'input[name*="search" i]',
    'input[placeholder*="search" i]',
    'input[placeholder*="keyword" i]',
    'input[placeholder*="job" i]',
    'input[aria-label*="search" i]',
    'input[type="search"]',
    'input[id*="search" i]',
    'input[name*="keyword" i]',
    'input[name*="query" i]',
    'input[name*="q" i]',
  ]

  for (const sel of selectors) {
    try {
      const input = await page.$(sel)
      if (input && await input.isVisible()) {
        await input.fill(jobTitle)
        await page.keyboard.press('Enter')
        await page.waitForLoadState('networkidle').catch(() => {})
        await page.waitForTimeout(2000)
        return true
      }
    } catch { continue }
  }
  return false
}

async function extractJobLinks(page: Page, jobTitle: string, location: string): Promise<JobListing[]> {
  const titleWords = jobTitle.toLowerCase().split(/\s+/)

  const jobs = await page.evaluate(({ titleWords, location }: { titleWords: string[]; location: string }) => {
    const links = Array.from(document.querySelectorAll('a')) as HTMLAnchorElement[]
    const results: { title: string; location: string; url: string; description: string }[] = []
    const seen = new Set<string>()

    for (const link of links) {
      const text = link.innerText.trim()
      const href = link.href
      if (!text || !href || href === '#' || seen.has(href)) continue
      if (text.length < 5 || text.length > 200) continue

      // Check if link text looks like a job title matching the search
      const lower = text.toLowerCase()
      const matches = titleWords.some(w => lower.includes(w))
      if (!matches) continue

      // Skip nav/footer links
      if (/sign in|log in|about us|privacy|terms|cookie/i.test(text)) continue

      seen.add(href)

      // Try to grab surrounding context as description
      const parent = link.closest('li, tr, div[class*="job"], div[class*="card"], div[class*="posting"], article') as HTMLElement | null
      const desc = parent ? parent.innerText.trim().slice(0, 500) : text

      // Try to extract location from surrounding context
      const locText = parent?.innerText || ''
      const locLower = locText.toLowerCase()
      const hasLocation = !location || location.toLowerCase() === 'remote'
        ? true
        : locLower.includes(location.toLowerCase()) || locLower.includes('remote')

      if (hasLocation || !location) {
        results.push({
          title: text.split('\n')[0].trim(),
          location: location || 'See posting',
          url: href,
          description: desc,
        })
      }
    }
    return results
  }, { titleWords, location })

  return jobs
}

export async function scrapeJobs(
  company: string,
  jobTitle: string,
  location: string,
): Promise<JobListing[]> {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15_000)

  try {
    // Step 1: Google search for the company's careers/jobs page with the title
    const query = encodeURIComponent(`${company} careers ${jobTitle} jobs`)
    await page.goto(`https://www.google.com/search?q=${query}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})

    // Click first organic result
    const firstResult = await page.$('div#search a[href^="http"]')
    if (!firstResult) return []

    const href = await firstResult.getAttribute('href')
    if (!href) return []

    await page.goto(href, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})

    // Step 2: Try to find and fill a search box
    await tryFillSearch(page, jobTitle)

    // Step 3: Extract job links from the page
    let jobs = await extractJobLinks(page, jobTitle, location)

    // Step 4: If no jobs found, try clicking common "view jobs" / "see all" links
    if (jobs.length === 0) {
      const viewAllSelectors = [
        'a:has-text("View all")',
        'a:has-text("See all")',
        'a:has-text("Browse")',
        'a:has-text("Search")',
        'a:has-text("Open positions")',
        'a:has-text("Careers")',
        'a:has-text("Jobs")',
      ]
      for (const sel of viewAllSelectors) {
        try {
          const link = await page.$(sel)
          if (link && await link.isVisible()) {
            await link.click()
            await page.waitForLoadState('networkidle').catch(() => {})
            await page.waitForTimeout(2000)
            await tryFillSearch(page, jobTitle)
            jobs = await extractJobLinks(page, jobTitle, location)
            if (jobs.length > 0) break
          }
        } catch { continue }
      }
    }

    return jobs
  } finally {
    await browser.close()
  }
}
