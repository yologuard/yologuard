import { mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { AuditEntry, AuditEntryType } from '@yologuard/shared'

type CreateAuditStoreParams = {
	readonly sandboxId: string
	readonly auditDir: string
}

type LogEntryParams = {
	readonly type: AuditEntryType
	readonly data: Record<string, unknown>
}

type QueryEntriesParams = {
	readonly type?: AuditEntryType
	readonly limit?: number
	readonly offset?: number
	readonly since?: string
}

type RawRow = {
	readonly id: string
	readonly sandbox_id: string
	readonly type: string
	readonly timestamp: string
	readonly data: string
}

const toAuditEntry = (row: RawRow): AuditEntry => ({
	id: row.id,
	sandboxId: row.sandbox_id,
	type: row.type as AuditEntryType,
	timestamp: row.timestamp,
	data: JSON.parse(row.data) as Record<string, unknown>,
})

export const createAuditStore = ({ sandboxId, auditDir }: CreateAuditStoreParams): AuditStore => {
	mkdirSync(auditDir, { recursive: true })
	const dbPath = join(auditDir, `${sandboxId}.db`)
	const db = new Database(dbPath)

	db.pragma('journal_mode = WAL')
	db.exec(`
		CREATE TABLE IF NOT EXISTS entries (
			id TEXT PRIMARY KEY,
			sandbox_id TEXT NOT NULL,
			type TEXT NOT NULL,
			timestamp TEXT NOT NULL,
			data TEXT NOT NULL
		)
	`)
	db.exec('CREATE INDEX IF NOT EXISTS idx_entries_sandbox_id ON entries (sandbox_id)')
	db.exec('CREATE INDEX IF NOT EXISTS idx_entries_type ON entries (type)')
	db.exec('CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON entries (timestamp)')

	const insertStmt = db.prepare(
		'INSERT INTO entries (id, sandbox_id, type, timestamp, data) VALUES (?, ?, ?, ?, ?)',
	)

	const logEntry = ({ type, data }: LogEntryParams): AuditEntry => {
		const entry: AuditEntry = {
			id: randomUUID(),
			sandboxId,
			type,
			timestamp: new Date().toISOString(),
			data,
		}
		insertStmt.run(entry.id, entry.sandboxId, entry.type, entry.timestamp, JSON.stringify(entry.data))
		return entry
	}

	const queryEntries = (params: QueryEntriesParams = {}): readonly AuditEntry[] => {
		const { type, limit, offset, since } = params
		const conditions: string[] = ['sandbox_id = ?']
		const values: unknown[] = [sandboxId]

		if (type) {
			conditions.push('type = ?')
			values.push(type)
		}
		if (since) {
			conditions.push('timestamp >= ?')
			values.push(since)
		}

		let sql = `SELECT * FROM entries WHERE ${conditions.join(' AND ')} ORDER BY timestamp ASC`

		if (limit) {
			sql += ` LIMIT ${limit}`
		} else if (offset) {
			sql += ' LIMIT -1'
		}
		if (offset) {
			sql += ` OFFSET ${offset}`
		}

		return (db.prepare(sql).all(...values) as RawRow[]).map(toAuditEntry)
	}

	const getEntries = (): readonly AuditEntry[] => queryEntries()

	const close = () => {
		db.close()
	}

	return { logEntry, queryEntries, getEntries, close, db, dbPath }
}

export type AuditStore = {
	readonly logEntry: (params: LogEntryParams) => AuditEntry
	readonly queryEntries: (params?: QueryEntriesParams) => readonly AuditEntry[]
	readonly getEntries: () => readonly AuditEntry[]
	readonly close: () => void
	readonly db: Database.Database
	readonly dbPath: string
}
