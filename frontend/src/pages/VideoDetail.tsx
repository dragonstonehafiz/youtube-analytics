import { useMemo } from 'react'
import { useSearchParams, useParams } from 'react-router-dom'
import { ActionButton } from '../components/ui'
import { PageCard } from '../components/layout'
import './Page.css'

function VideoDetail() {
  const { videoId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = useMemo(() => {
    const tab = searchParams.get('tab')
    return tab === 'comments' ? 'comments' : 'analytics'
  }, [searchParams])

  return (
    <section className="page">
      <header className="page-header">
        <h1>Video</h1>
        <div className="analytics-range-controls">
          <ActionButton
            label="Analytics"
            onClick={() => setSearchParams({ tab: 'analytics' })}
            variant="soft"
            active={activeTab === 'analytics'}
          />
          <ActionButton
            label="Comments"
            onClick={() => setSearchParams({ tab: 'comments' })}
            variant="soft"
            active={activeTab === 'comments'}
          />
        </div>
      </header>
      <div className="page-body">
        <PageCard title="Video Metadata">
          {videoId ? `Video ID: ${videoId}` : 'Video metadata'}
        </PageCard>
        <PageCard title={activeTab === 'comments' ? 'Comments' : 'Analytics'}>
          {activeTab === 'comments' ? 'Video comments' : 'Video analytics'}
        </PageCard>
      </div>
    </section>
  )
}

export default VideoDetail
