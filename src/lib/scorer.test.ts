import { describe, it, expect } from 'vitest'
import { parseCv, scoreJob } from './scorer'

describe('parseCv', () => {
  it('parses plain text buffer', async () => {
    const buf = Buffer.from('I am a software engineer with 5 years experience')
    const result = await parseCv(buf, 'text/plain')
    expect(result).toBe('I am a software engineer with 5 years experience')
  })
})

// ponytail: integration test, needs ANTHROPIC_API_KEY
const hasApiKey = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your-key-here'

describe.skipIf(!hasApiKey)('scoreJob (integration)', () => {
  it('returns structured score result', async () => {
    const cv = `Software Engineer with 7 years of Python experience.
Built microservices on AWS ECS. Experience with CI/CD using GitHub Actions.
Familiar with Terraform and Docker.`

    const jd = `Must-haves:
- 5+ years Python experience
- Kubernetes experience
- CI/CD pipeline experience

Nice-to-haves:
- Terraform
- Go`

    const result = await scoreJob(cv, jd)

    expect(result).toHaveProperty('mustHaves')
    expect(result).toHaveProperty('niceToHaves')
    expect(result).toHaveProperty('totalScore')
    expect(result).toHaveProperty('totalFraction')
    expect(Array.isArray(result.mustHaves)).toBe(true)
    expect(result.mustHaves.length).toBeGreaterThan(0)
    expect(typeof result.totalScore).toBe('number')
    expect(result.totalScore).toBeGreaterThanOrEqual(0)
    expect(result.totalScore).toBeLessThanOrEqual(100)

    for (const mh of result.mustHaves) {
      expect(['full', 'adjacent', 'none']).toContain(mh.status)
      expect([0, 0.5, 1]).toContain(mh.score)
    }
  }, 30_000)
})
