import { createGateway } from '@yologuard/gateway'
import { createLogger, loadConfig } from '@yologuard/shared'

export const start = async () => {
	const logger = createLogger({ name: 'cli' })
	const config = loadConfig()

	const gateway = await createGateway({
		config: { host: config.gateway.host, port: config.gateway.port },
	})

	const shutdown = async () => {
		logger.info('Received shutdown signal')
		await gateway.stop()
		process.exit(0)
	}

	process.on('SIGTERM', shutdown)
	process.on('SIGINT', shutdown)

	await gateway.start()

	const url = `http://${config.gateway.host}:${config.gateway.port}`
	logger.info({ url }, 'YoloGuard gateway listening')
}
