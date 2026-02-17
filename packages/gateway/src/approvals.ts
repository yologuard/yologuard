import type {
  ApprovalRequestType,
  ApprovalScope,
  ApprovalRequest,
  ApprovalDecision,
} from '@yologuard/shared'

type AddRequestParams = {
  readonly sandboxId: string
  readonly type: ApprovalRequestType
  readonly payload: Record<string, unknown>
  readonly reason?: string
}

type ResolveParams = {
  readonly requestId: string
  readonly approved: boolean
  readonly scope: ApprovalScope
  readonly ttlMs?: number
  readonly reason?: string
  readonly approver: string
}

type IsApprovedParams = {
  readonly sandboxId: string
  readonly type: ApprovalRequestType
  readonly payload: Record<string, unknown>
}

type StoredDecision = ApprovalDecision & {
  readonly grantedAt: number
}

const payloadMatches = ({
  stored,
  queried,
}: {
  readonly stored: Record<string, unknown>
  readonly queried: Record<string, unknown>
}): boolean => {
  for (const [key, value] of Object.entries(stored)) {
    if (queried[key] !== value) return false
  }
  return true
}

export const createApprovalStore = () => {
  const requests = new Map<string, ApprovalRequest>()
  const decisions = new Map<string, StoredDecision>()
  const requestToDecision = new Map<string, string>()

  const addRequest = (params: AddRequestParams): ApprovalRequest => {
    const request: ApprovalRequest = {
      id: crypto.randomUUID(),
      sandboxId: params.sandboxId,
      type: params.type,
      payload: params.payload,
      reason: params.reason,
      createdAt: new Date().toISOString(),
    }
    requests.set(request.id, request)
    return request
  }

  const getRequest = (requestId: string): ApprovalRequest | undefined => requests.get(requestId)

  const listPending = (sandboxId: string): ApprovalRequest[] =>
    [...requests.values()].filter((r) => r.sandboxId === sandboxId && !requestToDecision.has(r.id))

  const listAll = (sandboxId: string): ApprovalRequest[] =>
    [...requests.values()].filter((r) => r.sandboxId === sandboxId)

  const resolve = (params: ResolveParams): ApprovalDecision => {
    const request = requests.get(params.requestId)
    if (!request) {
      throw new Error(`Request ${params.requestId} not found`)
    }

    const decision: StoredDecision = {
      id: crypto.randomUUID(),
      requestId: params.requestId,
      sandboxId: request.sandboxId,
      approved: params.approved,
      scope: params.scope,
      ttlMs: params.ttlMs,
      reason: params.reason,
      approver: params.approver,
      decidedAt: new Date().toISOString(),
      grantedAt: Date.now(),
    }

    decisions.set(decision.id, decision)
    requestToDecision.set(params.requestId, decision.id)
    return decision
  }

  const isApproved = ({ sandboxId, type, payload }: IsApprovedParams): boolean => {
    const now = Date.now()

    for (const decision of decisions.values()) {
      if (decision.sandboxId !== sandboxId || !decision.approved) continue

      const request = requests.get(decision.requestId)
      if (!request || request.type !== type) continue
      if (!payloadMatches({ stored: request.payload, queried: payload })) continue

      if (decision.scope === 'once') {
        // Consumed on first check
        decisions.delete(decision.id)
        return true
      }

      if (decision.scope === 'ttl' && decision.ttlMs) {
        if (now - decision.grantedAt > decision.ttlMs) continue
        return true
      }

      if (decision.scope === 'session') {
        return true
      }
    }

    return false
  }

  const revoke = (approvalId: string): boolean => decisions.delete(approvalId)

  const getDecision = (approvalId: string): ApprovalDecision | undefined =>
    decisions.get(approvalId)

  return {
    addRequest,
    getRequest,
    listPending,
    listAll,
    resolve,
    isApproved,
    revoke,
    getDecision,
  } as const
}

export type ApprovalStore = ReturnType<typeof createApprovalStore>
