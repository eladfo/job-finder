import { chromium, type Page } from 'playwright'
import type { JobListing } from './types'
import { getCareerUrl, saveCareerUrl } from './db'

// ponytail: heuristic scraper, no LLM, no Google Search (CAPTCHA).
// Tries cached DB URL first, then common URL patterns. Two extraction strategies:
// 1. Links with job-title text (most sites)
// 2. H3/card-based extraction for JS-heavy sites (e.g. Google Careers)

const CAREER_URL_PATTERNS = [
  (c: string) => `https://careers.${c}.com`,
  (c: string) => `https://${c}.com/careers`,
  (c: string) => `https://${c}.com/jobs`,
  (c: string) => `https://www.${c}.com/careers`,
  (c: string) => `https://www.${c}.com/jobs`,
  (c: string) => `https://jobs.${c}.com`,
  (c: string) => `https://boards.greenhouse.io/${c}`,
  (c: string) => `https://jobs.lever.co/${c}`,
]

async function tryFillSearch(page: Page, jobTitle: string, location: string): Promise<boolean> {
  const searchSelectors = [
    'input[name*="search" i]', 'input[placeholder*="search" i]',
    'input[placeholder*="keyword" i]', 'input[placeholder*="job" i]',
    'input[aria-label*="search" i]', 'input[type="search"]',
    'input[id*="search" i]', 'input[name*="keyword" i]',
    'input[name*="query" i]', 'input[name*="q" i]',
  ]

  let filled = false
  for (const sel of searchSelectors) {
    try {
      const input = await page.$(sel)
      if (input && await input.isVisible()) {
        await input.fill(jobTitle)
        await page.keyboard.press('Enter')
        await page.waitForLoadState('networkidle').catch(() => {})
        await page.waitForTimeout(2000)
        filled = true
        break
      }
    } catch { continue }
  }

  // Also try location inputs
  const locSelectors = [
    'input[name*="location" i]', 'input[placeholder*="location" i]',
    'input[aria-label*="location" i]',
  ]
  for (const sel of locSelectors) {
    try {
      const input = await page.$(sel)
      if (input && await input.isVisible()) {
        await input.fill(location)
        await page.keyboard.press('Enter')
        await page.waitForLoadState('networkidle').catch(() => {})
        await page.waitForTimeout(1000)
      }
    } catch { continue }
  }

  return filled
}

async function tryUrlParams(page: Page, jobTitle: string, location: string): Promise<void> {
  // ponytail: many career pages accept query params — try appending them
  const url = new URL(page.url())
  const currentParams = url.searchParams
  if (!currentParams.has('q') && !currentParams.has('query') && !currentParams.has('keyword')) {
    // Try adding search params to current URL
    for (const param of ['q', 'query', 'keyword', 'search']) {
      url.searchParams.set(param, jobTitle)
      break // just try the first
    }
    if (location) {
      url.searchParams.set('location', location)
    }
    try {
      await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 10000 })
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(2000)
    } catch { /* ignore */ }
  }
}

