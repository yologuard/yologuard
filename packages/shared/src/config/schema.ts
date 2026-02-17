import { z } from 'zod'
import {
	DEFAULT_AUDIT_MAX_SIZE_BYTES,
	DEFAULT_GATEWAY_HOST,
	DEFAULT_GATEWAY_PORT,
	DEFAULT_IDLE_TIMEOUT_MS,
} from '../constants.js'

const repoMountSchema = z.object({
	url: z.string().min(1),
	access: z.enum(['read-write', 'readonly']).default('read-write'),
	sparsePaths: z.array(z.string()).optional(),
})

const resourceLimitsSchema = z.object({
	cpus: z.number().positive().optional(),
	memoryMb: z.number().positive().optional(),
	diskMb: z.number().positive().optional(),
})

const gatewaySchema = z.object({
	host: z.string().default(DEFAULT_GATEWAY_HOST),
	port: z.number().int().min(1).max(65535).default(DEFAULT_GATEWAY_PORT),
})

const sandboxDefaultsSchema = z.object({
	agent: z.string().default('claude'),
	idleTimeoutMs: z.number().int().positive().default(DEFAULT_IDLE_TIMEOUT_MS),
	networkPolicy: z.string().default('none'),
	resourceLimits: resourceLimitsSchema.optional(),
})

const auditSchema = z.object({
	maxSizeBytes: z.number().int().positive().default(DEFAULT_AUDIT_MAX_SIZE_BYTES),
})

const workspaceSchema = z.object({
	name: z.string().min(1),
	repos: z.array(repoMountSchema).min(1),
	agent: z.string().optional(),
	networkPolicy: z.string().optional(),
	resourceLimits: resourceLimitsSchema.optional(),
	prompt: z.string().optional(),
})

export const yologuardConfigSchema = z.object({
	gateway: gatewaySchema.default({}),
	sandbox: sandboxDefaultsSchema.default({}),
	audit: auditSchema.default({}),
	workspaces: z.record(z.string(), workspaceSchema).default({}),
	egressAllowlist: z.array(z.string()).default([]),
	egressBlocklist: z.array(z.string()).default([]),
	protectedBranches: z.array(z.string()).default(['main', 'master', 'production']),
	branchPrefix: z.string().default('yologuard/'),
})

export type YologuardConfig = z.infer<typeof yologuardConfigSchema>
