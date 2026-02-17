import Dockerode from 'dockerode'
import { writeFile, mkdtemp } from 'node:fs/promises'
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

	// Auto-pull image if not available locally
	try {
		await getDocker().getImage(squidImage).inspect()
	} catch {
		logger.info({ squidImage }, 'Pulling squid image...')
		const stream = await getDocker().pull(squidImage)
		await new Promise<void>((resolve, reject) => {
			getDocker().modem.followProgress(stream, (err: Error | null) =>
				err ? reject(err) : resolve(),
			)
		})
		logger.info({ squidImage }, 'Squid image pulled')
	}

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

	// Connect sidecar to the default bridge network for external internet + DNS access.
	// The sidecar is already on the internal network (for sandbox communication) — adding
	// bridge gives it the outbound connectivity needed to proxy allowed requests.
	const bridge = getDocker().getNetwork('bridge')
	await bridge.connect({ Container: container.id })

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

	const container = getDocker().getContainer(name)

	// Find the host-side path of the bind-mounted squid.conf
	const info = await container.inspect()
	const bind = (info.HostConfig?.Binds ?? []).find((b: string) =>
		b.includes('/etc/squid/squid.conf'),
	)
	if (!bind) {
		throw new Error(`No squid.conf bind mount found on sidecar ${name}`)
	}
	const hostPath = bind.split(':')[0]

	// Overwrite the host file — bind mount makes it visible inside the container
	await writeFile(hostPath, generateSquidConfig({ allowlist }))

	// Signal squid to reload config
	const exec = await container.exec({
		Cmd: ['squid', '-k', 'reconfigure'],
		AttachStdout: false,
		AttachStderr: false,
	})
	await exec.start({ Detach: true })

	logger.info({ sandboxId }, 'Squid allowlist updated')
}
