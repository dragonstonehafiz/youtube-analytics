import PageCard from '../components/PageCard'
import './Page.css'

function SyncSettings() {
  return (
    <section className="page">
      <header className="page-header">
        <h1>Sync & Settings</h1>
      </header>
      <div className="page-body">
        <PageCard title="Sync Controls">Sync controls</PageCard>
        <PageCard title="Last Sync">Last sync status</PageCard>
      </div>
    </section>
  )
}

export default SyncSettings
