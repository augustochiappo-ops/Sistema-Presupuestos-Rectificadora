One-line: The main action button — solid black primary, white outline secondary, and a green success variant for create actions.

```jsx
<Button variant="primary" iconRight={<Icon name="download" />}>Exportar</Button>
<Button variant="secondary">Status</Button>
<Button variant="success" iconLeft={<Icon name="plus" />}>Nuevo Presupuesto</Button>
```

Variants: `primary` (black), `secondary` (white outline), `ghost` (text), `success` (green). Sizes `sm|md|lg`. Supports `iconLeft`/`iconRight`, `disabled`, `fullWidth`.