// Strategy 1: links with job-title text
async function extractFromLinks(page: Page, jobTitle: string, location: string): Promise<JobListing[]> {
  const titleWords = jobTitle.toLowerCase().split(/\s+/)

  return page.evaluate(({ titleWords, location }: { titleWords: string[]; location: string }) => {
    const links = Array.from(document.querySelectorAll('a')) as HTMLAnchorElement[]
    const results: { title: string; location: string; url: string; description: string }[] = []
    const seen = new Set<string>()

    for (const link of links) {
      const text = link.innerText.trim()
      const href = link.href
      if (!text || !href || href === '#' || seen.has(href)) continue
      if (text.length < 5 || text.length > 200) continue

      const lower = text.toLowerCase()
      const matches = titleWords.some(w => lower.includes(w))
      if (!matches) continue
      if (/sign in|log in|about us|privacy|terms|cookie/i.test(text)) continue

      seen.add(href)

      const parent = link.closest('li, tr, div[class*="job"], div[class*="card"], div[class*="posting"], div[class*="result"], article, section') as HTMLElement | null
      const desc = parent ? parent.innerText.trim().slice(0, 500) : text

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
}

// Strategy 2: find job titles in headings, then find nearby links (for JS-heavy sites)
async function extractFromHeadings(page: Page, jobTitle: string, location: string): Promise<JobListing[]> {
  const titleWords = jobTitle.toLowerCase().split(/\s+/)

  // First, click any job card to reveal hidden links (e.g. Google Careers)
  try {
    const firstHeading = await page.$('h3')
    if (firstHeading) {
      await firstHeading.click()
      await page.waitForTimeout(2000)
    }
  } catch { /* ignore */ }

  return page.evaluate(({ titleWords, location }: { titleWords: string[]; location: string }) => {
    const results: { title: string; location: string; url: string; description: string }[] = []
    const seen = new Set<string>()

    // Find all links with job-slug-like URLs (contain long numeric IDs or slugified titles)
    const allLinks = Array.from(document.querySelectorAll('a')) as HTMLAnchorElement[]
    const jobLinks = allLinks.filter(a => {
      const href = a.href
      return href && (
        /\/jobs?\/(results\/)?[\d]/.test(href) ||
        /\/positions?\//.test(href) ||
        /\/openings?\//.test(href) ||
        /\/careers?\/.+\d{4,}/.test(href)
      )
    })

    // Find all headings that match the job title
    const headings = Array.from(document.querySelectorAll('h2, h3, h4, [role="heading"]')) as HTMLElement[]
    const matchingHeadings = headings.filter(h => {
      const text = h.innerText.trim().toLowerCase()
      return titleWords.some(w => text.includes(w)) && text.length < 150 && text.length > 5
    })

    // Strategy A: if we found job-slug links, extract titles from the URL
    for (const link of jobLinks) {
      if (seen.has(link.href)) continue
      seen.add(link.href)

      // Extract title from nearby heading or from URL slug
      let title = ''
      const parent = link.closest('li, div, article, section') as HTMLElement | null
      const nearbyH3 = parent?.querySelector('h2, h3, h4, [role="heading"]') as HTMLElement | null
      if (nearbyH3) {
        title = nearbyH3.innerText.trim()
      } else {
        // Extract from URL slug: /123456-senior-software-engineer -> Senior Software Engineer
        const match = link.href.match(/\d+-(.+?)(?:\?|$)/)
        if (match) {
          title = match[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        } else {
          title = link.innerText.trim() || 'Untitled Position'
        }
      }

      const lower = title.toLowerCase()
      if (!titleWords.some(w => lower.includes(w))) continue

      const desc = parent ? parent.innerText.trim().slice(0, 500) : title

      results.push({ title, location: location || 'See posting', url: link.href, description: desc })
    }

    // Strategy B: if no job links found, use heading text as fallback
    if (results.length === 0) {
      for (const h of matchingHeadings) {
        const title = h.innerText.trim()
        if (seen.has(title)) continue
        seen.add(title)

        // Find the nearest link in the card
        const card = h.closest('li, div[class], article, section') as HTMLElement | null
        const link = card?.querySelector('a') as HTMLAnchorElement | null
        const url = link?.href || window.location.href

        const desc = card ? card.innerText.trim().slice(0, 500) : title
        results.push({ title, location: location || 'See posting', url, description: desc })
      }
    }

    return results
  }, { titleWords, location })
}

async function tryUrl(page: Page, url: string): Promise<boolean> {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10_000 })
    if (!response || response.status() >= 400) return false
    await page.waitForLoadState('networkidle').catch(() => {})
    return true
  } catch {
    return false
  }
}

async function findCareersPage(page: Page, company: string, jobTitle: string, location: string): Promise<boolean> {
  const companyLower = company.toLowerCase().replace(/\s+/g, '')

  // ponytail: check SQLite cache first — skips URL brute-force on repeat searches
  const cached = await getCareerUrl(company)
  if (cached) {
    const url = new URL(cached)
    url.searchParams.set('q', jobTitle)
    if (location) url.searchParams.set('location', location)
    if (await tryUrl(page, url.toString())) return true
    if (await tryUrl(page, cached)) return true
  }

  // Try common URL patterns, save first hit to DB
  for (const pattern of CAREER_URL_PATTERNS) {
    const url = pattern(companyLower)
    if (await tryUrl(page, url)) {
      await saveCareerUrl(company, url)
      return true
    }
  }

  return false
}

export async function scrapeJobs(
  company: string,
  jobTitle: string,
  location: string,
): Promise<JobListing[]> {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })
  const page = await ctx.newPage()
  page.setDefaultTimeout(15_000)

  try {
    const found = await findCareersPage(page, company, jobTitle, location)
    if (!found) return []

    // Try filling search fields
    await tryFillSearch(page, jobTitle, location)
    await page.waitForTimeout(3000)

    // Try link-based extraction first
    let jobs = await extractFromLinks(page, jobTitle, location)

    // If that didn't work, try heading-based extraction (JS-heavy sites)
    if (jobs.length === 0) {
      jobs = await extractFromHeadings(page, jobTitle, location)
    }

    // If still nothing, try URL params approach
    if (jobs.length === 0) {
      await tryUrlParams(page, jobTitle, location)
      jobs = await extractFromLinks(page, jobTitle, location)
      if (jobs.length === 0) {
        jobs = await extractFromHeadings(page, jobTitle, location)
      }
    }

    // If still nothing, try clicking nav links
    if (jobs.length === 0) {
      for (const sel of ['a:has-text("View all")', 'a:has-text("See all")', 'a:has-text("Browse")', 'a:has-text("All jobs")', 'a:has-text("Jobs")']) {
        try {
          const link = await page.$(sel)
          if (link && await link.isVisible()) {
            await link.click()
            await page.waitForLoadState('networkidle').catch(() => {})
            await page.waitForTimeout(2000)
            await tryFillSearch(page, jobTitle, location)
            jobs = await extractFromLinks(page, jobTitle, location)
            if (jobs.length === 0) jobs = await extractFromHeadings(page, jobTitle, location)
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
