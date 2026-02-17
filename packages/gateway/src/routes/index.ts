import type { OpenAPIBackend, Context } from 'openapi-backend'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { YOLOGUARD_VERSION } from '@yologuard/shared'
import { sandboxStore } from '../store.js'

const startTime = Date.now()

export const registerRoutes = (api: OpenAPIBackend) => {
	api.register({
		getHealth: async (_c: Context, _req: FastifyRequest, reply: FastifyReply) => {
			return reply.status(200).send({
				status: 'ok',
				version: YOLOGUARD_VERSION,
				uptime: (Date.now() - startTime) / 1000,
			})
		},

		createSandbox: async (c: Context, _req: FastifyRequest, reply: FastifyReply) => {
			const body = c.request.requestBody as {
				repo: string
				agent?: string
				branch?: string
				networkPolicy?: string
			}
			const sandbox = sandboxStore.create({
				repo: body.repo,
				agent: body.agent ?? 'claude',
				branch: body.branch,
				networkPolicy: body.networkPolicy ?? 'none',
			})
			return reply.status(201).send(sandbox)
		},

		listSandboxes: async (_c: Context, _req: FastifyRequest, reply: FastifyReply) => {
			return reply.status(200).send(sandboxStore.list())
		},

		getSandbox: async (c: Context, _req: FastifyRequest, reply: FastifyReply) => {
			const { sandboxId } = c.request.params as { sandboxId: string }
			const sandbox = sandboxStore.get(sandboxId)
			if (!sandbox) {
				return reply.status(404).send({ status: 404, error: 'Sandbox not found' })
			}
			return reply.status(200).send(sandbox)
		},

		deleteSandbox: async (c: Context, _req: FastifyRequest, reply: FastifyReply) => {
			const { sandboxId } = c.request.params as { sandboxId: string }
			const deleted = sandboxStore.remove(sandboxId)
			if (!deleted) {
				return reply.status(404).send({ status: 404, error: 'Sandbox not found' })
			}
			return reply.status(200).send({ message: `Sandbox ${sandboxId} destroyed` })
		},

		listApprovals: async (c: Context, _req: FastifyRequest, reply: FastifyReply) => {
			const { sandboxId } = c.request.params as { sandboxId: string }
			const sandbox = sandboxStore.get(sandboxId)
			if (!sandbox) {
				return reply.status(404).send({ status: 404, error: 'Sandbox not found' })
			}
			return reply.status(200).send([])
		},

		approveSandboxRequest: async (c: Context, _req: FastifyRequest, reply: FastifyReply) => {
			const { sandboxId } = c.request.params as { sandboxId: string }
			const sandbox = sandboxStore.get(sandboxId)
			if (!sandbox) {
				return reply.status(404).send({ status: 404, error: 'Sandbox not found' })
			}
			const body = c.request.requestBody as {
				requestId: string
				approved: boolean
				scope: string
				ttlMs?: number
				reason?: string
			}
			const decision = {
				id: crypto.randomUUID(),
				requestId: body.requestId,
				sandboxId,
				approved: body.approved,
				scope: body.scope,
				ttlMs: body.ttlMs,
				reason: body.reason,
				approver: 'cli',
				decidedAt: new Date().toISOString(),
			}
			return reply.status(200).send(decision)
		},

		validationFail: async (c: Context, _req: FastifyRequest, reply: FastifyReply) => {
			return reply.status(400).send({ status: 400, error: (c.validation.errors ?? []).map((e) => e.message).join(', ') })
		},

		notFound: async (_c: Context, _req: FastifyRequest, reply: FastifyReply) => {
			return reply.status(404).send({ status: 404, error: 'Not found' })
		},

		methodNotAllowed: async (_c: Context, _req: FastifyRequest, reply: FastifyReply) => {
			return reply.status(405).send({ status: 405, error: 'Method not allowed' })
		},
	})
}
