import { type ChildProcess, spawn } from 'node:child_process'
import { getHealth } from './gateway-client.js'

let managedChild: ChildProcess | undefined

const isGatewayRunning = async (): Promise<boolean> => {
  try {
    await getHealth()
    return true
  } catch {
    return false
  }
}

const killManagedChild = () => {
  if (managedChild) {
    managedChild.kill('SIGTERM')
    managedChild = undefined
  }
}

const startGateway = async (): Promise<void> => {
  process.stderr.write('Starting gateway...\n')
  const child = spawn(process.execPath, [process.argv[1], 'start'], {
    stdio: 'ignore',
  })
  child.unref()
  managedChild = child

  process.on('exit', killManagedChild)

  const maxWait = 10_000
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 500))
    if (await isGatewayRunning()) return
  }
  killManagedChild()
  throw new Error('Gateway failed to start within 10s')
}

export const ensureGateway = async (): Promise<void> => {
  if (await isGatewayRunning()) return
  await startGateway()
}
