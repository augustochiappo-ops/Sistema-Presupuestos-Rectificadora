import React from 'react';
export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  value?: React.ReactNode;
  label?: React.ReactNode;
  /** Inverts to the solid-black highlighted treatment. */
  active?: boolean;
  /** Small corner element (e.g. an arrow glyph). */
  corner?: React.ReactNode;
}
/**
 * Quick-stat metric card.
 * @startingPoint section="Data display" subtitle="Metric stat cards" viewport="700x180"
 */
export function StatCard(props: StatCardProps): JSX.Element;
