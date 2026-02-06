import { PageCard } from '../components/layout'
import './Page.css'

function Dashboard() {
  return (
    <section className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
      </header>
      <div className="page-body">
        <PageCard title="KPIs">
          <div className="placeholder-grid">Summary metrics placeholder</div>
        </PageCard>
        <PageCard title="Top Videos">
          <div className="placeholder-grid">Top videos placeholder</div>
        </PageCard>
        <PageCard title="Recent Trends">
          <div className="placeholder-grid">Trends placeholder</div>
        </PageCard>
      </div>
    </section>
  )
}

export default Dashboard
