import { describe, it, expect, beforeEach } from 'vitest'
import { getCareerUrl, saveCareerUrl } from './db'
import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'

const DB_PATH = join(process.cwd(), 'career-pages.db')

beforeEach(() => {
  // ponytail: wipe DB between tests for isolation.
  // The module caches the db instance, so we need to reset it.
  // Since sql.js is in-memory with file persistence, removing the file
  // and clearing the module cache gives us a fresh start.
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH)
})

describe('career page DB', () => {
  it('seeds known URLs on first access', async () => {
    const url = await getCareerUrl('google')
    expect(url).toContain('google.com')
    expect(existsSync(DB_PATH)).toBe(true)
  })

  it('saves and retrieves a new company URL', async () => {
    await saveCareerUrl('testcorp', 'https://testcorp.com/careers')
    const url = await getCareerUrl('testcorp')
    expect(url).toBe('https://testcorp.com/careers')
  })

  it('normalizes company names (case + spaces)', async () => {
    await saveCareerUrl('Test Corp', 'https://testcorp.com/careers')
    const url = await getCareerUrl('test corp')
    expect(url).toBe('https://testcorp.com/careers')
  })
})
