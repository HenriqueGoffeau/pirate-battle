import type { ComponentProps } from 'react'
import styles from './RoundButton.module.css'

export type RoundIcon =
  | 'pause'
  | 'minus'
  | 'plus'
  | 'edit'
  | 'turnLeft'
  | 'turnRight'
  | 'forward'
  | 'fireLeft'
  | 'fireFront'
  | 'fireRight'

type RoundButtonProps = Omit<ComponentProps<'button'>, 'aria-label'> & {
  icon: RoundIcon
  label: string
  size?: 'large' | 'small'
}

export function RoundButton({ icon, label, size = 'large', className, type = 'button', ...rest }: RoundButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={[styles.button, styles[size], styles[icon], className].filter(Boolean).join(' ')}
      {...rest}
    />
  )
}
