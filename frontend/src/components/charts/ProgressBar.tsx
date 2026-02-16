import './ProgressBar.css'

type ProgressBarProps = {
  label: string
  progress: number
  stepText?: string
}

function ProgressBar({ label, progress, stepText }: ProgressBarProps) {
  return (
    <div className="progress-item">
      <div className="progress-label">
        <span>{label}</span>
        <span>
          {Math.round(progress)}%
          {stepText ? ` ${stepText}` : ''}
        </span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}

export default ProgressBar
