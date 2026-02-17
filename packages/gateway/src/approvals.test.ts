import { createApprovalStore } from './approvals.js'

describe('createApprovalStore', () => {
  const createStore = () => createApprovalStore()

  describe('addRequest', () => {
    it('should create a pending request with generated id', () => {
      const store = createStore()

      const request = store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'egress.allow',
        payload: { domain: 'stripe.com' },
        reason: 'need API access',
      })

      expect(request.id).toBeDefined()
      expect(request.sandboxId).toBe('sandbox-1')
      expect(request.type).toBe('egress.allow')
      expect(request.payload).toEqual({ domain: 'stripe.com' })
      expect(request.reason).toBe('need API access')
      expect(request.createdAt).toBeDefined()
    })
  })

  describe('getRequest', () => {
    it('should return undefined for nonexistent request', () => {
      const store = createStore()
      expect(store.getRequest('nonexistent')).toBeUndefined()
    })

    it('should return request by id', () => {
      const store = createStore()
      const created = store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'egress.allow',
        payload: { domain: 'stripe.com' },
      })

      expect(store.getRequest(created.id)).toEqual(created)
    })
  })

  describe('listPending', () => {
    it('should return only unresolved requests for a sandbox', () => {
      const store = createStore()

      const req1 = store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'egress.allow',
        payload: { domain: 'stripe.com' },
      })
      store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'git.push',
        payload: { branch: 'feature' },
      })
      store.addRequest({
        sandboxId: 'sandbox-2',
        type: 'egress.allow',
        payload: { domain: 'npm.org' },
      })

      // Resolve one request
      store.resolve({
        requestId: req1.id,
        approved: true,
        scope: 'session',
        approver: 'cli',
      })

      const pending = store.listPending('sandbox-1')
      expect(pending).toHaveLength(1)
      expect(pending[0].type).toBe('git.push')
    })

    it('should return empty for sandbox with no requests', () => {
      const store = createStore()
      expect(store.listPending('sandbox-1')).toEqual([])
    })
  })

  describe('listAll', () => {
    it('should return all requests including resolved', () => {
      const store = createStore()

      const req1 = store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'egress.allow',
        payload: { domain: 'stripe.com' },
      })
      store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'git.push',
        payload: { branch: 'feature' },
      })

      store.resolve({
        requestId: req1.id,
        approved: true,
        scope: 'session',
        approver: 'cli',
      })

      expect(store.listAll('sandbox-1')).toHaveLength(2)
    })
  })

  describe('resolve', () => {
    it('should create a decision for a pending request', () => {
      const store = createStore()

      const request = store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'egress.allow',
        payload: { domain: 'stripe.com' },
      })

      const decision = store.resolve({
        requestId: request.id,
        approved: true,
        scope: 'session',
        approver: 'cli',
        reason: 'looks safe',
      })

      expect(decision.id).toBeDefined()
      expect(decision.requestId).toBe(request.id)
      expect(decision.sandboxId).toBe('sandbox-1')
      expect(decision.approved).toBe(true)
      expect(decision.scope).toBe('session')
      expect(decision.approver).toBe('cli')
      expect(decision.reason).toBe('looks safe')
      expect(decision.decidedAt).toBeDefined()
    })

    it('should throw for nonexistent request', () => {
      const store = createStore()

      expect(() =>
        store.resolve({
          requestId: 'nonexistent',
          approved: true,
          scope: 'session',
          approver: 'cli',
        }),
      ).toThrow('Request nonexistent not found')
    })

    it('should create a denial decision', () => {
      const store = createStore()

      const request = store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'git.push',
        payload: { branch: 'main' },
      })

      const decision = store.resolve({
        requestId: request.id,
        approved: false,
        scope: 'once',
        approver: 'cli',
        reason: 'protected branch',
      })

      expect(decision.approved).toBe(false)
    })
  })

  describe('isApproved', () => {
    it('should return false when no matching approval exists', () => {
      const store = createStore()

      expect(
        store.isApproved({
          sandboxId: 'sandbox-1',
          type: 'egress.allow',
          payload: { domain: 'stripe.com' },
        }),
      ).toBe(false)
    })

    it('should return true for session-scoped approval', () => {
      const store = createStore()

      const request = store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'egress.allow',
        payload: { domain: 'stripe.com' },
      })

      store.resolve({
        requestId: request.id,
        approved: true,
        scope: 'session',
        approver: 'cli',
      })

      expect(
        store.isApproved({
          sandboxId: 'sandbox-1',
          type: 'egress.allow',
          payload: { domain: 'stripe.com' },
        }),
      ).toBe(true)

      // Session approval persists across multiple checks
      expect(
        store.isApproved({
          sandboxId: 'sandbox-1',
          type: 'egress.allow',
          payload: { domain: 'stripe.com' },
        }),
      ).toBe(true)
    })

    it('should consume once-scoped approval on first check', () => {
      const store = createStore()

      const request = store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'egress.allow',
        payload: { domain: 'stripe.com' },
      })

      store.resolve({
        requestId: request.id,
        approved: true,
        scope: 'once',
        approver: 'cli',
      })

      // First check consumes the approval
      expect(
        store.isApproved({
          sandboxId: 'sandbox-1',
          type: 'egress.allow',
          payload: { domain: 'stripe.com' },
        }),
      ).toBe(true)

      // Second check finds no valid approval
      expect(
        store.isApproved({
          sandboxId: 'sandbox-1',
          type: 'egress.allow',
          payload: { domain: 'stripe.com' },
        }),
      ).toBe(false)
    })

    it('should respect TTL expiry', () => {
      const store = createStore()

      const request = store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'egress.allow',
        payload: { domain: 'stripe.com' },
      })

      store.resolve({
        requestId: request.id,
        approved: true,
        scope: 'ttl',
        ttlMs: 100,
        approver: 'cli',
      })

      // Valid immediately
      expect(
        store.isApproved({
          sandboxId: 'sandbox-1',
          type: 'egress.allow',
          payload: { domain: 'stripe.com' },
        }),
      ).toBe(true)
    })

    it('should expire TTL approval after time passes', async () => {
      const store = createStore()

      const request = store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'egress.allow',
        payload: { domain: 'stripe.com' },
      })

      store.resolve({
        requestId: request.id,
        approved: true,
        scope: 'ttl',
        ttlMs: 50,
        approver: 'cli',
      })

      await new Promise((resolve) => setTimeout(resolve, 60))

      expect(
        store.isApproved({
          sandboxId: 'sandbox-1',
          type: 'egress.allow',
          payload: { domain: 'stripe.com' },
        }),
      ).toBe(false)
    })

    it('should not match different sandbox', () => {
      const store = createStore()

      const request = store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'egress.allow',
        payload: { domain: 'stripe.com' },
      })

      store.resolve({
        requestId: request.id,
        approved: true,
        scope: 'session',
        approver: 'cli',
      })

      expect(
        store.isApproved({
          sandboxId: 'sandbox-2',
          type: 'egress.allow',
          payload: { domain: 'stripe.com' },
        }),
      ).toBe(false)
    })

    it('should not match different request type', () => {
      const store = createStore()

      const request = store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'egress.allow',
        payload: { domain: 'stripe.com' },
      })

      store.resolve({
        requestId: request.id,
        approved: true,
        scope: 'session',
        approver: 'cli',
      })

      expect(
        store.isApproved({
          sandboxId: 'sandbox-1',
          type: 'git.push',
          payload: { domain: 'stripe.com' },
        }),
      ).toBe(false)
    })

    it('should not match different payload', () => {
      const store = createStore()

      const request = store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'egress.allow',
        payload: { domain: 'stripe.com' },
      })

      store.resolve({
        requestId: request.id,
        approved: true,
        scope: 'session',
        approver: 'cli',
      })

      expect(
        store.isApproved({
          sandboxId: 'sandbox-1',
          type: 'egress.allow',
          payload: { domain: 'github.com' },
        }),
      ).toBe(false)
    })

    it('should not approve when decision was a denial', () => {
      const store = createStore()

      const request = store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'egress.allow',
        payload: { domain: 'pastebin.com' },
      })

      store.resolve({
        requestId: request.id,
        approved: false,
        scope: 'session',
        approver: 'cli',
      })

      expect(
        store.isApproved({
          sandboxId: 'sandbox-1',
          type: 'egress.allow',
          payload: { domain: 'pastebin.com' },
        }),
      ).toBe(false)
    })
  })

  describe('revoke', () => {
    it('should remove a decision', () => {
      const store = createStore()

      const request = store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'egress.allow',
        payload: { domain: 'stripe.com' },
      })

      const decision = store.resolve({
        requestId: request.id,
        approved: true,
        scope: 'session',
        approver: 'cli',
      })

      expect(store.revoke(decision.id)).toBe(true)
      expect(
        store.isApproved({
          sandboxId: 'sandbox-1',
          type: 'egress.allow',
          payload: { domain: 'stripe.com' },
        }),
      ).toBe(false)
    })

    it('should return false for nonexistent approval', () => {
      const store = createStore()
      expect(store.revoke('nonexistent')).toBe(false)
    })
  })

  describe('getDecision', () => {
    it('should return decision by id', () => {
      const store = createStore()

      const request = store.addRequest({
        sandboxId: 'sandbox-1',
        type: 'egress.allow',
        payload: { domain: 'stripe.com' },
      })

      const decision = store.resolve({
        requestId: request.id,
        approved: true,
        scope: 'session',
        approver: 'cli',
      })

      const found = store.getDecision(decision.id)
      expect(found?.id).toBe(decision.id)
      expect(found?.approved).toBe(true)
    })

    it('should return undefined for nonexistent decision', () => {
      const store = createStore()
      expect(store.getDecision('nonexistent')).toBeUndefined()
    })
  })
})
