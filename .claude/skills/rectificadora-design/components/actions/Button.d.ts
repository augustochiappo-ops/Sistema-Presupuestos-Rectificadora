import React from 'react';
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. primary = solid black, secondary = white outline, ghost = text only, success = green create action. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg';
  /** Element rendered before the label (usually an icon). */
  iconLeft?: React.ReactNode;
  /** Element rendered after the label. */
  iconRight?: React.ReactNode;
  disabled?: boolean;
  fullWidth?: boolean;
  children?: React.ReactNode;
}
/**
 * Primary action button.
 * @startingPoint section="Actions" subtitle="Black / outline / green buttons" viewport="700x150"
 */
export function Button(props: ButtonProps): JSX.Element;
