import Anthropic from '@anthropic-ai/sdk'
import { PDFParse } from 'pdf-parse'
import type { ScoreResult } from './types'

const anthropic = new Anthropic()

export async function parseCv(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    const result = await parser.getText()
    const text = result.text.trim()
    if (!text) throw new Error('PDF appears to be scanned/image-only. Please paste your CV text instead.')
    return text
  }
  // ponytail: anything else treated as plain text
  return buffer.toString('utf-8')
}

export async function scoreJob(cvText: string, jobDescription: string): Promise<ScoreResult> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `You are a job fit scoring engine. Score how well this candidate's CV matches the job description.

## Scoring formula

1. Parse the JD into MUST-HAVES only. Ignore nice-to-haves and responsibilities for the math.
2. For each must-have, classify fit as:
   - Full match (1.0): confirmed skill/experience, same or equivalent term
   - Adjacent (0.5): real but not identical (e.g. ECS vs Kubernetes). Flag these — don't assume they apply.
   - No match (0): hard gap, nothing to bridge
3. Score = (sum of points / number of must-haves) x 100. Plain average, no cap, no override.
4. Separately list every must-have that scored 0 as a flagged gap.
5. Nice-to-haves never move the number. List ones the candidate meets as upside color.

## Output

Respond with ONLY a JSON object (no markdown, no backticks):

{
  "mustHaves": [
    { "requirement": "description of requirement", "status": "full" | "adjacent" | "none", "score": 1.0 | 0.5 | 0, "evidence": "what in the CV matched, or null if none" }
  ],
  "niceToHaves": ["list of nice-to-haves the candidate meets"],
  "totalScore": <number 0-100>,
  "totalFraction": "<sum>/<count>"
}

## CV
${cvText}

## Job Description
${jobDescription}`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleaned) as ScoreResult
}
