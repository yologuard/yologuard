import Dockerode from 'dockerode'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Logger } from '@yologuard/shared'
import { generateSquidConfig } from './squid-config.js'

const DEFAULT_SQUID_IMAGE = 'ubuntu/squid:latest' as const
const SIDECAR_LABEL = 'yologuard-sidecar' as const
const SANDBOX_ID_LABEL = 'yologuard-sandbox-id' as const

let docker: Dockerode

const getDocker = (): Dockerode => {
	if (!docker) {
		docker = new Dockerode()
	}
	return docker
}

const containerName = (sandboxId: string) => `yologuard-squid-${sandboxId}`

const writeSquidConf = async ({
	allowlist,
	blocklist,
}: {
	readonly allowlist: readonly string[]
	readonly blocklist?: readonly string[]
}): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), 'yologuard-squid-'))
	const confPath = join(dir, 'squid.conf')
	await writeFile(confPath, generateSquidConfig({ allowlist, blocklist }))
	return confPath
}

type CreateSidecarParams = {
	readonly sandboxId: string
	readonly networkName: string
	readonly allowlist: readonly string[]
	readonly blocklist?: readonly string[]
	readonly squidImage?: string
	readonly logger: Logger
}

export const createSidecar = async ({
	sandboxId,
	networkName,
	allowlist,
	blocklist,
	squidImage = DEFAULT_SQUID_IMAGE,
	logger,
}: CreateSidecarParams): Promise<Dockerode.Container> => {
	const confPath = await writeSquidConf({ allowlist, blocklist })
	const name = containerName(sandboxId)

	logger.info({ sandboxId, name, squidImage, networkName }, 'Creating squid sidecar')

	const container = await getDocker().createContainer({
		Image: squidImage,
		name,
		Labels: {
			[SIDECAR_LABEL]: 'true',
			[SANDBOX_ID_LABEL]: sandboxId,
		},
		HostConfig: {
			Binds: [`${confPath}:/etc/squid/squid.conf:ro`],
			NetworkMode: networkName,
		},
	})

	await container.start()
	logger.info({ sandboxId, containerId: container.id }, 'Squid sidecar started')
	return container
}

type DestroySidecarParams = {
	readonly sandboxId: string
	readonly logger: Logger
}

export const destroySidecar = async ({
	sandboxId,
	logger,
}: DestroySidecarParams): Promise<void> => {
	const name = containerName(sandboxId)
	logger.info({ sandboxId, name }, 'Destroying squid sidecar')

	const container = getDocker().getContainer(name)
	try {
		await container.stop()
	} catch {
		// container may already be stopped
	}
	await container.remove({ force: true })
	logger.info({ sandboxId, name }, 'Squid sidecar destroyed')
}

type UpdateAllowlistParams = {
	readonly sandboxId: string
	readonly allowlist: readonly string[]
	readonly logger: Logger
}

export const updateAllowlist = async ({
	sandboxId,
	allowlist,
	logger,
}: UpdateAllowlistParams): Promise<void> => {
	const name = containerName(sandboxId)
	logger.info({ sandboxId, allowlist }, 'Updating squid allowlist')

	const confPath = await writeSquidConf({ allowlist })
	const container = getDocker().getContainer(name)

	// Copy new config and signal squid to reconfigure
	const exec = await container.exec({
		Cmd: ['squid', '-k', 'reconfigure'],
		AttachStdout: false,
		AttachStderr: false,
	})
	await exec.start({ Detach: true })

	logger.info({ sandboxId }, 'Squid allowlist updated')
}
