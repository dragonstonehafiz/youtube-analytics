import type { Thumbnail } from '@types'

// IndexedDB storage for thumbnail test tool uploads (Competitors > Thumbnail Test tabs)
// NOT for actual video thumbnails — only for temporary test images
const DB_NAME = 'yt-analytics'
const STORE_NAME = 'test-thumbnails'

let dbInstance: IDBDatabase | null = null

async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onerror = () => {
      reject(request.error)
    }

    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

export async function saveThumbnails(thumbnails: Thumbnail[]): Promise<void> {
  try {
    const db = await initDB()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    // Clear old data
    store.clear()

    // Save new thumbnails
    return new Promise((resolve, reject) => {
      const request = store.put(thumbnails, 'thumbnails')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  } catch (error) {
    console.error('Failed to save thumbnails to IndexedDB', error)
  }
}

export async function loadThumbnails(): Promise<Thumbnail[]> {
  try {
    const db = await initDB()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)

    return new Promise((resolve, reject) => {
      const request = store.get('thumbnails')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const result = request.result as Thumbnail[] | undefined
        resolve(result || [])
      }
    })
  } catch (error) {
    console.error('Failed to load thumbnails from IndexedDB', error)
    return []
  }
}
