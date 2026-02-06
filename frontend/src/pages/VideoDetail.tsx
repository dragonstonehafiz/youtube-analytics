import { useParams } from 'react-router-dom'
import PageCard from '../components/PageCard'
import './Page.css'

function VideoDetail() {
  const { videoId } = useParams()

  return (
    <section className="page">
      <header className="page-header">
        <h1>Video Detail</h1>
      </header>
      <div className="page-body">
        <PageCard title="Video Metadata">Video metadata</PageCard>
        <PageCard title="Daily Analytics">Daily analytics chart</PageCard>
      </div>
    </section>
  )
}

export default VideoDetail
