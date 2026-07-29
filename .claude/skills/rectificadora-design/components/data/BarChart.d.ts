import React from 'react';
export interface BarDatum { label: string; a: number; b?: number; }
export interface BarChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: BarDatum[];
  /** Fixed max for the scale; defaults to the data peak. */
  max?: number;
  height?: number;
}
export function BarChart(props: BarChartProps): JSX.Element;
