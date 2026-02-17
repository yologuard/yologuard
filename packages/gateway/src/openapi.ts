import { OpenAPIBackend } from 'openapi-backend'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const findSpecPath = (): string => {
	// Walk up from current dir until we find openapi.yaml
	let dir = __dirname
	for (let i = 0; i < 5; i++) {
		const candidate = join(dir, 'openapi.yaml')
		if (existsSync(candidate)) return candidate
		dir = resolve(dir, '..')
	}
	return join(__dirname, '..', 'openapi.yaml')
}

export const createOpenApiBackend = async (): Promise<OpenAPIBackend> => {
	const api = new OpenAPIBackend({
		definition: findSpecPath(),
		strict: true,
		validate: true,
	})

	await api.init()

	return api
}
