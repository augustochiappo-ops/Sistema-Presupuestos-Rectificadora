import React from 'react';
export interface TableColumn {
  key: string;
  header?: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  /** Render the cell as strong (dark, semibold). */
  strong?: boolean;
  /** Custom cell renderer: (value, row) => node. */
  render?: (value: any, row: any) => React.ReactNode;
}
export interface DataTableProps extends React.HTMLAttributes<HTMLDivElement> {
  columns: TableColumn[];
  rows: any[];
  onRowClick?: (row: any, index: number) => void;
}
/**
 * Listings table.
 * @startingPoint section="Data" subtitle="Rounded data table" viewport="700x260"
 */
export function DataTable(props: DataTableProps): JSX.Element;
