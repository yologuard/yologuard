import type { Logger, ApprovalRequestType, ApprovalDecision } from '@yologuard/shared'
import type { ApprovalStore } from './approvals.js'

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

export const createApprovalHandler = ({ approvalStore, logger }: ApprovalHandlerDeps) => {
  const pendingWaiters = new Map<string, (decision: ApprovalDecision) => void>()

  const onRequest = (raw: string): SocketResponse => {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {
        type: 'error',
        success: false,
        error: 'Invalid JSON',
      }
    }

    const { type, sandboxId, payload, reason } = parsed as {
      type?: string
      sandboxId?: string
      payload?: Record<string, unknown>
      reason?: string
    }

    if (!type) {
      return {
        type: 'error',
        success: false,
        error: 'Missing required field: type',
      }
    }

    if (!sandboxId) {
      return {
        type: 'error',
        success: false,
        error: 'Missing required field: sandboxId',
      }
    }

    if (!VALID_REQUEST_TYPES.has(type)) {
      return {
        type: 'approval_response',
        success: false,
        error: `Unknown request type: ${type}`,
      }
    }

    const approvalRequest = approvalStore.addRequest({
      sandboxId,
      type: type as ApprovalRequestType,
      payload: payload ?? {},
      reason,
    })

    logger.info({ requestId: approvalRequest.id, sandboxId, type }, 'Approval request created')

    return {
      type: 'approval_request',
      success: true,
      data: {
        requestId: approvalRequest.id,
        sandboxId,
        type,
      } as Record<string, unknown>,
    }
  }

  const waitForDecision = (requestId: string): Promise<ApprovalDecision> =>
    new Promise<ApprovalDecision>((resolve) => {
      pendingWaiters.set(requestId, resolve)
    })

  const notifyDecision = ({
    requestId,
    decision,
  }: {
    readonly requestId: string
    readonly decision: ApprovalDecision
  }) => {
    const waiter = pendingWaiters.get(requestId)
    if (waiter) {
      waiter(decision)
      pendingWaiters.delete(requestId)
    }
  }

  const hasPendingWaiter = (requestId: string): boolean => pendingWaiters.has(requestId)

  return { onRequest, waitForDecision, notifyDecision, hasPendingWaiter } as const
}

export type ApprovalHandler = ReturnType<typeof createApprovalHandler>
