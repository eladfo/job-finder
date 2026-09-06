import initSqlJs, { type Database } from 'sql.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// ponytail: sql.js is pure JS SQLite (no native binary). DB lives in-memory,
// persisted to disk on write. Fine for ~100 rows of career page URLs.

const DB_PATH = join(process.cwd(), 'career-pages.db')
const STALE_DAYS = 30

let db: Database | null = null

const KNOWN_CAREER_URLS: Record<string, string> = {
  google: 'https://www.google.com/about/careers/applications/jobs/results',
  nvidia: 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite',
  microsoft: 'https://apply.careers.microsoft.com/careers',
  meta: 'https://www.metacareers.com/jobs',
  apple: 'https://jobs.apple.com/en-us/search',
  amazon: 'https://www.amazon.jobs/en/search',
  netflix: 'https://explore.jobs.netflix.net/careers',
  stripe: 'https://stripe.com/jobs/search',
  openai: 'https://openai.com/careers/search',
  spotify: 'https://www.lifeatspotify.com/jobs',
}

async function getDb(): Promise<Database> {
  if (db) return db

  const SQL = await initSqlJs()

  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS career_pages (
      company TEXT PRIMARY KEY,
      career_url TEXT NOT NULL,
      verified_at TEXT NOT NULL
    )
  `)

  // Seed known URLs if table is empty
  const count = db.exec('SELECT COUNT(*) FROM career_pages')
  if (count[0]?.values[0]?.[0] === 0) {
    const stmt = db.prepare('INSERT OR IGNORE INTO career_pages (company, career_url, verified_at) VALUES (?, ?, ?)')
    const now = new Date().toISOString()
    for (const [company, url] of Object.entries(KNOWN_CAREER_URLS)) {
      stmt.run([company, url, now])
    }
    stmt.free()
    persist()
  }

  return db
}

function persist(): void {
  if (!db) return
  const data = db.export()
  writeFileSync(DB_PATH, Buffer.from(data))
}

export async function getCareerUrl(company: string): Promise<string | null> {
  const d = await getDb()
  const normalized = company.toLowerCase().replace(/\s+/g, '')

  const results = d.exec('SELECT career_url, verified_at FROM career_pages WHERE company = ?', [normalized])
  if (results.length === 0 || results[0].values.length === 0) return null

  const [url, verifiedAt] = results[0].values[0] as [string, string]
  const age = (Date.now() - new Date(verifiedAt).getTime()) / (1000 * 60 * 60 * 24)

  // ponytail: stale after 30 days — caller should re-verify and update
  if (age > STALE_DAYS) return null

  return url
}

export async function saveCareerUrl(company: string, url: string): Promise<void> {
  const d = await getDb()
  const normalized = company.toLowerCase().replace(/\s+/g, '')
  const now = new Date().toISOString()

  d.run(
    'INSERT OR REPLACE INTO career_pages (company, career_url, verified_at) VALUES (?, ?, ?)',
    [normalized, url, now],
  )
  persist()
}
