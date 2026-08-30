import { describe, it, expect } from 'vitest'
import { scrapeJobs } from './scraper'

// ponytail: integration test — needs ANTHROPIC_API_KEY and Playwright chromium installed
// Run with: npx vitest run src/lib/scraper.test.ts
const hasApiKey = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your-key-here'

describe.skipIf(!hasApiKey)('scrapeJobs (integration)', () => {
  it('returns job listings from a real company careers page', async () => {
    const jobs = await scrapeJobs('stripe', 'software engineer', 'remote')

    expect(Array.isArray(jobs)).toBe(true)
    expect(jobs.length).toBeGreaterThan(0)

    for (const job of jobs) {
      expect(job).toHaveProperty('title')
      expect(job).toHaveProperty('location')
      expect(job).toHaveProperty('url')
      expect(job).toHaveProperty('description')
      expect(typeof job.title).toBe('string')
      expect(job.title.length).toBeGreaterThan(0)
    }
  }, 120_000) // 2 min timeout for scraping
})
