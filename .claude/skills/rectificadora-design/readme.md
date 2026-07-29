# Rectificadora — Design System

Design system for **Sistema de Presupuestos — Rectificadora**, a desktop app for an engine-rebuilding shop (rectificadora de motores) that manages a motor catalogue, price lists (FACRA / CRAC), clients and quotes (*presupuestos*).

## Visual identity
The brand identity follows the **"Jobgio" reference** the client provided: a clean, **monochrome** SaaS dashboard — white surfaces, pure-black ink, generous corner radii, soft low-contrast shadows, and a pill-shaped sidebar whose active item is a solid-black pill. Colour appears **only** in status pills (Pending / Active / Expired). The *content and information architecture* come from the client's actual desktop app (Listado de Motores, Actualizar Excel, Presupuestos, Editar Precios, Clientes).

> The app's original desktop UI used a dark-navy chrome; the client explicitly chose the monochrome Jobgio look for this system, so the navy is intentionally **not** carried over.

## Sources
- **Reference identity:** "Jobgio" dashboard screenshot (client-provided, `uploads/`).
- **App structure & copy:** 5 screenshots of the client's desktop app "Sistema de Presupuestos — Rectificadora" v0.1.0 (Listado de Motores, Actualizar Excel, Presupuestos, Editar Precios, Clientes).
- No codebase or Figma was provided; recreations are built from the screenshots + reference.

## CONTENT FUNDAMENTALS
- **Language:** Spanish (Argentine / rioplatense). Uses *voseo* imperatives: "Importá", "Actualizá", "Cargá". Address the user as **vos/tú implicitly** ("Tu actividad"), never formal *usted*.
- **Tone:** plain, operational, no marketing fluff. Labels are literal domain terms: *Presupuestos, Motores, Nomenclador, Lista Orientadora de Mano de Obra, Prefijos*.
- **Casing:** Title Case for page titles ("Listado de Motores"), UPPERCASE + wide tracking for eyebrow/section labels ("MARCAS", "FACRA", "CRAC — PRÓXIMAMENTE"). Sentence case for body.
- **Numbers / money:** Argentine format — `$ 494.677,19` (dot thousands, comma decimals, space after `$`). Dates `DD/MM/YYYY`.
- **Status vocabulary:** Pending / Active / Expired (English in the reference pills; use Spanish equivalents *Pendiente / Aprobado / Vencido* when localising).
- **Emoji:** none. **Icons only** (Lucide outline).

## VISUAL FOUNDATIONS
- **Colour:** monochrome. Neutral ramp `--neutral-0…950`. `--brand-ink` (#141619) is the black used for text, primary buttons and the active nav pill. Backgrounds: `--bg-app` (light grey desk) behind a white rounded **shell** (`--surface-card`). Only semantic colour is the three status pills — desaturated green (active #1f7a46), muted red (expired #a23b3b), grey (pending).
- **Type:** two families. **Poppins** (display) for the wordmark, page titles and big stat numbers; **Plus Jakarta Sans** (body) for everything else. Both substituted from Google Fonts — the app's real font is unknown (see CAVEATS). Titles are 700 weight, tight tracking; eyebrow labels are 600 / 0.14em / uppercase.
- **Spacing:** 4px base scale (`--space-1…16`). Sidebar 248px, generous 24–30px page padding.
- **Radii:** very rounded — chips 10px, buttons/inputs 14px, stat cards 20px, panels/tables 26px, the outer shell 34px, pills 999px.
- **Shadows:** soft and low-contrast (`--shadow-xs…lg`); the whole app shell floats on the desk with `--shadow-lg`. Black pill/primary buttons get `--shadow-pill`.
- **Borders:** hairline `--border-default` (#e2e4e8) on cards/inputs; even lighter `--border-subtle` for table row dividers.
- **Backgrounds:** flat colour only — **no gradients, no textures, no illustrations, no imagery**. The grey desk + white shell is the only layering.
- **Animation:** minimal. Buttons scale to 0.97 on press; hover states are subtle background/opacity shifts (`.12–.15s ease`). No bounces, no entrance animations.
- **Hover:** nav rows/inputs go to `--surface-sunken`; buttons keep colour, add shadow. **Press:** slight scale-down. **Focus:** subtle 3px translucent ring.
- **Cards:** white, 1px hairline border, 20–26px radius, soft shadow. Never coloured left-borders, never gradient fills.
- **Transparency/blur:** essentially unused; keep surfaces opaque.

## ICONOGRAPHY
- **Lucide** (outline, 2px stroke, `currentColor`), loaded from CDN (`unpkg.com/lucide`). This is a **substitution** — the app's real glyph set is unknown; flag to confirm.
- Rendered as `<i data-lucide="name">` + `lucide.createIcons()`, or via the kit's `<Icon n="…"/>` helper. Icons inherit text colour so they invert automatically on black surfaces.
- Common glyphs: `wrench` (motores), `folder` (excel/import), `file-text` (presupuestos), `dollar-sign` (precios), `users` (clientes), `search`, `download`, `plus`, `alert-triangle`, `arrow-up-right`, `more-horizontal`, `package`, `tag`.
- No emoji, no unicode-as-icon.

## Brand mark
No logo was provided. The wordmark renders as the name **"Rectifi / Sistema de Presupuestos"** in Poppins, paired with a black rounded chip holding a `wrench` icon. Replace with the real logo when available.

## Components
Reusable primitives (React, styled via CSS custom properties). Namespace: `window.RectificadoraDesignSystem_cc48ac`.
- **Button** (`components/actions`) — primary / secondary / ghost / success, 3 sizes, icons.
- **SearchInput** (`components/actions`) — rounded pill search field.
- **Select** (`components/actions`) — dropdown trigger (label + chevron).
- **StatusBadge** (`components/data-display`) — Pending / Active / Expired pill.
- **Avatar** (`components/data-display`) — circular avatar + count badge.
- **StatCard** (`components/data-display`) — metric card, invertible active state.
- **ListItem** (`components/data-display`) — list row (leading / title+meta / trailing).
- **NavItem** (`components/navigation`) — sidebar row, black active pill.
- **PageHeader** (`components/navigation`) — title + subtitle + actions.
- **DataTable** (`components/data`) — listings table with custom cell renderers.
- **BarChart** (`components/data`) — thin monochrome two-series bars.

## UI kits
- **`ui_kits/presupuestos/`** — full interactive recreation of the app: Dashboard (Resumen), Listado de Motores, Actualizar Excel, Presupuestos, Editar Precios, Clientes. Click the sidebar to switch screens. Entry: `index.html`.

## Foundations (Design System tab)
Specimen cards under `foundations/` + `components/*/` cover Colors, Type, Spacing/Shape, Brand/Iconography and each component group.

## Index / manifest (root)
- `styles.css` — entry point, `@import`s all tokens + fonts. **Consumers link this one file.**
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `radius.css`, `shadow.css`, `fonts.css`.
- `components/{actions,data-display,navigation,data}/` — primitives (`.jsx` + `.d.ts` + `.prompt.md` + card).
- `ui_kits/presupuestos/` — interactive kit.
- `foundations/` — specimen cards.
- `thumbnail.html` — homepage tile. `SKILL.md` — Agent-Skills wrapper.

## CAVEATS
- **Fonts substituted** — the desktop app's real font is unknown; using Poppins + Plus Jakarta Sans. Send the real files to swap.
- **Icons substituted** — Lucide stands in for the app's real glyphs.
- **No logo** — wordmark used instead.
