import React from 'react';
export interface ListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Leading avatar/logo node. */
  leading?: React.ReactNode;
  title?: React.ReactNode;
  /** Secondary line (timestamp, subtitle). */
  meta?: React.ReactNode;
  /** Trailing slot (badge, menu button…). */
  trailing?: React.ReactNode;
}
export function ListItem(props: ListItemProps): JSX.Element;
