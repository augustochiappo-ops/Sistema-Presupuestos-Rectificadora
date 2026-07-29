import React from 'react';
export type StatusKind = 'pending' | 'active' | 'expired';
export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: StatusKind;
  /** Override the default label. */
  children?: React.ReactNode;
}
export function StatusBadge(props: StatusBadgeProps): JSX.Element;
