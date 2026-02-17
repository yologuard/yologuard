import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAuditStore } from './store.js'

const makeTmpDir = () => mkdtempSync(join(tmpdir(), 'yologuard-audit-test-'))

describe('createAuditStore', () => {
  let auditDir: string
  let store: ReturnType<typeof createAuditStore>

  beforeEach(() => {
    auditDir = makeTmpDir()
    store = createAuditStore({ sandboxId: 'test-sandbox-1', auditDir })
  })

  afterEach(() => {
    store.close()
    rmSync(auditDir, { recursive: true, force: true })
  })

  it('creates the DB file in the audit directory', () => {
    expect(store.dbPath).toBe(join(auditDir, 'test-sandbox-1.db'))
  })

  describe('logEntry', () => {
    it('inserts an entry and returns it with id and timestamp', () => {
      const entry = store.logEntry({
        type: 'sandbox_lifecycle',
        data: { action: 'created' },
      })

      expect(entry.id).toBeDefined()
      expect(entry.sandboxId).toBe('test-sandbox-1')
      expect(entry.type).toBe('sandbox_lifecycle')
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(entry.data).toEqual({ action: 'created' })
    })

    it('persists entries to the database', () => {
      store.logEntry({ type: 'command', data: { command: 'npm install' } })
      store.logEntry({ type: 'command', data: { command: 'npm test' } })

      const entries = store.getEntries()
      expect(entries).toHaveLength(2)
    })
  })

  describe('queryEntries', () => {
    beforeEach(() => {
      store.logEntry({ type: 'sandbox_lifecycle', data: { action: 'created' } })
      store.logEntry({ type: 'command', data: { command: 'npm install' } })
      store.logEntry({ type: 'network_request', data: { url: 'https://registry.npmjs.org' } })
      store.logEntry({ type: 'command', data: { command: 'npm test' } })
      store.logEntry({ type: 'approval_decision', data: { approved: true } })
    })

    it('returns all entries when called with no params', () => {
      const entries = store.queryEntries()
      expect(entries).toHaveLength(5)
    })

    it('filters by type', () => {
      const entries = store.queryEntries({ type: 'command' })
      expect(entries).toHaveLength(2)
      expect(entries.every((e) => e.type === 'command')).toBe(true)
    })

    it('supports limit', () => {
      const entries = store.queryEntries({ limit: 2 })
      expect(entries).toHaveLength(2)
    })

    it('supports offset', () => {
      const all = store.queryEntries()
      const offset = store.queryEntries({ offset: 2 })
      expect(offset).toHaveLength(3)
      expect(offset[0].id).toBe(all[2].id)
    })

    it('supports limit and offset together', () => {
      const all = store.queryEntries()
      const page = store.queryEntries({ limit: 2, offset: 1 })
      expect(page).toHaveLength(2)
      expect(page[0].id).toBe(all[1].id)
      expect(page[1].id).toBe(all[2].id)
    })

    it('filters by since timestamp', () => {
      const all = store.queryEntries()
      const midTimestamp = all[2].timestamp
      const entries = store.queryEntries({ since: midTimestamp })
      expect(entries.length).toBeGreaterThanOrEqual(3)
      expect(entries.every((e) => e.timestamp >= midTimestamp)).toBe(true)
    })

    it('combines type and limit filters', () => {
      const entries = store.queryEntries({ type: 'command', limit: 1 })
      expect(entries).toHaveLength(1)
      expect(entries[0].type).toBe('command')
    })
  })

  describe('getEntries', () => {
    it('returns all entries ordered by timestamp', () => {
      store.logEntry({ type: 'command', data: { command: 'first' } })
      store.logEntry({ type: 'command', data: { command: 'second' } })

      const entries = store.getEntries()
      expect(entries).toHaveLength(2)
      expect(entries[0].timestamp <= entries[1].timestamp).toBe(true)
    })
  })

  describe('data serialization', () => {
    it('round-trips complex data through JSON', () => {
      const complexData = {
        nested: { deep: { value: 42 } },
        array: [1, 'two', { three: true }],
        nullValue: null,
      }

      store.logEntry({ type: 'command', data: complexData })
      const [entry] = store.getEntries()
      expect(entry.data).toEqual(complexData)
    })
  })
})
