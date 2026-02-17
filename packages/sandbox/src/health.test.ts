import {
	startHealthMonitor,
	stopHealthMonitor,
	reportActivity,
	isMonitoring,
	stopAllMonitors,
} from './health.js'

const mockLogger = {
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	fatal: vi.fn(),
	trace: vi.fn(),
	child: vi.fn(),
	level: 'info',
	silent: vi.fn(),
} as never

const createMockContainer = (overrides?: {
	Running?: boolean
	OOMKilled?: boolean
	Status?: string
}) => ({
	inspect: vi.fn().mockResolvedValue({
		State: {
			Running: overrides?.Running ?? true,
			OOMKilled: overrides?.OOMKilled ?? false,
			Status: overrides?.Status ?? 'running',
		},
	}),
})

beforeEach(() => {
	vi.clearAllMocks()
	vi.useFakeTimers()
	stopAllMonitors()
})

afterEach(() => {
	stopAllMonitors()
	vi.useRealTimers()
})

describe('startHealthMonitor', () => {
	it('starts monitoring a sandbox', () => {
		const container = createMockContainer()
		const onTimeout = vi.fn()
		const onUnhealthy = vi.fn()

		startHealthMonitor({
			sandboxId: 'test-1',
			container,
			logger: mockLogger,
			onTimeout,
			onUnhealthy,
		})

		expect(isMonitoring('test-1')).toBe(true)
	})

	it('detects healthy container', async () => {
		const container = createMockContainer()
		const onTimeout = vi.fn()
		const onUnhealthy = vi.fn()

		startHealthMonitor({
			sandboxId: 'test-1',
			container,
			logger: mockLogger,
			onTimeout,
			onUnhealthy,
		})

		await vi.advanceTimersByTimeAsync(10_000)

		expect(container.inspect).toHaveBeenCalled()
		expect(onUnhealthy).not.toHaveBeenCalled()
		expect(onTimeout).not.toHaveBeenCalled()
	})

	it('detects OOM killed container', async () => {
		const container = createMockContainer({ OOMKilled: true })
		const onTimeout = vi.fn()
		const onUnhealthy = vi.fn()

		startHealthMonitor({
			sandboxId: 'test-1',
			container,
			logger: mockLogger,
			onTimeout,
			onUnhealthy,
		})

		await vi.advanceTimersByTimeAsync(10_000)

		expect(onUnhealthy).toHaveBeenCalledWith({
			sandboxId: 'test-1',
			reason: 'OOM killed',
		})
		expect(isMonitoring('test-1')).toBe(false)
	})

	it('detects stopped container', async () => {
		const container = createMockContainer({ Running: false, Status: 'exited' })
		const onTimeout = vi.fn()
		const onUnhealthy = vi.fn()

		startHealthMonitor({
			sandboxId: 'test-1',
			container,
			logger: mockLogger,
			onTimeout,
			onUnhealthy,
		})

		await vi.advanceTimersByTimeAsync(10_000)

		expect(onUnhealthy).toHaveBeenCalledWith({
			sandboxId: 'test-1',
			reason: 'Container status: exited',
		})
	})

	it('triggers idle timeout', async () => {
		const container = createMockContainer()
		const onTimeout = vi.fn()
		const onUnhealthy = vi.fn()

		startHealthMonitor({
			sandboxId: 'test-1',
			container,
			idleTimeoutMs: 30_000,
			logger: mockLogger,
			onTimeout,
			onUnhealthy,
		})

		// Advance past idle timeout (4 health checks = 40s > 30s timeout)
		await vi.advanceTimersByTimeAsync(40_000)

		expect(onTimeout).toHaveBeenCalledWith('test-1')
		expect(isMonitoring('test-1')).toBe(false)
	})

	it('replaces existing monitor', () => {
		const container = createMockContainer()
		const onTimeout = vi.fn()
		const onUnhealthy = vi.fn()

		startHealthMonitor({
			sandboxId: 'test-1',
			container,
			logger: mockLogger,
			onTimeout,
			onUnhealthy,
		})

		startHealthMonitor({
			sandboxId: 'test-1',
			container,
			logger: mockLogger,
			onTimeout,
			onUnhealthy,
		})

		expect(isMonitoring('test-1')).toBe(true)
	})
})

describe('reportActivity', () => {
	it('resets idle timer', async () => {
		const container = createMockContainer()
		const onTimeout = vi.fn()
		const onUnhealthy = vi.fn()

		startHealthMonitor({
			sandboxId: 'test-1',
			container,
			idleTimeoutMs: 30_000,
			logger: mockLogger,
			onTimeout,
			onUnhealthy,
		})

		// Advance 20s (within timeout)
		await vi.advanceTimersByTimeAsync(20_000)
		expect(onTimeout).not.toHaveBeenCalled()

		// Report activity to reset timer
		reportActivity('test-1')

		// Advance another 20s (within new timeout window)
		await vi.advanceTimersByTimeAsync(20_000)
		expect(onTimeout).not.toHaveBeenCalled()

		// Advance past timeout from last activity
		await vi.advanceTimersByTimeAsync(20_000)
		expect(onTimeout).toHaveBeenCalledWith('test-1')
	})

	it('does nothing for non-existent sandbox', () => {
		// Should not throw
		reportActivity('non-existent')
	})
})

describe('stopHealthMonitor', () => {
	it('stops monitoring a sandbox', () => {
		const container = createMockContainer()

		startHealthMonitor({
			sandboxId: 'test-1',
			container,
			logger: mockLogger,
			onTimeout: vi.fn(),
			onUnhealthy: vi.fn(),
		})

		expect(isMonitoring('test-1')).toBe(true)

		stopHealthMonitor('test-1')

		expect(isMonitoring('test-1')).toBe(false)
	})

	it('handles non-existent sandbox gracefully', () => {
		stopHealthMonitor('non-existent')
		expect(isMonitoring('non-existent')).toBe(false)
	})
})

describe('stopAllMonitors', () => {
	it('stops all active monitors', () => {
		const container = createMockContainer()
		const params = {
			container,
			logger: mockLogger,
			onTimeout: vi.fn(),
			onUnhealthy: vi.fn(),
		}

		startHealthMonitor({ ...params, sandboxId: 'test-1' })
		startHealthMonitor({ ...params, sandboxId: 'test-2' })

		expect(isMonitoring('test-1')).toBe(true)
		expect(isMonitoring('test-2')).toBe(true)

		stopAllMonitors()

		expect(isMonitoring('test-1')).toBe(false)
		expect(isMonitoring('test-2')).toBe(false)
	})
})

describe('health check error handling', () => {
	it('handles inspect failure gracefully', async () => {
		const container = {
			inspect: vi.fn().mockRejectedValue(new Error('Docker connection lost')),
		}
		const onTimeout = vi.fn()
		const onUnhealthy = vi.fn()

		startHealthMonitor({
			sandboxId: 'test-1',
			container,
			logger: mockLogger,
			onTimeout,
			onUnhealthy,
		})

		await vi.advanceTimersByTimeAsync(10_000)

		// Should not crash, just log the error
		expect(onUnhealthy).not.toHaveBeenCalled()
		expect(isMonitoring('test-1')).toBe(true)
	})
})
