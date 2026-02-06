import './ActionButton.css'

type ActionButtonProps = {
  label: string
  onClick?: () => void
  disabled?: boolean
  title?: string
  variant?: 'primary' | 'soft' | 'danger'
  active?: boolean
  className?: string
  type?: 'button' | 'submit' | 'reset'
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  title,
  variant = 'soft',
  active = false,
  className,
  type = 'button',
}: ActionButtonProps) {
  const classes = [
    'action-button',
    `action-button-${variant}`,
    active ? 'action-button-active' : '',
    disabled ? 'action-button-disabled' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={classes} type={type} onClick={onClick} disabled={disabled} title={title}>
      {label}
    </button>
  )
}

export default ActionButton
