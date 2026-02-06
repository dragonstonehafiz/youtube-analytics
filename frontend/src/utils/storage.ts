type StoredValue = string | number | boolean | object | null

const STORAGE_PREFIX = 'yt-analytics:'

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
