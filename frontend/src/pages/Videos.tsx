import { PageCard } from '../components/layout'
import './Page.css'

function Videos() {
  return (
    <section className="page">
      <header className="page-header">
        <h1>Videos</h1>
      </header>
      <div className="page-body">
        <PageCard title="Filters">Filters and search</PageCard>
        <PageCard title="Video Table">Video table</PageCard>
      </div>
    </section>
  )
}

export default Videos
