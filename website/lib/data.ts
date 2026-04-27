import fs from 'fs'
import path from 'path'
import type { RunRecord, RunSummary } from './types'

function getRunsDir(): string {
  if (process.env.ARGUS_RUNS_DIR) {
    return process.env.ARGUS_RUNS_DIR
  }
  // Try real runs dir relative to project root
  const realDir = path.resolve(process.cwd(), '..', '.argus', 'runs')
  if (fs.existsSync(realDir)) {
    const files = fs.readdirSync(realDir).filter((f) => f.endsWith('.json'))
    if (files.length > 0) return realDir
  }
  // Fall back to demo data bundled in website/data/runs
  return path.resolve(process.cwd(), 'data', 'runs')
}

function parseRun(filePath: string): RunRecord | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as RunRecord
  } catch {
    return null
  }
}

export function listRuns(): RunSummary[] {
  const dir = getRunsDir()
  if (!fs.existsSync(dir)) return []

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f))

  const summaries: RunSummary[] = []

  for (const file of files) {
    const run = parseRun(file)
    if (!run) continue
    summaries.push({
      run_id: run.run_id,
      overall_status: run.overall_status,
      started_at: run.started_at,
      duration_ms: run.duration_ms,
      step_count: run.steps?.length ?? 0,
      first_failure_step: run.first_failure_step,
      graph_node_names: run.graph_node_names ?? [],
      argus_version: run.argus_version,
      parent_run_id: run.parent_run_id ?? null,
    })
  }

  // Sort newest first
  summaries.sort((a, b) => {
    return new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  })

  return summaries
}

export function getRun(id: string): RunRecord | null {
  const dir = getRunsDir()
  if (!fs.existsSync(dir)) return null

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))

  for (const file of files) {
    const name = path.basename(file, '.json')
    if (name === id || name.startsWith(id)) {
      return parseRun(path.join(dir, file))
    }
  }
  return null
}

export function getTwoRuns(idA: string, idB: string): [RunRecord | null, RunRecord | null] {
  return [getRun(idA), getRun(idB)]
}

function getLogsDir(): string {
  if (process.env.ARGUS_LOGS_DIR) return process.env.ARGUS_LOGS_DIR
  const realDir = path.resolve(process.cwd(), '..', '.argus', 'logs')
  if (fs.existsSync(realDir)) return realDir
  return path.resolve(process.cwd(), 'data', 'logs')
}

export function getRunLog(id: string): string | null {
  const dir = getLogsDir()
  if (!fs.existsSync(dir)) return null
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.log'))
  for (const file of files) {
    const name = path.basename(file, '.log')
    if (name === id || name.startsWith(id)) {
      try {
        return fs.readFileSync(path.join(dir, file), 'utf-8').trim()
      } catch {
        return null
      }
    }
  }
  return null
}
