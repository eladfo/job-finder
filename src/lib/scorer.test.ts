import { describe, it, expect } from 'vitest'
import { parseCv, scoreJob } from './scorer'

describe('parseCv', () => {
  it('parses plain text buffer', async () => {
    const buf = Buffer.from('I am a software engineer with 5 years experience')
    const result = await parseCv(buf, 'text/plain')
    expect(result).toBe('I am a software engineer with 5 years experience')
  })
})

describe('scoreJob', () => {
  it('scores a CV against a JD with must-haves and nice-to-haves', async () => {
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

    expect(result.mustHaves).toHaveLength(3)
    expect(result.totalScore).toBeGreaterThanOrEqual(0)
    expect(result.totalScore).toBeLessThanOrEqual(100)
    expect(typeof result.totalFraction).toBe('string')

    // Python should be a full match
    const python = result.mustHaves.find(m => m.requirement.toLowerCase().includes('python'))
    expect(python?.status).toBe('full')

    // Kubernetes should be adjacent (CV has Docker/ECS)
    const k8s = result.mustHaves.find(m => m.requirement.toLowerCase().includes('kubernetes'))
    expect(k8s?.status).toBe('adjacent')

    // CI/CD should match
    const cicd = result.mustHaves.find(m => m.requirement.toLowerCase().includes('ci/cd'))
    expect(cicd?.status === 'full' || cicd?.status === 'adjacent').toBe(true)

    // Terraform should be in nice-to-haves
    expect(result.niceToHaves.some(n => n.toLowerCase().includes('terraform'))).toBe(true)
  })

  it('handles JD with no clear sections', async () => {
    const cv = 'Senior developer with 10 years Java and Spring Boot experience'
    const jd = 'Looking for a Java developer with 5+ years of experience in Spring Boot'

    const result = await scoreJob(cv, jd)
    expect(result).toHaveProperty('mustHaves')
    expect(result).toHaveProperty('totalScore')
  })
})
