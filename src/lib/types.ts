export type JobListing = {
  title: string
  location: string
  url: string
  description: string
}

export type MustHave = {
  requirement: string
  status: 'full' | 'adjacent' | 'none'
  score: number
  evidence: string | null
}

export type ScoreResult = {
  mustHaves: MustHave[]
  niceToHaves: string[]
  totalScore: number
  totalFraction: string
}

export type ScoredJob = JobListing & { scoreResult?: ScoreResult }
