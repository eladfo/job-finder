import { chromium, type Page } from 'playwright'
import Anthropic from '@anthropic-ai/sdk'
import type { JobListing } from './types'

const MAX_ITERATIONS = 5
const TIMEOUT_MS = 60_000
const PAGE_TEXT_LIMIT = 4000

const anthropic = new Anthropic()

type AgentAction =
  | { action: 'click'; selector: string }
  | { action: 'type'; selector: string; text: string }
  | { action: 'navigate'; url: string }
  | { action: 'done'; jobs: { title: string; location: string; url: string; description: string }[] }

async function extractPageContext(page: Page): Promise<string> {
  const text = await page.evaluate(() => document.body.innerText)
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a'))
      .map(a => ({ text: a.innerText.trim(), href: a.href }))
      .filter(l => l.text.length > 0 && l.href.startsWith('http'))
      .slice(0, 50)
  )
  const truncatedText = text.slice(0, PAGE_TEXT_LIMIT)
  const linkText = links.map(l => `[${l.text}](${l.href})`).join('\n')
  return `URL: ${page.url()}\n\nPage text:\n${truncatedText}\n\nLinks:\n${linkText}`
}

async function askClaudeForAction(
  pageContext: string,
  jobTitle: string,
  location: string,
): Promise<AgentAction> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are navigating a company's career/jobs website. The user is looking for jobs matching:
- Title: "${jobTitle}"
- Location: "${location}"

Current page:
${pageContext}

Based on the current page, decide what to do next. Respond with ONLY a JSON object (no markdown, no backticks):

Options:
1. {"action": "click", "selector": "CSS selector to click"} — click a link or button to navigate deeper
2. {"action": "type", "selector": "CSS selector of input", "text": "text to type"} — fill in a search/filter field
3. {"action": "navigate", "url": "full URL"} — go to a specific URL you see in the links
4. {"action": "done", "jobs": [{"title": "...", "location": "...", "url": "...", "description": "..."}]} — you can see job listings that match, extract them

If you see a search form, fill it with the job title. If you see matching job listings, extract them with "done".
If you see links to a jobs/careers page, navigate there. Extract as many matching jobs as you can find on the page.
For job URLs, use the actual link to the job posting, not the current page URL.
For descriptions, include as much of the job description as visible. If not visible, include what you can see (title, team, summary).`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  // ponytail: strip markdown fences if Claude adds them anyway
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleaned) as AgentAction
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

  const startTime = Date.now()

  try {
    // Step 1: Google search for the company's careers page
    const query = encodeURIComponent(`${company} careers jobs`)
    await page.goto(`https://www.google.com/search?q=${query}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {}) // ponytail: best effort, don't fail on timeout

    // Find and click the first organic result
    const firstResult = await page.$('div#search a[href^="http"]')
    if (firstResult) {
      const href = await firstResult.getAttribute('href')
      if (href) {
        await page.goto(href, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle').catch(() => {})
      }
    }

    // Step 2: LLM-guided navigation loop
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      if (Date.now() - startTime > TIMEOUT_MS) break

      const context = await extractPageContext(page)
      const action = await askClaudeForAction(context, jobTitle, location)

      if (action.action === 'done') {
        return action.jobs.map(j => ({
          title: j.title,
          location: j.location,
          url: j.url,
          description: j.description,
        }))
      }

      if (action.action === 'click') {
        try {
          await page.click(action.selector, { timeout: 5000 })
          await page.waitForLoadState('networkidle').catch(() => {})
        } catch {
          // ponytail: if click fails, try navigating via evaluate
          continue
        }
      }

      if (action.action === 'type') {
        try {
          await page.fill(action.selector, action.text)
          await page.keyboard.press('Enter')
          await page.waitForLoadState('networkidle').catch(() => {})
        } catch {
          continue
        }
      }

      if (action.action === 'navigate') {
        try {
          await page.goto(action.url, { waitUntil: 'domcontentloaded' })
          await page.waitForLoadState('networkidle').catch(() => {})
        } catch {
          continue
        }
      }
    }

    // If we exhausted iterations, try one final extraction
    const finalContext = await extractPageContext(page)
    const finalAction = await askClaudeForAction(finalContext, jobTitle, location)
    if (finalAction.action === 'done') {
      return finalAction.jobs
    }

    return []
  } finally {
    await browser.close()
  }
}
