import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAuditStore } from './store.js'
import { pruneIfNeeded } from './pruning.js'

const makeTmpDir = () => mkdtempSync(join(tmpdir(), 'yologuard-prune-test-'))

describe('pruneIfNeeded', () => {
  let auditDir: string
  let store: ReturnType<typeof createAuditStore>

  beforeEach(() => {
    auditDir = makeTmpDir()
    store = createAuditStore({ sandboxId: 'prune-test', auditDir })
  })

  afterEach(() => {
    store.close()
    rmSync(auditDir, { recursive: true, force: true })
  })

  it('returns 0 when DB is under the size limit', () => {
    store.logEntry({ type: 'command', data: { command: 'ls' } })

    const deleted = pruneIfNeeded({ db: store.db, maxSizeBytes: 50 * 1024 * 1024 })
    expect(deleted).toBe(0)
  })

  it('deletes oldest non-approval entries when DB exceeds limit', () => {
    const largePayload = 'x'.repeat(1024)
    for (let i = 0; i < 200; i++) {
      store.logEntry({ type: 'command', data: { output: largePayload, index: i } })
    }
    store.logEntry({ type: 'approval_decision', data: { approved: true } })

    const sizeBefore = statSync(store.dbPath).size
    const deleted = pruneIfNeeded({ db: store.db, maxSizeBytes: 1 })

    expect(deleted).toBeGreaterThan(0)

    const remaining = store.getEntries()
    const approvalEntries = remaining.filter((e) => e.type === 'approval_decision')
    expect(approvalEntries).toHaveLength(1)
  })

  it('preserves approval_decision entries during pruning', () => {
    const largePayload = 'x'.repeat(1024)
    for (let i = 0; i < 50; i++) {
      store.logEntry({ type: 'approval_decision', data: { approved: true, payload: largePayload } })
    }
    for (let i = 0; i < 100; i++) {
      store.logEntry({ type: 'command', data: { output: largePayload } })
    }

    pruneIfNeeded({ db: store.db, maxSizeBytes: 1 })

    const remaining = store.getEntries()
    const approvalEntries = remaining.filter((e) => e.type === 'approval_decision')
    expect(approvalEntries).toHaveLength(50)
  })

  it('returns 0 when DB file does not exist', () => {
    store.close()
    rmSync(store.dbPath, { force: true })

    const mockDb = { name: store.dbPath } as ReturnType<typeof createAuditStore>['db']
    const deleted = pruneIfNeeded({ db: mockDb, maxSizeBytes: 1 })
    expect(deleted).toBe(0)
  })
})
