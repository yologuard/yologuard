import { describe, it, expect, beforeEach } from 'vitest'
import { sandboxStore } from './store.js'

describe('sandboxStore', () => {
	beforeEach(() => {
		// Clean up all sandboxes between tests
		for (const s of sandboxStore.list()) {
			sandboxStore.remove(s.id)
		}
	})

	describe('create', () => {
		it('should create a sandbox with generated id and creating state', () => {
			const sandbox = sandboxStore.create({ repo: '/tmp/repo', agent: 'claude' })

			expect(sandbox.id).toBeDefined()
			expect(sandbox.repo).toBe('/tmp/repo')
			expect(sandbox.agent).toBe('claude')
			expect(sandbox.state).toBe('creating')
			expect(sandbox.createdAt).toBeDefined()
		})
	})

	describe('get', () => {
		it('should return undefined for nonexistent sandbox', () => {
			expect(sandboxStore.get('nonexistent')).toBeUndefined()
		})

		it('should return sandbox by id', () => {
			const created = sandboxStore.create({ repo: '/tmp/repo', agent: 'claude' })
			const found = sandboxStore.get(created.id)

			expect(found).toEqual(created)
		})
	})

	describe('list', () => {
		it('should return empty array when no sandboxes', () => {
			expect(sandboxStore.list()).toEqual([])
		})

		it('should return all sandboxes', () => {
			sandboxStore.create({ repo: '/tmp/repo1', agent: 'claude' })
			sandboxStore.create({ repo: '/tmp/repo2', agent: 'codex' })

			expect(sandboxStore.list()).toHaveLength(2)
		})
	})

	describe('remove', () => {
		it('should return false for nonexistent sandbox', () => {
			expect(sandboxStore.remove('nonexistent')).toBe(false)
		})

		it('should remove and return true for existing sandbox', () => {
			const created = sandboxStore.create({ repo: '/tmp/repo', agent: 'claude' })

			expect(sandboxStore.remove(created.id)).toBe(true)
			expect(sandboxStore.get(created.id)).toBeUndefined()
		})
	})

	describe('update', () => {
		it('should return undefined for nonexistent sandbox', () => {
			expect(sandboxStore.update('nonexistent', { state: 'running' })).toBeUndefined()
		})

		it('should update sandbox fields immutably', () => {
			const created = sandboxStore.create({ repo: '/tmp/repo', agent: 'claude' })
			const updated = sandboxStore.update(created.id, { state: 'running', containerId: 'abc123' })

			expect(updated?.state).toBe('running')
			expect(updated?.containerId).toBe('abc123')
			expect(updated?.repo).toBe('/tmp/repo')
		})
	})
})
