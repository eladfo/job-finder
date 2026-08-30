import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/scorer', () => ({
  parseCv: vi.fn().mockResolvedValue('parsed cv text'),
  scoreJob: vi.fn().mockResolvedValue({
    mustHaves: [{ requirement: 'Python', status: 'full', score: 1.0, evidence: 'yes' }],
    niceToHaves: ['Go'],
    totalScore: 100,
    totalFraction: '1/1',
  }),
}))

import { POST } from './route'

describe('POST /api/score', () => {
  it('scores CV text against a job description', async () => {
    const fd = new FormData()
    fd.set('cvText', 'I know Python')
    fd.set('jobDescription', 'Must know Python')

    const res = await POST(new Request('http://localhost/api/score', { method: 'POST', body: fd }) as never)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.score.totalScore).toBe(100)
    expect(data.score.mustHaves).toHaveLength(1)
  })

  it('returns 400 without jobDescription', async () => {
    const fd = new FormData()
    fd.set('cvText', 'I know Python')

    const res = await POST(new Request('http://localhost/api/score', { method: 'POST', body: fd }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 without CV', async () => {
    const fd = new FormData()
    fd.set('jobDescription', 'Must know Python')

    const res = await POST(new Request('http://localhost/api/score', { method: 'POST', body: fd }) as never)
    expect(res.status).toBe(400)
  })
})
