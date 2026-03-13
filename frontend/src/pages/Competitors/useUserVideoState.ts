import { useCallback, useEffect, useState } from 'react'
import { getStored, setStored } from '../../utils/storage'
import type { CompetitorVideoRow, UserVideoSelectionMode, UserVideoSource } from './types'

function readEnumValue<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): T {
  const value = getStored(key, fallback as string)
  if (typeof value === 'string' && allowed.includes(value as T)) {
    return value as T
  }
  return fallback
}

function readVideosFromStorage(): CompetitorVideoRow[] {
  const raw = getStored('userVideos', '[]')
  if (typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CompetitorVideoRow[]) : []
  } catch {
    return []
  }
}

export default function useUserVideoState() {
  const [userVideoSource, setUserVideoSource] = useState<UserVideoSource>(() =>
    readEnumValue('userVideoSource', 'uploads', ['uploads', 'playlist']),
  )
  const [userVideoPlaylist, setUserVideoPlaylist] = useState<string | null>(
    () => getStored('userVideoPlaylist', null) as string | null,
  )
  const [userVideoSelectionMode, setUserVideoSelectionMode] = useState<UserVideoSelectionMode>(() =>
    readEnumValue('userVideoSelectionMode', 'random', ['random', 'percentile']),
  )
  const [userVideoPercentileRange, setUserVideoPercentileRange] = useState<string>(
    () => getStored('userVideoPercentileRange', '0-25') as string,
  )
  const [userVideoCount, setUserVideoCount] = useState<string>(
    () => getStored('userVideoCount', '3') as string,
  )
  const [userVideos, setUserVideos] = useState<CompetitorVideoRow[]>(readVideosFromStorage)

  const handleUserVideosSelected = useCallback((videos: CompetitorVideoRow[]) => {
    setUserVideos(videos)
  }, [])

  useEffect(() => {
    setStored('userVideoSource', userVideoSource)
  }, [userVideoSource])

  useEffect(() => {
    setStored('userVideoPlaylist', userVideoPlaylist)
  }, [userVideoPlaylist])

  useEffect(() => {
    setStored('userVideoSelectionMode', userVideoSelectionMode)
  }, [userVideoSelectionMode])

  useEffect(() => {
    setStored('userVideoPercentileRange', userVideoPercentileRange)
  }, [userVideoPercentileRange])

  useEffect(() => {
    setStored('userVideoCount', userVideoCount)
  }, [userVideoCount])

  useEffect(() => {
    setStored('userVideos', userVideos)
  }, [userVideos])

  return {
    userVideoSource,
    setUserVideoSource,
    userVideoPlaylist,
    setUserVideoPlaylist,
    userVideoSelectionMode,
    setUserVideoSelectionMode,
    userVideoPercentileRange,
    setUserVideoPercentileRange,
    userVideoCount,
    setUserVideoCount,
    userVideos,
    handleUserVideosSelected,
  }
}