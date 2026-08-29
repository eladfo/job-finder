import { describe, it, expect } from 'vitest'
import { computeScore, toggleAdjacency } from './score-utils'
import type { MustHave } from './types'

describe('computeScore', () => {
  it('calculates score from must-haves', () => {
    const mustHaves: MustHave[] = [
      { requirement: 'Python', status: 'full', score: 1.0, evidence: 'yes' },
      { requirement: 'K8s', status: 'adjacent', score: 0.5, evidence: 'has ECS' },
      { requirement: 'CI/CD', status: 'none', score: 0, evidence: null },
    ]
    const result = computeScore(mustHaves)
    expect(result.score).toBe(50) // (1.5/3)*100 = 50
    expect(result.fraction).toBe('1.5/3')
  })

  it('returns 0 for empty array', () => {
    const result = computeScore([])
    expect(result.score).toBe(0)
    expect(result.fraction).toBe('0/0')
  })

  it('returns 100 for all full matches', () => {
    const mustHaves: MustHave[] = [
      { requirement: 'A', status: 'full', score: 1.0, evidence: 'yes' },
      { requirement: 'B', status: 'full', score: 1.0, evidence: 'yes' },
    ]
    expect(computeScore(mustHaves).score).toBe(100)
  })
})

describe('toggleAdjacency', () => {
  it('denies an adjacent match (0.5 → 0)', () => {
    const mustHaves: MustHave[] = [
      { requirement: 'K8s', status: 'adjacent', score: 0.5, evidence: 'has ECS' },
    ]
    const result = toggleAdjacency(mustHaves, 0)
    expect(result[0].score).toBe(0)
    expect(result[0].status).toBe('adjacent') // status stays, score changes
  })

  it('re-confirms a denied adjacent match (0 → 0.5)', () => {
    const mustHaves: MustHave[] = [
      { requirement: 'K8s', status: 'adjacent', score: 0, evidence: 'has ECS' },
    ]
    const result = toggleAdjacency(mustHaves, 0)
    expect(result[0].score).toBe(0.5)
  })

  it('does not modify non-adjacent items', () => {
    const mustHaves: MustHave[] = [
      { requirement: 'Python', status: 'full', score: 1.0, evidence: 'yes' },
    ]
    const result = toggleAdjacency(mustHaves, 0)
    expect(result[0].score).toBe(1.0)
  })

  it('does not mutate the original array', () => {
    const mustHaves: MustHave[] = [
      { requirement: 'K8s', status: 'adjacent', score: 0.5, evidence: 'has ECS' },
    ]
    toggleAdjacency(mustHaves, 0)
    expect(mustHaves[0].score).toBe(0.5)
  })

  it('recalculates score correctly after toggle', () => {
    const mustHaves: MustHave[] = [
      { requirement: 'Python', status: 'full', score: 1.0, evidence: 'yes' },
      { requirement: 'K8s', status: 'adjacent', score: 0.5, evidence: 'has ECS' },
      { requirement: 'CI/CD', status: 'none', score: 0, evidence: null },
    ]
    // Before: 1.5/3 = 50%
    expect(computeScore(mustHaves).score).toBe(50)

    // After denying K8s: 1.0/3 = 33%
    const denied = toggleAdjacency(mustHaves, 1)
    expect(computeScore(denied).score).toBe(33)

    // After re-confirming: back to 50%
    const confirmed = toggleAdjacency(denied, 1)
    expect(computeScore(confirmed).score).toBe(50)
  })
})
