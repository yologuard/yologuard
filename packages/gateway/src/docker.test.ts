import { createDockerClient } from './docker.js'
import type { Logger } from '@yologuard/shared'

const createMockLogger = (): Logger =>
  ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }) as unknown as Logger

const createMockContainer = (id = 'container-123') => ({
  id,
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  inspect: vi.fn().mockResolvedValue({
    Id: id,
    State: { Status: 'running' },
    Config: { Labels: { yologuard: 'true' } },
  }),
})

const createMockDocker = () => {
  const mockContainer = createMockContainer()
  return {
    instance: {
      ping: vi.fn().mockResolvedValue('OK'),
      listContainers: vi.fn().mockResolvedValue([
        { Id: 'c1', Labels: { yologuard: 'true' } },
        { Id: 'c2', Labels: { yologuard: 'true' } },
      ]),
      createContainer: vi.fn().mockResolvedValue(mockContainer),
      getContainer: vi.fn().mockReturnValue(mockContainer),
    },
    mockContainer,
  }
}

describe('createDockerClient', () => {
  let logger: Logger

  beforeEach(() => {
    logger = createMockLogger()
  })

  describe('isDockerAvailable', () => {
    it('should return true when Docker responds to ping', async () => {
      // Given: a Docker daemon that responds to ping
      const { instance } = createMockDocker()
      const client = createDockerClient({ logger, docker: instance as never })

      // When: checking availability
      const available = await client.isDockerAvailable()

      // Then: it reports available
      expect(available).toBe(true)
      expect(instance.ping).toHaveBeenCalledOnce()
    })

    it('should return false when Docker is unreachable', async () => {
      // Given: a Docker daemon that rejects ping
      const { instance } = createMockDocker()
      instance.ping.mockRejectedValue(new Error('connect ENOENT'))
      const client = createDockerClient({ logger, docker: instance as never })

      // When: checking availability
      const available = await client.isDockerAvailable()

      // Then: it reports unavailable and logs a warning
      expect(available).toBe(false)
      expect(logger.warn).toHaveBeenCalledWith('Docker is not available')
    })
  })

  describe('listContainers', () => {
    it('should list only yologuard-labelled containers', async () => {
      // Given: a Docker daemon with yologuard containers
      const { instance } = createMockDocker()
      const client = createDockerClient({ logger, docker: instance as never })

      // When: listing containers
      const containers = await client.listContainers()

      // Then: it returns the filtered list
      expect(containers).toHaveLength(2)
      expect(instance.listContainers).toHaveBeenCalledWith({
        all: true,
        filters: { label: ['yologuard=true'] },
      })
    })

    it('should return empty array when no containers exist', async () => {
      // Given: a Docker daemon with no yologuard containers
      const { instance } = createMockDocker()
      instance.listContainers.mockResolvedValue([])
      const client = createDockerClient({ logger, docker: instance as never })

      // When: listing containers
      const containers = await client.listContainers()

      // Then: it returns an empty array
      expect(containers).toEqual([])
    })
  })

  describe('createContainer', () => {
    it('should create a container with yologuard label', async () => {
      // Given: a Docker daemon ready to create containers
      const { instance, mockContainer } = createMockDocker()
      const client = createDockerClient({ logger, docker: instance as never })

      // When: creating a container
      const container = await client.createContainer({
        image: 'node:22',
        name: 'test-sandbox',
        env: ['NODE_ENV=production'],
        binds: ['/host/path:/container/path'],
        networkMode: 'none',
      })

      // Then: it creates with merged labels and correct config
      expect(container.id).toBe(mockContainer.id)
      expect(instance.createContainer).toHaveBeenCalledWith({
        Image: 'node:22',
        name: 'test-sandbox',
        Labels: { yologuard: 'true' },
        Env: ['NODE_ENV=production'],
        HostConfig: {
          Binds: ['/host/path:/container/path'],
          NetworkMode: 'none',
        },
      })
    })

    it('should merge custom labels with yologuard label', async () => {
      // Given: custom labels provided
      const { instance } = createMockDocker()
      const client = createDockerClient({ logger, docker: instance as never })

      // When: creating a container with custom labels
      await client.createContainer({
        image: 'node:22',
        labels: { sandbox: 'abc-123' },
      })

      // Then: yologuard label is merged with custom labels
      expect(instance.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Labels: { sandbox: 'abc-123', yologuard: 'true' },
        }),
      )
    })

    it('should use defaults when optional params are omitted', async () => {
      // Given: minimal create params
      const { instance } = createMockDocker()
      const client = createDockerClient({ logger, docker: instance as never })

      // When: creating with only required params
      await client.createContainer({ image: 'alpine' })

      // Then: defaults are applied
      expect(instance.createContainer).toHaveBeenCalledWith({
        Image: 'alpine',
        name: undefined,
        Labels: { yologuard: 'true' },
        Env: [],
        HostConfig: {
          Binds: [],
          NetworkMode: undefined,
        },
      })
    })
  })

  describe('startContainer', () => {
    it('should start the specified container', async () => {
      // Given: an existing container
      const { instance, mockContainer } = createMockDocker()
      const client = createDockerClient({ logger, docker: instance as never })

      // When: starting the container
      await client.startContainer('container-123')

      // Then: it retrieves and starts the container
      expect(instance.getContainer).toHaveBeenCalledWith('container-123')
      expect(mockContainer.start).toHaveBeenCalledOnce()
    })
  })

  describe('stopContainer', () => {
    it('should stop the specified container', async () => {
      // Given: a running container
      const { instance, mockContainer } = createMockDocker()
      const client = createDockerClient({ logger, docker: instance as never })

      // When: stopping the container
      await client.stopContainer('container-123')

      // Then: it retrieves and stops the container
      expect(instance.getContainer).toHaveBeenCalledWith('container-123')
      expect(mockContainer.stop).toHaveBeenCalledOnce()
    })
  })

  describe('removeContainer', () => {
    it('should force-remove the specified container', async () => {
      // Given: a container to remove
      const { instance, mockContainer } = createMockDocker()
      const client = createDockerClient({ logger, docker: instance as never })

      // When: removing the container
      await client.removeContainer('container-123')

      // Then: it retrieves and force-removes the container
      expect(instance.getContainer).toHaveBeenCalledWith('container-123')
      expect(mockContainer.remove).toHaveBeenCalledWith({ force: true })
    })
  })

  describe('inspectContainer', () => {
    it('should return container inspection details', async () => {
      // Given: a container to inspect
      const { instance } = createMockDocker()
      const client = createDockerClient({ logger, docker: instance as never })

      // When: inspecting the container
      const info = await client.inspectContainer('container-123')

      // Then: it returns the inspection result
      expect(instance.getContainer).toHaveBeenCalledWith('container-123')
      expect(info.Id).toBe('container-123')
      expect(info.State.Status).toBe('running')
    })
  })
})
