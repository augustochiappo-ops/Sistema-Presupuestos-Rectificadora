import React from 'react';
export interface SelectProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Current selection label. */
  label?: string;
  /** Rotates the chevron when true. */
  open?: boolean;
  icon?: React.ReactNode;
}
export function Select(props: SelectProps): JSX.Element;
