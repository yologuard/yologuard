const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /gho_[A-Za-z0-9]{36}/g,
  /github_pat_[A-Za-z0-9_]{82}/g,
  /sk-[A-Za-z0-9]{48,}/g,
  /AKIA[A-Z0-9]{16}/g,
  /[A-Za-z0-9+/]{40,}={0,2}/g,
] as const

const REDACTED = '[REDACTED]'

export const redactSecrets = (text: string): string => {
  let result = text
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(new RegExp(pattern.source, pattern.flags), REDACTED)
  }
  return result
}
