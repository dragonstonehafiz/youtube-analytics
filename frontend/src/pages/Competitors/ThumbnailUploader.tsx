import { useRef, useState, useEffect } from 'react'
import ActionButton from '../../components/ui/ActionButton'
import TextInput from '../../components/ui/TextInput'
import { getStored, setStored } from '../../utils/storage'
import type { Thumbnail } from '../../types'
import './ThumbnailUploader.css'

type ThumbnailUploaderProps = {
  onReloadThumbnails?: () => void
}

function ThumbnailUploader({ onReloadThumbnails }: ThumbnailUploaderProps) {
  const [title, setTitle] = useState(getStored('thumbnailTitle', ''))
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>(JSON.parse(getStored('thumbnails', '[]') as string))
  const [includeShorts, setIncludeShorts] = useState(getStored<boolean>('includeShorts', false))
  const [numVideosToInclude, setNumVideosToInclude] = useState(getStored('numVideosToInclude', ''))
  const [numShortsToInclude, setNumShortsToInclude] = useState(getStored('numShortsToInclude', ''))

  useEffect(() => {
    setStored('thumbnailTitle', title)
  }, [title])

  useEffect(() => {
    setStored('thumbnails', JSON.stringify(thumbnails))
  }, [thumbnails])

  useEffect(() => {
    setStored('includeShorts', includeShorts)
  }, [includeShorts])

  useEffect(() => {
    setStored('numVideosToInclude', numVideosToInclude)
  }, [numVideosToInclude])

  useEffect(() => {
    setStored('numShortsToInclude', numShortsToInclude)
  }, [numShortsToInclude])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      alert('Please upload a PNG or JPG file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB')
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      const newThumbnail = {
        id: Date.now().toString(),
        preview: result,
        fileName: file.name,
      }
      setThumbnails([...thumbnails, newThumbnail])
    }
    reader.readAsDataURL(file)
    // Clear the input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const file = e.dataTransfer.files?.[0]
    if (file && fileInputRef.current) {
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      fileInputRef.current.files = dataTransfer.files
      handleFileSelect({
        target: fileInputRef.current,
      } as React.ChangeEvent<HTMLInputElement>)
    }
  }

  const handleDeleteThumbnail = (id: string) => {
    setThumbnails(thumbnails.filter((t) => t.id !== id))
  }

  const handleClearAll = () => {
    setThumbnails([])
  }

  return (
    <div className="thumbnail-uploader">
      <div className="thumbnail-uploader-header">
        <h3>Video Title</h3>
      </div>
      <div className="thumbnail-uploader-title-row">
        <div className="thumbnail-uploader-title-input">
          <TextInput
            value={title}
            onChange={setTitle}
            placeholder="Enter video title"
          />
        </div>
        {setNumVideosToInclude && (
          <div className="thumbnail-uploader-include-input">
            <TextInput
              value={numVideosToInclude}
              onChange={setNumVideosToInclude}
              placeholder="# of videos"
            />
          </div>
        )}
        {setNumShortsToInclude && (
          <div className="thumbnail-uploader-include-input">
            <TextInput
              value={numShortsToInclude}
              onChange={setNumShortsToInclude}
              placeholder="# of shorts"
            />
          </div>
        )}
        {setIncludeShorts && (
          <label className="thumbnail-uploader-checkbox">
            <input
              type="checkbox"
              checked={includeShorts}
              onChange={(e) => setIncludeShorts(e.target.checked)}
            />
            <span>Include Shorts</span>
          </label>
        )}
        {onReloadThumbnails && (
          <ActionButton label="Reload Thumbnails" onClick={onReloadThumbnails} variant="primary" />
        )}
        {thumbnails.length > 0 && (
          <ActionButton label="Clear" onClick={handleClearAll} variant="danger" />
        )}
      </div>
      <div className="thumbnail-uploader-header">
        <h3>Upload Thumbnail</h3>
      </div>

      <div className="thumbnail-uploader-content">
        {thumbnails.length > 0 && (
          <div className="thumbnail-uploader-previews">
            {thumbnails.map((thumb) => (
              <div
                key={thumb.id}
                className="thumbnail-uploader-preview-item"
                onClick={() => handleDeleteThumbnail(thumb.id)}
              >
                <img
                  src={thumb.preview}
                  alt={thumb.fileName}
                  className="thumbnail-uploader-preview-image"
                />
              </div>
            ))}
          </div>
        )}
        <div
          className="thumbnail-uploader-drop-zone"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="thumbnail-uploader-drop-content">
            <p className="thumbnail-uploader-drop-text">Drag and drop a PNG or JPG file</p>
            <p className="thumbnail-uploader-drop-or">or</p>
            <ActionButton
              label="Browse Files"
              onClick={() => fileInputRef.current?.click()}
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      </div>
    </div>
  )
}

export default ThumbnailUploader
