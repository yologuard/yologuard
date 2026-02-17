import type {
	APPROVAL_REQUEST_TYPES,
	APPROVAL_SCOPES,
	SANDBOX_STATES,
} from './constants.js'

// --- Sandbox ---

export type SandboxState = (typeof SANDBOX_STATES)[number]

export type ResourceLimits = {
	readonly cpus?: number
	readonly memoryMb?: number
	readonly diskMb?: number
}

export type SandboxConfig = {
	readonly id: string
	readonly repo: string
	readonly agent: string
	readonly branch?: string
	readonly state: SandboxState
	readonly createdAt: string
	readonly resourceLimits?: ResourceLimits
	readonly idleTimeoutMs?: number
	readonly networkPolicy?: string
	readonly additionalRepos?: readonly RepoMount[]
}

export type RepoMount = {
	readonly url: string
	readonly access: 'read-write' | 'readonly'
	readonly sparsePaths?: readonly string[]
}

// --- Approvals ---

export type ApprovalRequestType = (typeof APPROVAL_REQUEST_TYPES)[number]
export type ApprovalScope = (typeof APPROVAL_SCOPES)[number]

export type ApprovalRequest = {
	readonly id: string
	readonly sandboxId: string
	readonly type: ApprovalRequestType
	readonly payload: Record<string, unknown>
	readonly reason?: string
	readonly createdAt: string
}

export type ApprovalDecision = {
	readonly id: string
	readonly requestId: string
	readonly sandboxId: string
	readonly approved: boolean
	readonly scope: ApprovalScope
	readonly ttlMs?: number
	readonly reason?: string
	readonly approver: string
	readonly decidedAt: string
}

// --- Audit ---

export type AuditEntryType =
	| 'approval_decision'
	| 'git_operation'
	| 'network_request'
	| 'command'
	| 'sandbox_lifecycle'

export type AuditEntry = {
	readonly id: string
	readonly sandboxId: string
	readonly type: AuditEntryType
	readonly timestamp: string
	readonly data: Record<string, unknown>
}

// --- Workspace ---

export type WorkspaceConfig = {
	readonly name: string
	readonly repos: readonly RepoMount[]
	readonly agent?: string
	readonly networkPolicy?: string
	readonly resourceLimits?: ResourceLimits
	readonly prompt?: string
}

// --- Gateway ---

export type GatewayConfig = {
	readonly host: string
	readonly port: number
}

export type HealthResponse = {
	readonly status: 'ok'
	readonly version: string
	readonly uptime: number
}
