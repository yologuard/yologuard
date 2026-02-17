import { createApprovalStore } from './approvals.js'
import { createApprovalHandler } from './approval-handler.js'

const createMockLogger = () => ({
	info: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
	debug: vi.fn(),
	fatal: vi.fn(),
	trace: vi.fn(),
	child: vi.fn(),
	level: 'info',
})

describe('createApprovalHandler', () => {
	const setup = () => {
		const approvalStore = createApprovalStore()
		const logger = createMockLogger()
		const handler = createApprovalHandler({
			approvalStore,
			logger: logger as never,
		})
		return { approvalStore, logger, handler }
	}

	describe('onRequest', () => {
		it('should create an approval request and return request id', () => {
			const { handler, approvalStore } = setup()

			const response = handler.onRequest(
				JSON.stringify({
					type: 'egress.allow',
					sandboxId: 'sandbox-1',
					payload: { domain: 'stripe.com' },
					reason: 'need API access',
				}),
			)

			expect(response.type).toBe('approval_request')
			expect(response.success).toBe(true)
			expect(response.data?.requestId).toBeDefined()

			const pending = approvalStore.listPending('sandbox-1')
			expect(pending).toHaveLength(1)
			expect(pending[0].type).toBe('egress.allow')
			expect(pending[0].payload).toEqual({ domain: 'stripe.com' })
		})

		it('should handle request without payload', () => {
			const { handler } = setup()

			const response = handler.onRequest(
				JSON.stringify({
					type: 'git.push',
					sandboxId: 'sandbox-1',
				}),
			)

			expect(response.success).toBe(true)
			expect(response.data?.requestId).toBeDefined()
		})

		it('should reject unknown request types', () => {
			const { handler } = setup()

			const response = handler.onRequest(
				JSON.stringify({
					type: 'unknown.action',
					sandboxId: 'sandbox-1',
					payload: {},
				}),
			)

			expect(response.success).toBe(false)
			expect(response.error).toContain('Unknown request type')
		})

		it('should return error for invalid JSON', () => {
			const { handler } = setup()

			const response = handler.onRequest('not valid json')

			expect(response.success).toBe(false)
			expect(response.error).toBeDefined()
		})

		it('should return error for missing type field', () => {
			const { handler } = setup()

			const response = handler.onRequest(
				JSON.stringify({
					sandboxId: 'sandbox-1',
					payload: {},
				}),
			)

			expect(response.success).toBe(false)
			expect(response.error).toContain('type')
		})

		it('should return error for missing sandboxId', () => {
			const { handler } = setup()

			const response = handler.onRequest(
				JSON.stringify({
					type: 'egress.allow',
					payload: {},
				}),
			)

			expect(response.success).toBe(false)
			expect(response.error).toContain('sandboxId')
		})

		it('should log the request creation', () => {
			const { handler, logger } = setup()

			handler.onRequest(
				JSON.stringify({
					type: 'egress.allow',
					sandboxId: 'sandbox-1',
					payload: { domain: 'stripe.com' },
				}),
			)

			expect(logger.info).toHaveBeenCalledWith(
				expect.objectContaining({
					sandboxId: 'sandbox-1',
					type: 'egress.allow',
				}),
				'Approval request created',
			)
		})

		it('should handle all valid request types', () => {
			const { handler } = setup()
			const types = ['egress.allow', 'repo.add', 'secret.use', 'git.push', 'pr.create']

			for (const type of types) {
				const response = handler.onRequest(
					JSON.stringify({
						type,
						sandboxId: 'sandbox-1',
						payload: {},
					}),
				)
				expect(response.success).toBe(true)
			}
		})
	})
})
