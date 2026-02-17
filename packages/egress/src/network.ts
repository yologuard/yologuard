import Dockerode from 'dockerode'
import type { Logger } from '@yologuard/shared'

const NETWORK_PREFIX = 'yologuard-' as const

let docker: Dockerode

const getDocker = (): Dockerode => {
	if (!docker) {
		docker = new Dockerode()
	}
	return docker
}

type CreateSandboxNetworkParams = {
	readonly sandboxId: string
	readonly logger: Logger
}

export const createSandboxNetwork = async ({
	sandboxId,
	logger,
}: CreateSandboxNetworkParams): Promise<Dockerode.Network> => {
	const networkName = `${NETWORK_PREFIX}${sandboxId}`
	logger.info({ sandboxId, networkName }, 'Creating sandbox network')
	const network = await getDocker().createNetwork({
		Name: networkName,
		Internal: true,
		Labels: {
			'yologuard-network': 'true',
			'yologuard-sandbox-id': sandboxId,
		},
	})
	logger.info({ sandboxId, networkName }, 'Sandbox network created')
	return network
}

type ConnectToNetworkParams = {
	readonly containerId: string
	readonly networkName: string
}

export const connectToNetwork = async ({
	containerId,
	networkName,
}: ConnectToNetworkParams): Promise<void> => {
	const network = getDocker().getNetwork(networkName)
	await network.connect({ Container: containerId })
}

type DisconnectFromNetworkParams = {
	readonly containerId: string
	readonly networkName: string
}

export const disconnectFromNetwork = async ({
	containerId,
	networkName,
}: DisconnectFromNetworkParams): Promise<void> => {
	const network = getDocker().getNetwork(networkName)
	await network.disconnect({ Container: containerId })
}

type DestroySandboxNetworkParams = {
	readonly sandboxId: string
	readonly logger: Logger
}

export const destroySandboxNetwork = async ({
	sandboxId,
	logger,
}: DestroySandboxNetworkParams): Promise<void> => {
	const networkName = `${NETWORK_PREFIX}${sandboxId}`
	logger.info({ sandboxId, networkName }, 'Destroying sandbox network')
	const network = getDocker().getNetwork(networkName)
	await network.remove()
	logger.info({ sandboxId, networkName }, 'Sandbox network destroyed')
}
