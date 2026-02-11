type StoredValue = string | number | boolean | object | null

const STORAGE_PREFIX = 'yt-analytics:'
const SHARED_PAGE_SIZE_KEY = 'sharedPageSize'

function buildKey(key: string) {
  return `${STORAGE_PREFIX}${key}`
}

export function setStored<T extends StoredValue>(key: string, value: T) {
  try {
    localStorage.setItem(buildKey(key), JSON.stringify(value))
  } catch {
    // Ignore storage write errors.
  }
}

export function getStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(buildKey(key))
    if (!raw) {
      return fallback
    }
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function removeStored(key: string) {
  try {
    localStorage.removeItem(buildKey(key))
  } catch {
    // Ignore storage removal errors.
  }
}

export function getSharedPageSize(fallback = 10): number {
  const value = getStored<number>(SHARED_PAGE_SIZE_KEY, fallback)
  if (!Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return Math.floor(value)
}

export function setSharedPageSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return
  }
  setStored<number>(SHARED_PAGE_SIZE_KEY, Math.floor(value))
}
