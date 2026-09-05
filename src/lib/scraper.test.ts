import { describe, it, expect } from 'vitest'
import { scrapeJobs } from './scraper'

// ponytail: integration test — needs Playwright chromium installed, hits real websites.
// Skipped in CI by default. Run manually: npx vitest run src/lib/scraper.test.ts
const runIntegration = process.env.RUN_INTEGRATION === 'true'

describe.skipIf(!runIntegration)('scrapeJobs (integration)', () => {
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
  }, 120_000)
})
