import { NextRequest, NextResponse } from 'next/server'
import { parseCv, scoreJob } from '@/lib/scorer'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const cvFile = formData.get('cv') as File | null
  const cvText = formData.get('cvText') as string | null
  const jobDescription = formData.get('jobDescription') as string | null

  if (!jobDescription) {
    return NextResponse.json({ error: 'jobDescription is required' }, { status: 400 })
  }

  let cv: string
  if (cvFile && cvFile.size > 0) {
    const buffer = Buffer.from(await cvFile.arrayBuffer())
    cv = await parseCv(buffer, cvFile.type)
  } else if (cvText?.trim()) {
    cv = cvText
  } else {
    return NextResponse.json({ error: 'Provide a CV (file or text)' }, { status: 400 })
  }

  try {
    const score = await scoreJob(cv, jobDescription)
    return NextResponse.json({ score })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Scoring failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
