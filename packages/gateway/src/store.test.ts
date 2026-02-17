import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSandboxStore } from './store.js'

const makeTempStore = () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'yologuard-store-test-'))
  const store = createSandboxStore({ stateDir })
  return { store, stateDir }
}

describe('sandboxStore', () => {
  let stateDir: string
  let store: ReturnType<typeof createSandboxStore>

  beforeEach(() => {
    const tmp = makeTempStore()
    stateDir = tmp.stateDir
    store = tmp.store
  })

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true })
  })

  describe('create', () => {
    it('should create a sandbox with generated id and creating state', () => {
      const sandbox = store.create({ repo: '/tmp/repo', agent: 'claude' })

      expect(sandbox.id).toBeDefined()
      expect(sandbox.repo).toBe('/tmp/repo')
      expect(sandbox.agent).toBe('claude')
      expect(sandbox.state).toBe('creating')
      expect(sandbox.createdAt).toBeDefined()
    })
  })

  describe('get', () => {
    it('should return undefined for nonexistent sandbox', () => {
      expect(store.get('nonexistent')).toBeUndefined()
    })

    it('should return sandbox by id', () => {
      const created = store.create({ repo: '/tmp/repo', agent: 'claude' })
      const found = store.get(created.id)

      expect(found).toEqual(created)
    })
  })

  describe('list', () => {
    it('should return empty array when no sandboxes', () => {
      expect(store.list()).toEqual([])
    })

    it('should return all sandboxes', () => {
      store.create({ repo: '/tmp/repo1', agent: 'claude' })
      store.create({ repo: '/tmp/repo2', agent: 'codex' })

      expect(store.list()).toHaveLength(2)
    })
  })

  describe('remove', () => {
    it('should return false for nonexistent sandbox', () => {
      expect(store.remove('nonexistent')).toBe(false)
    })

    it('should remove and return true for existing sandbox', () => {
      const created = store.create({ repo: '/tmp/repo', agent: 'claude' })

      expect(store.remove(created.id)).toBe(true)
      expect(store.get(created.id)).toBeUndefined()
    })
  })

  describe('update', () => {
    it('should return undefined for nonexistent sandbox', () => {
      expect(store.update('nonexistent', { state: 'running' })).toBeUndefined()
    })

    it('should update sandbox fields immutably', () => {
      const created = store.create({ repo: '/tmp/repo', agent: 'claude' })
      const updated = store.update(created.id, { state: 'running', containerId: 'abc123' })

      expect(updated?.state).toBe('running')
      expect(updated?.containerId).toBe('abc123')
      expect(updated?.repo).toBe('/tmp/repo')
    })
  })

  describe('allowlist', () => {
    it('should store allowlist on update', () => {
      const sandbox = store.create({ repo: '/tmp/repo' })
      const updated = store.update(sandbox.id, { allowlist: ['example.com', 'api.github.com'] })

      expect(updated?.allowlist).toEqual(['example.com', 'api.github.com'])
    })

    it('should persist allowlist across restarts', () => {
      const sandbox = store.create({ repo: '/tmp/repo' })
      store.update(sandbox.id, { allowlist: ['example.com'] })

      const reloaded = createSandboxStore({ stateDir })
      const found = reloaded.get(sandbox.id)

      expect(found?.allowlist).toEqual(['example.com'])
    })
  })

  describe('persistence', () => {
    it('should persist state to disk on create', () => {
      store.create({ repo: '/tmp/repo', agent: 'claude' })

      const data = JSON.parse(readFileSync(join(stateDir, 'sandboxes.json'), 'utf-8'))
      expect(data).toHaveLength(1)
      expect(data[0].repo).toBe('/tmp/repo')
    })

    it('should persist state to disk on update', () => {
      const created = store.create({ repo: '/tmp/repo', agent: 'claude' })
      store.update(created.id, { state: 'running', containerId: 'ctr-1' })

      const data = JSON.parse(readFileSync(join(stateDir, 'sandboxes.json'), 'utf-8'))
      expect(data[0].state).toBe('running')
      expect(data[0].containerId).toBe('ctr-1')
    })

    it('should persist state to disk on remove', () => {
      const s1 = store.create({ repo: '/tmp/repo1' })
      store.create({ repo: '/tmp/repo2' })
      store.remove(s1.id)

      const data = JSON.parse(readFileSync(join(stateDir, 'sandboxes.json'), 'utf-8'))
      expect(data).toHaveLength(1)
      expect(data[0].repo).toBe('/tmp/repo2')
    })

    it('should survive a restart by reloading from disk', () => {
      store.create({ repo: '/tmp/repo', agent: 'claude' })
      store.create({ repo: '/tmp/repo2', agent: 'codex' })

      // Create a new store instance pointing at the same directory
      const reloaded = createSandboxStore({ stateDir })

      expect(reloaded.list()).toHaveLength(2)
      expect(
        reloaded
          .list()
          .map((s) => s.repo)
          .sort(),
      ).toEqual(['/tmp/repo', '/tmp/repo2'])
    })

    it('should start empty when state file does not exist', () => {
      const emptyDir = mkdtempSync(join(tmpdir(), 'yologuard-store-empty-'))
      const emptyStore = createSandboxStore({ stateDir: emptyDir })

      expect(emptyStore.list()).toEqual([])
      rmSync(emptyDir, { recursive: true, force: true })
    })
  })
})
