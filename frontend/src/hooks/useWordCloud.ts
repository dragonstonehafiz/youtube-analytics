import { useEffect, useState } from 'react'

export type WordType = 'noun' | 'verb' | 'proper_noun' | 'adjective' | 'adverb'

export const WORD_TYPE_OPTIONS: Array<{ label: string; value: WordType }> = [
  { label: 'Nouns', value: 'noun' },
  { label: 'Verbs', value: 'verb' },
  { label: 'Proper nouns', value: 'proper_noun' },
  { label: 'Adjectives', value: 'adjective' },
  { label: 'Adverbs', value: 'adverb' },
]

export const DEFAULT_WORD_TYPES: WordType[] = ['noun', 'verb', 'proper_noun', 'adjective', 'adverb']

/**
 * Manages word-cloud generation state: word type selection, the generated image
 * object URL, loading/error state, and the async `generateWordCloud(params)` action.
 *
 * The caller is responsible for building the URLSearchParams (scope + filter params).
 * This hook appends `word_types` from its own state before fetching.
 */
export function useWordCloud(initialWordTypes: WordType[] = DEFAULT_WORD_TYPES) {
  const [wordTypes, setWordTypes] = useState<WordType[]>(initialWordTypes)
  const [wordCloudImageUrl, setWordCloudImageUrl] = useState('')
  const [wordCloudLoading, setWordCloudLoading] = useState(false)
  const [wordCloudError, setWordCloudError] = useState<string | null>(null)

  // Revoke the object URL when it changes to avoid memory leaks
  useEffect(() => {
    return () => {
      if (wordCloudImageUrl) {
        URL.revokeObjectURL(wordCloudImageUrl)
      }
    }
  }, [wordCloudImageUrl])

  /**
   * Fetches a word-cloud PNG from the backend.
   * @param params - URLSearchParams containing scope (video_id / playlist_id) and
   *   filter params (q, published_after, published_before, max_words, min_count).
   *   `word_types` is appended automatically from the hook's `wordTypes` state.
   */
  const generateWordCloud = async (params: URLSearchParams) => {
    setWordCloudLoading(true)
    setWordCloudError(null)
    try {
      if (wordTypes.length > 0) {
        params.set('word_types', wordTypes.join(','))
      }
      const response = await fetch(`http://localhost:8000/comments/word-cloud/image?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`Failed to build word cloud (${response.status})`)
      }
      const blob = await response.blob()
      const nextObjectUrl = URL.createObjectURL(blob)
      setWordCloudImageUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl)
        }
        return nextObjectUrl
      })
    } catch (err) {
      setWordCloudImageUrl('')
      setWordCloudError(err instanceof Error ? err.message : 'Failed to build word cloud.')
    } finally {
      setWordCloudLoading(false)
    }
  }

  return {
    wordTypes,
    setWordTypes,
    wordCloudImageUrl,
    wordCloudLoading,
    wordCloudError,
    generateWordCloud,
  }
}
