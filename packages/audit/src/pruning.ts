import { statSync } from 'node:fs'
import type Database from 'better-sqlite3'

const BATCH_SIZE = 1000

export const pruneIfNeeded = ({
  db,
  maxSizeBytes,
}: {
  readonly db: Database.Database
  readonly maxSizeBytes: number
}): number => {
  let size: number
  try {
    size = statSync(db.name).size
  } catch {
    return 0
  }

  if (size <= maxSizeBytes) return 0

  const result = db
    .prepare(`
		DELETE FROM entries WHERE id IN (
			SELECT id FROM entries
			WHERE type != 'approval_decision'
			ORDER BY timestamp ASC
			LIMIT ?
		)
	`)
    .run(BATCH_SIZE)

  if (result.changes > 0) {
    db.exec('VACUUM')
  }

  return result.changes
}
