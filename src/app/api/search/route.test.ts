import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/scraper', () => ({
  scrapeJobs: vi.fn().mockResolvedValue([
    { title: 'Engineer', location: 'Remote', url: 'https://x.com/1', description: 'Build stuff' },
  ]),
}))

import { POST } from './route'

function makeReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/search', () => {
  it('returns jobs on valid input', async () => {
    const res = await POST(makeReq({ company: 'stripe', jobTitle: 'engineer', location: 'remote' }) as never)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.jobs).toHaveLength(1)
    expect(data.jobs[0].title).toBe('Engineer')
  })

  it('returns 400 on missing fields', async () => {
    const res = await POST(makeReq({ company: 'stripe' }) as never)
    expect(res.status).toBe(400)
  })
})
