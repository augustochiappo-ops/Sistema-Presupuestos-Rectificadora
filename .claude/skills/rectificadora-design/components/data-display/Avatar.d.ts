import React from 'react';
export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  /** Used for initials fallback and alt text. */
  name?: string;
  size?: number;
  /** Notification count shown as a small dark badge. */
  badge?: React.ReactNode;
}
export function Avatar(props: AvatarProps): JSX.Element;
