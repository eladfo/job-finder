import type { MustHave } from './types'

export function computeScore(mustHaves: MustHave[]): { score: number; fraction: string } {
  const total = mustHaves.length
  if (total === 0) return { score: 0, fraction: '0/0' }
  const sum = mustHaves.reduce((acc, m) => acc + m.score, 0)
  return {
    score: Math.round((sum / total) * 100),
    fraction: `${sum}/${total}`,
  }
}

export function toggleAdjacency(mustHaves: MustHave[], index: number): MustHave[] {
  const next = mustHaves.map(m => ({ ...m }))
  const item = next[index]
  if (item.status === 'adjacent') {
    item.score = item.score === 0.5 ? 0 : 0.5
  }
  return next
}
