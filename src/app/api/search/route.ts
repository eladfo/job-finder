import { NextRequest, NextResponse } from 'next/server'
import { scrapeJobs } from '@/lib/scraper'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { company, jobTitle, location } = body

  if (!company || !jobTitle || !location) {
    return NextResponse.json({ error: 'company, jobTitle, and location are required' }, { status: 400 })
  }

  try {
    const jobs = await scrapeJobs(company, jobTitle, location)
    return NextResponse.json({ jobs })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Scraping failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
