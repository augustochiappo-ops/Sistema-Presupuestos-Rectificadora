One-line: Rounded data table for listings (motores, presupuestos).

```jsx
<DataTable
  columns={[
    { key: 'code', header: 'Código', strong: true },
    { key: 'motor', header: 'Motor' },
    { key: 'total', header: 'Total', align: 'right' },
    { key: 'status', header: 'Estado', render: (v) => <StatusBadge status={v} /> },
  ]}
  rows={rows}
  onRowClick={(r) => open(r)}
/>
```
Columns: `align`, `width`, `strong`, and a `render(value, row)` for custom cells.
