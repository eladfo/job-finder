import { PDFParse } from 'pdf-parse'
import type { ScoreResult, MustHave } from './types'

// ponytail: keyword-based scorer, no LLM. Parses JD sections heuristically,
// matches requirements against CV text. Upgrade to LLM-based when API key available.

export async function parseCv(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    const result = await parser.getText()
    const text = result.text.trim()
    if (!text) throw new Error('PDF appears to be scanned/image-only. Please paste your CV text instead.')
    return text
  }
  return buffer.toString('utf-8')
}

function parseRequirements(jd: string): { mustHaves: string[]; niceToHaves: string[] } {
  const lines = jd.split('\n').map(l => l.trim()).filter(Boolean)
  const mustHaves: string[] = []
  const niceToHaves: string[] = []

  let section: 'none' | 'must' | 'nice' = 'none'

  for (const line of lines) {
    const lower = line.toLowerCase()

    // Detect section headers
    if (/must[\s-]*have|require|qualification|what you.*(need|bring)|minimum/i.test(lower)) {
      section = 'must'
      continue
    }
    if (/nice[\s-]*to[\s-]*have|prefer|bonus|plus|ideal|desired/i.test(lower)) {
      section = 'nice'
      continue
    }
    if (/responsibilit|what you.*do|about the|overview|description|who we are/i.test(lower)) {
      section = 'none'
      continue
    }

    // Extract bullet points
    const bullet = line.replace(/^[-*•●◦▪]\s*/, '').trim()
    if (bullet.length < 5) continue

    if (section === 'must') mustHaves.push(bullet)
    else if (section === 'nice') niceToHaves.push(bullet)
    // ponytail: if we haven't seen a section header, treat bullet-style lines as must-haves
    else if (/^[-*•●◦▪]/.test(line) && mustHaves.length === 0 && bullet.length > 10) {
      mustHaves.push(bullet)
    }
  }

  // ponytail: fallback — if no must-haves found, try to extract "X+ years" patterns and tech keywords
  if (mustHaves.length === 0) {
    const yearPatterns = jd.match(/\d+\+?\s*years?\s+(?:of\s+)?(?:experience\s+(?:with|in)\s+)?[\w\s/+#.]+/gi) || []
    mustHaves.push(...yearPatterns.map(p => p.trim()))
  }

  return { mustHaves, niceToHaves }
}

function extractKeywords(text: string): Set<string> {
  const lower = text.toLowerCase()
  // Split on non-alphanumeric (keeping +, #, .) for tech terms
  const words = lower.split(/[^a-z0-9+#.]+/).filter(w => w.length > 1)
  // Also extract multi-word tech terms
  const multiWord = lower.match(/[a-z][a-z\s/+#.]{2,30}/g) || []
  return new Set([...words, ...multiWord.map(m => m.trim())])
}

function matchRequirement(requirement: string, cvKeywords: Set<string>, cvText: string): MustHave {
  const reqLower = requirement.toLowerCase()
  const reqWords = reqLower.split(/[^a-z0-9+#.]+/).filter(w => w.length > 2)
  const cvLower = cvText.toLowerCase()

  // Check for direct phrase match
  if (cvLower.includes(reqLower.slice(0, 30))) {
    return { requirement, status: 'full', score: 1.0, evidence: `CV contains: "${requirement.slice(0, 50)}"` }
  }

  // Check keyword overlap
  const matchedWords = reqWords.filter(w => cvKeywords.has(w) || cvLower.includes(w))
  const ratio = reqWords.length > 0 ? matchedWords.length / reqWords.length : 0

  if (ratio >= 0.6) {
    return {
      requirement,
      status: 'full',
      score: 1.0,
      evidence: `CV matches keywords: ${matchedWords.join(', ')}`,
    }
  }

  if (ratio >= 0.3) {
    return {
      requirement,
      status: 'adjacent',
      score: 0.5,
      evidence: `Partial match: ${matchedWords.join(', ')} (${Math.round(ratio * 100)}% keyword overlap)`,
    }
  }

  // ponytail: check common equivalent terms
  const equivalents: Record<string, string[]> = {
    kubernetes: ['k8s', 'docker', 'container', 'ecs', 'eks'],
    python: ['django', 'flask', 'fastapi'],
    javascript: ['typescript', 'node', 'react', 'vue', 'angular'],
    typescript: ['javascript', 'node', 'react'],
    aws: ['amazon', 'ec2', 's3', 'lambda', 'cloud'],
    gcp: ['google cloud', 'cloud'],
    azure: ['microsoft cloud', 'cloud'],
    'ci/cd': ['github actions', 'jenkins', 'circleci', 'gitlab', 'pipeline'],
    sql: ['postgres', 'postgresql', 'mysql', 'database', 'sqlite'],
    nosql: ['mongodb', 'dynamodb', 'redis', 'cassandra'],
    react: ['next.js', 'nextjs', 'frontend', 'front-end'],
    node: ['express', 'nestjs', 'backend', 'back-end'],
  }

  for (const [key, alts] of Object.entries(equivalents)) {
    if (reqLower.includes(key)) {
      const altMatch = alts.find(a => cvLower.includes(a))
      if (altMatch) {
        return {
          requirement,
          status: 'adjacent',
          score: 0.5,
          evidence: `CV has "${altMatch}" (related to ${key})`,
        }
      }
    }
    // reverse check
    for (const alt of alts) {
      if (reqLower.includes(alt) && cvLower.includes(key)) {
        return {
          requirement,
          status: 'adjacent',
          score: 0.5,
          evidence: `CV has "${key}" (related to ${alt})`,
        }
      }
    }
  }

  return { requirement, status: 'none', score: 0, evidence: null }
}

export async function scoreJob(cvText: string, jobDescription: string): Promise<ScoreResult> {
  const { mustHaves: mustHaveTexts, niceToHaves: niceToHaveTexts } = parseRequirements(jobDescription)
  const cvKeywords = extractKeywords(cvText)

  const mustHaves = mustHaveTexts.map(req => matchRequirement(req, cvKeywords, cvText))

  const matchedNiceToHaves = niceToHaveTexts.filter(n => {
    const nLower = n.toLowerCase()
    const words = nLower.split(/[^a-z0-9+#.]+/).filter(w => w.length > 2)
    return words.some(w => cvKeywords.has(w) || cvText.toLowerCase().includes(w))
  })

  const total = mustHaves.length
  const sum = mustHaves.reduce((acc, m) => acc + m.score, 0)
  const totalScore = total > 0 ? Math.round((sum / total) * 100) : 0

  return {
    mustHaves,
    niceToHaves: matchedNiceToHaves,
    totalScore,
    totalFraction: `${sum}/${total}`,
  }
}
