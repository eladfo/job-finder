'use client'

import { useState, useRef, FormEvent } from 'react'
import type { JobListing, ScoreResult, MustHave } from '@/lib/types'
import { computeScore, toggleAdjacency as toggleAdj } from '@/lib/score-utils'

type View = 'search' | 'results' | 'score'

export default function Home() {
  const [view, setView] = useState<View>('search')
  const [jobs, setJobs] = useState<JobListing[]>([])
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null)
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null)
  const [adjustedMustHaves, setAdjustedMustHaves] = useState<MustHave[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [cvText, setCvText] = useState('')
  const [company, setCompany] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [location, setLocation] = useState('')
  const [scoringJob, setScoringJob] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasCv = cvFile !== null || cvText.trim().length > 0

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, jobTitle, location }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      if (!data.jobs?.length) throw new Error('No matching jobs found')
      setJobs(data.jobs)
      setSelectedJob(data.jobs[0])
      setScoreResult(null)
      setView('results')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to search. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleScore() {
    if (!selectedJob || !hasCv) return
    setScoringJob(true)
    setError(null)
    try {
      const fd = new FormData()
      if (cvFile) fd.set('cv', cvFile)
      else fd.set('cvText', cvText)
      fd.set('jobDescription', selectedJob.description)

      const res = await fetch('/api/score', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scoring failed')
      setScoreResult(data.score)
      setAdjustedMustHaves(data.score.mustHaves.map((m: MustHave) => ({ ...m })))
      setView('score')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to score. Please try again.')
    } finally {
      setScoringJob(false)
    }
  }

  function handleToggleAdjacency(index: number) {
    setAdjustedMustHaves(prev => toggleAdj(prev, index))
  }

  function scoreColor(score: number): string {
    if (score >= 75) return 'text-green-600'
    if (score >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }

  function scoreBg(score: number): string {
    if (score >= 75) return 'bg-green-100 border-green-300'
    if (score >= 50) return 'bg-yellow-100 border-yellow-300'
    return 'bg-red-100 border-red-300'
  }

  function statusBadge(status: MustHave['status'], score: number) {
    if (status === 'full') return <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Full Match</span>
    if (status === 'adjacent') {
      if (score === 0.5) return <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Adjacent</span>
      return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Denied</span>
    }
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">No Match</span>
  }

  // ── Search Form ──
  if (view === 'search') {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <form onSubmit={handleSearch} className="w-full max-w-lg space-y-6">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Job Finder</h1>
            <p className="text-zinc-500 mt-2">Find real jobs from company career pages</p>
          </div>

          {/* CV Upload */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Your CV</label>
            <div
              className="border-2 border-dashed border-zinc-300 rounded-lg p-6 text-center cursor-pointer hover:border-zinc-400 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
              onDrop={e => {
                e.preventDefault()
                const file = e.dataTransfer.files[0]
                if (file?.type === 'application/pdf') setCvFile(file)
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={e => setCvFile(e.target.files?.[0] ?? null)}
              />
              {cvFile ? (
                <p className="text-sm text-zinc-700">{cvFile.name}</p>
              ) : (
                <p className="text-sm text-zinc-400">Drop a PDF here or click to upload</p>
              )}
            </div>
            <div className="text-center text-xs text-zinc-400">or paste your CV text below</div>
            <textarea
              className="w-full h-24 border border-zinc-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400"
              placeholder="Paste your CV text here..."
              value={cvText}
              onChange={e => setCvText(e.target.value)}
            />
          </div>

          {/* Search Fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Company</label>
              <input
                type="text"
                required
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                placeholder="e.g. Google, NVIDIA, Stripe"
                value={company}
                onChange={e => setCompany(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Job Title</label>
              <input
                type="text"
                required
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                placeholder="e.g. Software Engineer, Product Manager"
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input
                type="text"
                required
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                placeholder="e.g. Tel Aviv, Remote, New York"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-zinc-900 text-white rounded-lg py-3 text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Searching...' : 'Search Jobs'}
          </button>
        </form>
      </div>
    )
  }

  // ── Results Explorer ──
  if (view === 'results') {
    return (
      <div className="flex-1 flex flex-col h-screen">
        {/* Header */}
        <div className="border-b border-zinc-200 px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => setView('search')}
            className="text-sm text-zinc-500 hover:text-zinc-700"
          >
            &larr; Back
          </button>
          <h2 className="text-sm font-medium">
            {jobs.length} jobs found at <span className="font-semibold">{company}</span>
          </h2>
        </div>

        {/* Two-panel layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: job list */}
          <div className="w-80 border-r border-zinc-200 overflow-y-auto">
            {jobs.map((job, i) => (
              <button
                key={i}
                onClick={() => { setSelectedJob(job); setScoreResult(null); setView('results') }}
                className={`w-full text-left px-4 py-3 border-b border-zinc-100 hover:bg-zinc-50 transition-colors ${
                  selectedJob === job ? 'bg-zinc-100' : ''
                }`}
              >
                <div className="text-sm font-medium truncate">{job.title}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{job.location}</div>
              </button>
            ))}
          </div>

          {/* Right: job detail */}
          <div className="flex-1 overflow-y-auto p-6">
            {selectedJob ? (
              <div className="max-w-2xl">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold">{selectedJob.title}</h3>
                    <p className="text-sm text-zinc-500 mt-1">{company} &middot; {selectedJob.location}</p>
                  </div>
                  <div className="flex gap-2">
                    {hasCv && (
                      <button
                        onClick={handleScore}
                        disabled={scoringJob}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {scoringJob ? 'Scoring...' : 'Score My Fit'}
                      </button>
                    )}
                    <a
                      href={selectedJob.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 border border-zinc-300 text-sm rounded-lg hover:bg-zinc-50 transition-colors"
                    >
                      Apply &nearr;
                    </a>
                  </div>
                </div>

                {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

                {!hasCv && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800 mb-4">
                    Upload your CV on the search page to enable fit scoring.
                  </div>
                )}

                <div className="prose prose-sm max-w-none">
                  <h4 className="text-sm font-medium text-zinc-700 mb-2">Job Description</h4>
                  <div className="whitespace-pre-wrap text-sm text-zinc-600 leading-relaxed">
                    {selectedJob.description}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-zinc-400 text-sm">Select a job to view details</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Score View ──
  if (view === 'score' && scoreResult && selectedJob) {
    const adjusted = computeScore(adjustedMustHaves)
    const gaps = adjustedMustHaves.filter(m => m.status === 'none' || (m.status === 'adjacent' && m.score === 0))
    const niceToHaves = scoreResult.niceToHaves

    return (
      <div className="flex-1 flex flex-col h-screen">
        {/* Header */}
        <div className="border-b border-zinc-200 px-4 py-3 flex items-center gap-4">
          <button
            onClick={() => setView('results')}
            className="text-sm text-zinc-500 hover:text-zinc-700"
          >
            &larr; Back to job
          </button>
          <h2 className="text-sm font-medium">
            Score: <span className="font-semibold">{selectedJob.title}</span>
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Score Header */}
            <div className={`rounded-xl border p-6 text-center ${scoreBg(adjusted.score)}`}>
              <div className={`text-5xl font-bold ${scoreColor(adjusted.score)}`}>
                {adjusted.score}%
              </div>
              <div className="text-sm text-zinc-600 mt-1">
                {adjusted.fraction} must-haves matched
              </div>
            </div>

            {/* Must-haves Breakdown */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Must-Haves Breakdown</h4>
              <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-100">
                {adjustedMustHaves.map((mh, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {statusBadge(mh.status, mh.score)}
                        <span className="text-sm font-medium">{mh.requirement}</span>
                      </div>
                      {mh.status === 'adjacent' && (
                        <button
                          onClick={() => handleToggleAdjacency(i)}
                          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                            mh.score === 0.5
                              ? 'bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700'
                              : 'bg-red-50 border-red-300 text-red-700 hover:bg-yellow-50 hover:border-yellow-300 hover:text-yellow-700'
                          }`}
                        >
                          {mh.score === 0.5 ? 'Deny' : 'Confirm'}
                        </button>
                      )}
                    </div>
                    {mh.evidence && (
                      <p className="text-xs text-zinc-500 mt-1 ml-[90px]">{mh.evidence}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Flagged Gaps */}
            {gaps.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 text-red-700">Flagged Gaps</h4>
                <ul className="list-disc list-inside text-sm text-red-600 space-y-1">
                  {gaps.map((g, i) => (
                    <li key={i}>{g.requirement}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Nice-to-haves */}
            {niceToHaves.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 text-green-700">Nice-to-Haves Met</h4>
                <div className="flex flex-wrap gap-2">
                  {niceToHaves.map((n, i) => (
                    <span key={i} className="px-2 py-1 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
