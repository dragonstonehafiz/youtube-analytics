import './PageCard.css'

type PageCardProps = {
  title?: string
  children: React.ReactNode
}

function PageCard({ title, children }: PageCardProps) {
  return (
    <section className="page-card">
      {title ? <h2 className="page-card-title">{title}</h2> : null}
      <div className="page-card-body">{children}</div>
    </section>
  )
}

export default PageCard
