import React from 'react';
export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  /** Subtitle / counter line under the title. */
  subtitle?: React.ReactNode;
  /** Right-aligned actions (buttons, search…). */
  actions?: React.ReactNode;
}
export function PageHeader(props: PageHeaderProps): JSX.Element;
