import type { Logger, ApprovalRequestType } from '@yologuard/shared'
import type { ApprovalStore } from './approvals.js'

type SocketRequest = {
	readonly type: string
	readonly sandboxId: string
	readonly payload: Record<string, unknown>
	readonly reason?: string
}

type SocketResponse = {
	readonly type: string
	readonly success: boolean
	readonly data?: Record<string, unknown>
	readonly error?: string
}

type ApprovalHandlerDeps = {
	readonly approvalStore: ApprovalStore
	readonly logger: Logger
}

const VALID_REQUEST_TYPES = new Set<string>([
	'egress.allow',
	'repo.add',
	'secret.use',
	'git.push',
	'pr.create',
])

const parseRequest = (raw: string): SocketRequest => {
	const parsed = JSON.parse(raw) as Record<string, unknown>

	if (!parsed.type || typeof parsed.type !== 'string') {
		throw new Error('Missing or invalid "type" field')
	}
	if (!parsed.sandboxId || typeof parsed.sandboxId !== 'string') {
		throw new Error('Missing or invalid "sandboxId" field')
	}

	return {
		type: parsed.type as string,
		sandboxId: parsed.sandboxId as string,
		payload: (parsed.payload ?? {}) as Record<string, unknown>,
		reason: parsed.reason as string | undefined,
	}
}

export const createApprovalHandler = ({ approvalStore, logger }: ApprovalHandlerDeps) => {
	const onRequest = (raw: string): SocketResponse => {
		try {
			const request = parseRequest(raw)

			if (!VALID_REQUEST_TYPES.has(request.type)) {
				return {
					type: 'approval_request',
					success: false,
					error: `Unknown request type: ${request.type}`,
				}
			}

			const approvalRequest = approvalStore.addRequest({
				sandboxId: request.sandboxId,
				type: request.type as ApprovalRequestType,
				payload: request.payload,
				reason: request.reason,
			})

			logger.info(
				{ requestId: approvalRequest.id, sandboxId: request.sandboxId, type: request.type },
				'Approval request created',
			)

			return {
				type: 'approval_request',
				success: true,
				data: { requestId: approvalRequest.id },
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error'
			logger.error({ err }, 'Failed to process approval request')

			return {
				type: 'approval_request',
				success: false,
				error: message,
			}
		}
	}

	return { onRequest } as const
}

export type ApprovalHandler = ReturnType<typeof createApprovalHandler>
