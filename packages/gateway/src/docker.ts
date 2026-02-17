import Dockerode from 'dockerode'
import type { Logger } from '@yologuard/shared'

const YOLOGUARD_LABEL = 'yologuard' as const
const YOLOGUARD_LABEL_VALUE = 'true' as const

export type CreateContainerParams = {
  readonly image: string
  readonly name?: string
  readonly labels?: Record<string, string>
  readonly env?: readonly string[]
  readonly binds?: readonly string[]
  readonly networkMode?: string
}

export type DockerClient = {
  readonly listContainers: () => Promise<Dockerode.ContainerInfo[]>
  readonly createContainer: (params: CreateContainerParams) => Promise<Dockerode.Container>
  readonly startContainer: (id: string) => Promise<void>
  readonly stopContainer: (id: string) => Promise<void>
  readonly removeContainer: (id: string) => Promise<void>
  readonly inspectContainer: (id: string) => Promise<Dockerode.ContainerInspectInfo>
  readonly isDockerAvailable: () => Promise<boolean>
}

type CreateDockerClientParams = {
  readonly logger: Logger
  readonly docker?: Dockerode
}

export const createDockerClient = ({
  logger,
  docker = new Dockerode(),
}: CreateDockerClientParams): DockerClient => {
  const listContainers = async (): Promise<Dockerode.ContainerInfo[]> => {
    logger.debug('Listing yologuard containers')
    const containers = await docker.listContainers({
      all: true,
      filters: { label: [`${YOLOGUARD_LABEL}=${YOLOGUARD_LABEL_VALUE}`] },
    })
    logger.debug({ count: containers.length }, 'Found yologuard containers')
    return containers
  }

  const createContainer = async ({
    image,
    name,
    labels = {},
    env = [],
    binds = [],
    networkMode,
  }: CreateContainerParams): Promise<Dockerode.Container> => {
    logger.info({ image, name, networkMode }, 'Creating container')
    const container = await docker.createContainer({
      Image: image,
      name,
      Labels: {
        ...labels,
        [YOLOGUARD_LABEL]: YOLOGUARD_LABEL_VALUE,
      },
      Env: [...env],
      HostConfig: {
        Binds: [...binds],
        NetworkMode: networkMode,
      },
    })
    logger.info({ id: container.id, image, name }, 'Container created')
    return container
  }

  const startContainer = async (id: string): Promise<void> => {
    logger.info({ id }, 'Starting container')
    const container = docker.getContainer(id)
    await container.start()
    logger.info({ id }, 'Container started')
  }

  const stopContainer = async (id: string): Promise<void> => {
    logger.info({ id }, 'Stopping container')
    const container = docker.getContainer(id)
    await container.stop()
    logger.info({ id }, 'Container stopped')
  }

  const removeContainer = async (id: string): Promise<void> => {
    logger.info({ id }, 'Removing container')
    const container = docker.getContainer(id)
    await container.remove({ force: true })
    logger.info({ id }, 'Container removed')
  }

  const inspectContainer = async (id: string): Promise<Dockerode.ContainerInspectInfo> => {
    logger.debug({ id }, 'Inspecting container')
    const container = docker.getContainer(id)
    return container.inspect()
  }

  const isDockerAvailable = async (): Promise<boolean> => {
    try {
      await docker.ping()
      return true
    } catch {
      logger.warn('Docker is not available')
      return false
    }
  }

  return {
    listContainers,
    createContainer,
    startContainer,
    stopContainer,
    removeContainer,
    inspectContainer,
    isDockerAvailable,
  } as const
}
