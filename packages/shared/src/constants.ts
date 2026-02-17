export { YOLOGUARD_VERSION } from './version.js'

export const DEFAULT_GATEWAY_HOST = '127.0.0.1' as const
export const DEFAULT_GATEWAY_PORT = 4200 as const
export const DEFAULT_GATEWAY_URL = `http://${DEFAULT_GATEWAY_HOST}:${DEFAULT_GATEWAY_PORT}` as const

export const DEFAULT_CONFIG_DIR = '.yologuard' as const
export const DEFAULT_CONFIG_FILE = 'yologuard.json' as const
export const DEFAULT_AUDIT_DIR = 'audit' as const
export const DEFAULT_REPOS_DIR = 'repos' as const
export const DEFAULT_INDEX_DIR = 'index' as const

export const DEFAULT_IDLE_TIMEOUT_MS = 1_800_000 as const // 30 min
export const DEFAULT_AUDIT_MAX_SIZE_BYTES = 52_428_800 as const // 50 MB

export const SOCKET_PATH = '/yologuard/gateway.sock' as const

export const PROTECTED_BRANCHES = ['main', 'master', 'production'] as const

export const KNOWN_EXFILTRATION_DOMAINS = [
  // Paste services
  'pastebin.com',
  'paste.ee',
  'dpaste.com',
  'hastebin.com',
  'ix.io',
  'sprunge.us',
  'paste.mozilla.org',
  'ghostbin.com',
  'rentry.co',
  'controlc.com',
  // File sharing
  'file.io',
  'transfer.sh',
  '0x0.st',
  'filebin.net',
  'gofile.io',
  'temp.sh',
  'bashupload.com',
  // Tunneling / reverse proxy
  '.ngrok.io',
  '.ngrok-free.app',
  '.serveo.net',
  '.localtunnel.me',
  '.loca.lt',
  '.localhost.run',
  // Webhook services
  'webhook.site',
  'requestbin.com',
  '.pipedream.net',
  'hookbin.com',
] as const

export const DOH_ENDPOINTS = ['dns.google', 'cloudflare-dns.com', 'doh.opendns.com'] as const

export const APPROVAL_REQUEST_TYPES = [
  'egress.allow',
  'repo.add',
  'secret.use',
  'git.push',
  'pr.create',
] as const

export const SANDBOX_STATES = ['creating', 'running', 'paused', 'stopping', 'stopped'] as const

export const APPROVAL_SCOPES = ['once', 'session', 'ttl'] as const
