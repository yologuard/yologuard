import { loadConfig } from '@yologuard/shared'
import type { SandboxConfig, HealthResponse } from '@yologuard/shared'

type CreateSandboxParams = {
	readonly repo: string
	readonly agent?: string
	readonly branch?: string
	readonly networkPolicy?: string
}

type GatewayError = {
	readonly status: number
	readonly error: string
}

const getBaseUrl = (): string => {
	const config = loadConfig()
	return `http://${config.gateway.host}:${config.gateway.port}`
}

const request = async <T>({ method, path, body }: {
	readonly method: string
	readonly path: string
	readonly body?: unknown
}): Promise<T> => {
	const baseUrl = getBaseUrl()
	const url = `${baseUrl}${path}`

	const response = await fetch(url, {
		method,
		headers: body ? { 'Content-Type': 'application/json' } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	})

	const data = await response.json() as T | GatewayError

	if (!response.ok) {
		const err = data as GatewayError
		throw new Error(`Gateway error (${response.status}): ${err.error ?? response.statusText}`)
	}

	return data as T
}

export const listSandboxes = (): Promise<SandboxConfig[]> =>
	request<SandboxConfig[]>({ method: 'GET', path: '/sandboxes' })

export const createSandbox = (params: CreateSandboxParams): Promise<SandboxConfig> =>
	request<SandboxConfig>({ method: 'POST', path: '/sandboxes', body: params })

export const getSandbox = (id: string): Promise<SandboxConfig> =>
	request<SandboxConfig>({ method: 'GET', path: `/sandboxes/${id}` })

export const deleteSandbox = (id: string): Promise<{ message: string }> =>
	request<{ message: string }>({ method: 'DELETE', path: `/sandboxes/${id}` })

export const getHealth = (): Promise<HealthResponse> =>
	request<HealthResponse>({ method: 'GET', path: '/health' })
