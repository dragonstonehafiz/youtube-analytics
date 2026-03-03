import { useEffect, useState } from 'react'

export function useHideMonetaryValues(): boolean {
  const [hideMonetaryValues, setHideMonetaryValues] = useState(() => {
    const stored = localStorage.getItem('hideMonetaryValues')
    return stored ? JSON.parse(stored) : false
  })

  useEffect(() => {
    const handleStorageChange = () => {
      const stored = localStorage.getItem('hideMonetaryValues')
      setHideMonetaryValues(stored ? JSON.parse(stored) : false)
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return hideMonetaryValues
}

export function useHideVideoTitles(): boolean {
  const [hideVideoTitles, setHideVideoTitles] = useState(() => {
    const stored = localStorage.getItem('hideVideoTitles')
    return stored ? JSON.parse(stored) : false
  })

  useEffect(() => {
    const handleStorageChange = () => {
      const stored = localStorage.getItem('hideVideoTitles')
      setHideVideoTitles(stored ? JSON.parse(stored) : false)
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return hideVideoTitles
}

export function useHideVideoThumbnails(): boolean {
  const [hideVideoThumbnails, setHideVideoThumbnails] = useState(() => {
    const stored = localStorage.getItem('hideVideoThumbnails')
    return stored ? JSON.parse(stored) : false
  })

  useEffect(() => {
    const handleStorageChange = () => {
      const stored = localStorage.getItem('hideVideoThumbnails')
      setHideVideoThumbnails(stored ? JSON.parse(stored) : false)
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return hideVideoThumbnails
}

export function useHideDescription(): boolean {
  const [hideDescription, setHideDescription] = useState(() => {
    const stored = localStorage.getItem('hideDescription')
    return stored ? JSON.parse(stored) : false
  })

  useEffect(() => {
    const handleStorageChange = () => {
      const stored = localStorage.getItem('hideDescription')
      setHideDescription(stored ? JSON.parse(stored) : false)
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return hideDescription
}
