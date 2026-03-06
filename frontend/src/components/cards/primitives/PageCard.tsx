import './PageCard.css'

type PageCardProps = {
  title?: string | React.ReactNode
  children: React.ReactNode
}

function PageCard({ title, children }: PageCardProps) {
  return (
    <section className="page-card">
      {title ? (
        typeof title === 'string' ? (
          <h2 className="page-card-title">{title}</h2>
        ) : (
          <div className="page-card-title-content">{title}</div>
        )
      ) : null}
      <div className="page-card-body">{children}</div>
    </section>
  )
}

export default PageCard
