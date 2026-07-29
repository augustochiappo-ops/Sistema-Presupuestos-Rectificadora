/* @ds-bundle: {"format":4,"namespace":"RectificadoraDesignSystem_cc48ac","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"SearchInput","sourcePath":"components/actions/SearchInput.jsx"},{"name":"Select","sourcePath":"components/actions/Select.jsx"},{"name":"Avatar","sourcePath":"components/data-display/Avatar.jsx"},{"name":"ListItem","sourcePath":"components/data-display/ListItem.jsx"},{"name":"StatCard","sourcePath":"components/data-display/StatCard.jsx"},{"name":"StatusBadge","sourcePath":"components/data-display/StatusBadge.jsx"},{"name":"BarChart","sourcePath":"components/data/BarChart.jsx"},{"name":"DataTable","sourcePath":"components/data/DataTable.jsx"},{"name":"NavItem","sourcePath":"components/navigation/NavItem.jsx"},{"name":"PageHeader","sourcePath":"components/navigation/PageHeader.jsx"}],"sourceHashes":{"components/actions/Button.jsx":"92a9bdebf970","components/actions/SearchInput.jsx":"f5aad0e993b2","components/actions/Select.jsx":"96b98dc398f8","components/data-display/Avatar.jsx":"e9f49b060ec1","components/data-display/ListItem.jsx":"6544d2ce5bd6","components/data-display/StatCard.jsx":"edfaa0717891","components/data-display/StatusBadge.jsx":"9bc0171f671d","components/data/BarChart.jsx":"0d3cd5dd7845","components/data/DataTable.jsx":"28d8f3111641","components/navigation/NavItem.jsx":"a4aa0437595a","components/navigation/PageHeader.jsx":"9b683fc7d3f1","ui_kits/presupuestos/App.jsx":"54c1fc3cfe9b","ui_kits/presupuestos/Dashboard.jsx":"a47fea9e280c","ui_kits/presupuestos/Screens.jsx":"38191cfe007d","ui_kits/presupuestos/Sidebar.jsx":"c1d44ef4249c","ui_kits/presupuestos/data.jsx":"45519127eeb9"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.RectificadoraDesignSystem_cc48ac = window.RectificadoraDesignSystem_cc48ac || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/actions/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Rectificadora primary action button. Monochrome: solid black (primary),
 * outline white (secondary), soft ghost, and a green success variant used
 * for creation actions ("Nuevo Presupuesto").
 */
function Button({
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  disabled = false,
  fullWidth = false,
  children,
  style,
  ...rest
}) {
  const sizes = {
    sm: {
      h: 34,
      px: 14,
      fs: 'var(--text-sm)',
      gap: 6
    },
    md: {
      h: 42,
      px: 18,
      fs: 'var(--text-md)',
      gap: 8
    },
    lg: {
      h: 50,
      px: 24,
      fs: 'var(--text-md)',
      gap: 10
    }
  }[size];
  const variants = {
    primary: {
      background: 'var(--surface-inverse)',
      color: 'var(--text-on-inverse)',
      border: '1px solid var(--surface-inverse)',
      boxShadow: 'var(--shadow-pill)'
    },
    secondary: {
      background: 'var(--surface-card)',
      color: 'var(--text-strong)',
      border: '1px solid var(--border-default)',
      boxShadow: 'var(--shadow-xs)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-body)',
      border: '1px solid transparent',
      boxShadow: 'none'
    },
    success: {
      background: 'var(--status-active-fg)',
      color: '#fff',
      border: '1px solid var(--status-active-fg)',
      boxShadow: 'var(--shadow-sm)'
    }
  }[variant];
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: sizes.gap,
      height: sizes.h,
      padding: `0 ${sizes.px}px`,
      width: fullWidth ? '100%' : 'auto',
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--weight-semibold)',
      fontSize: sizes.fs,
      lineHeight: 1,
      borderRadius: 'var(--radius-md)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      transition: 'transform .12s ease, opacity .12s ease, box-shadow .12s ease',
      whiteSpace: 'nowrap',
      ...variants,
      ...style
    },
    onMouseDown: e => {
      if (!disabled) e.currentTarget.style.transform = 'scale(.97)';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, rest), iconLeft, children, iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/actions/SearchInput.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Compact search field used in page headers ("Buscar por marca, modelo o código…").
 * Rounded pill well with a leading icon slot.
 */
function SearchInput({
  placeholder = 'Buscar…',
  icon,
  value,
  onChange,
  width = 360,
  style,
  ...rest
}) {
  const [focused, setFocused] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      width,
      height: 44,
      padding: '0 16px',
      background: 'var(--surface-card)',
      border: `1px solid ${focused ? 'var(--border-strong)' : 'var(--border-default)'}`,
      borderRadius: 'var(--radius-pill)',
      boxShadow: focused ? '0 0 0 3px rgba(20,22,25,.05)' : 'var(--shadow-xs)',
      transition: 'box-shadow .15s ease, border-color .15s ease',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      color: 'var(--text-faint)'
    }
  }, icon), /*#__PURE__*/React.createElement("input", _extends({
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-sm)',
      color: 'var(--text-strong)'
    }
  }, rest)));
}
Object.assign(__ds_scope, { SearchInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/SearchInput.jsx", error: String((e && e.message) || e) }); }

// components/actions/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Lightweight dropdown trigger (e.g. the "Status ▾" filter). Presentational —
 * renders the current label and a chevron; wire onClick to your own menu.
 */
function Select({
  label = 'Status',
  open = false,
  icon,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      height: 42,
      padding: '0 16px',
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-pill)',
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--weight-medium)',
      fontSize: 'var(--text-sm)',
      color: 'var(--text-strong)',
      cursor: 'pointer',
      boxShadow: 'var(--shadow-xs)',
      ...style
    }
  }, rest), icon, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--text-muted)",
    strokeWidth: "2.4",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      transform: open ? 'rotate(180deg)' : 'none',
      transition: 'transform .15s ease'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "m6 9 6 6 6-6"
  })));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Select.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Circular avatar with optional image and a small notification count badge
 * (as seen on the sidebar profile).
 */
function Avatar({
  src,
  name = '',
  size = 44,
  badge,
  style,
  ...rest
}) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      position: 'relative',
      width: size,
      height: size,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: 'var(--radius-pill)',
      overflow: 'hidden',
      background: 'var(--surface-sunken)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted)',
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--weight-semibold)',
      fontSize: size * 0.36,
      border: '1px solid var(--border-default)'
    }
  }, src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : initials), badge != null && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 20,
      height: 20,
      padding: '0 5px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--surface-inverse)',
      color: 'var(--text-on-inverse)',
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 11,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '2px solid var(--surface-card)'
    }
  }, badge));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/data-display/ListItem.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * A row in a compact list panel (e.g. "Pending Approvals"): leading logo/avatar,
 * title + timestamp, and a trailing slot (badge, menu…).
 */
function ListItem({
  leading,
  title,
  meta,
  trailing,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '10px 4px',
      ...style
    }
  }, rest), leading && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 'var(--radius-pill)',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--surface-sunken)',
      overflow: 'hidden'
    }
  }, leading), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--weight-semibold)',
      fontSize: 'var(--text-md)',
      color: 'var(--text-strong)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, title), meta && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, meta)), trailing && /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0
    }
  }, trailing));
}
Object.assign(__ds_scope, { ListItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/ListItem.jsx", error: String((e && e.message) || e) }); }

// components/data-display/StatCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Quick-stat metric card. Icon chip on top, big number, caption below.
 * `active` inverts it to the black highlighted treatment.
 */
function StatCard({
  icon,
  value,
  label,
  active = false,
  corner,
  style,
  ...rest
}) {
  const fg = active ? 'var(--text-on-inverse)' : 'var(--text-strong)';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: 10,
      padding: '22px 16px 18px',
      minWidth: 120,
      background: active ? 'var(--surface-inverse)' : 'var(--surface-card)',
      border: `1px solid ${active ? 'var(--surface-inverse)' : 'var(--border-default)'}`,
      borderRadius: 'var(--radius-lg)',
      boxShadow: active ? 'var(--shadow-md)' : 'var(--shadow-xs)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 48,
      height: 48,
      borderRadius: 'var(--radius-pill)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: active ? 'rgba(255,255,255,.14)' : 'var(--surface-sunken)',
      color: active ? '#fff' : 'var(--text-strong)'
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 'var(--text-3xl)',
      color: fg,
      lineHeight: 1
    }
  }, value), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-xs)',
      color: active ? 'rgba(255,255,255,.7)' : 'var(--text-muted)',
      lineHeight: 1.3
    }
  }, label), corner && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      bottom: 12,
      right: 14,
      color: active ? 'rgba(255,255,255,.7)' : 'var(--text-faint)'
    }
  }, corner));
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/data-display/StatusBadge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const MAP = {
  pending: {
    bg: 'var(--status-pending-bg)',
    fg: 'var(--status-pending-fg)',
    label: 'Pending'
  },
  active: {
    bg: 'var(--status-active-bg)',
    fg: 'var(--status-active-fg)',
    label: 'Active'
  },
  expired: {
    bg: 'var(--status-expired-bg)',
    fg: 'var(--status-expired-fg)',
    label: 'Expired'
  }
};

/**
 * Small status pill used in tables and lists (Pending / Active / Expired).
 * Pass `children` to override the default label text.
 */
function StatusBadge({
  status = 'pending',
  children,
  style,
  ...rest
}) {
  const s = MAP[status] || MAP.pending;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '5px 12px',
      borderRadius: 'var(--radius-pill)',
      background: s.bg,
      color: s.fg,
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--weight-semibold)',
      fontSize: 'var(--text-xs)',
      lineHeight: 1,
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), children || s.label);
}
Object.assign(__ds_scope, { StatusBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/StatusBadge.jsx", error: String((e && e.message) || e) }); }

// components/data/BarChart.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Minimal monochrome bar chart (thin bars, two series). Purely visual — feed it
 * `data` of { label, a, b } where `a` is the primary (black) series and `b` the
 * secondary (gray). No axis library.
 */
function BarChart({
  data = [],
  max,
  height = 220,
  style,
  ...rest
}) {
  const peak = max || Math.max(1, ...data.flatMap(d => [d.a || 0, d.b || 0]));
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 'clamp(6px,2%,18px)',
      height,
      ...style
    }
  }, rest), data.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      alignItems: 'flex-end',
      gap: 4,
      width: '100%',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--chart-bar)',
      height: `${(d.a || 0) / peak * 100}%`
    }
  }), d.b != null && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--chart-bar-alt)',
      height: `${d.b / peak * 100}%`
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-xs)',
      color: 'var(--text-muted)'
    }
  }, d.label))));
}
Object.assign(__ds_scope, { BarChart });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/BarChart.jsx", error: String((e && e.message) || e) }); }

// components/data/DataTable.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Data table matching the presupuestos listings. Header row + zebra-free rows
 * with hover highlight and soft dividers. Columns declare align/width; rows are
 * arrays or objects keyed by column `key`.
 */
function DataTable({
  columns = [],
  rows = [],
  onRowClick,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(-1);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      overflow: 'hidden',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-xl)',
      background: 'var(--surface-card)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map((c, i) => /*#__PURE__*/React.createElement("th", {
    key: i,
    style: {
      textAlign: c.align || 'left',
      padding: '16px 20px',
      fontSize: 'var(--text-sm)',
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--text-muted)',
      borderBottom: '1px solid var(--border-default)',
      width: c.width,
      whiteSpace: 'nowrap'
    }
  }, c.header)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((row, ri) => /*#__PURE__*/React.createElement("tr", {
    key: ri,
    onMouseEnter: () => setHover(ri),
    onMouseLeave: () => setHover(-1),
    onClick: () => onRowClick && onRowClick(row, ri),
    style: {
      background: hover === ri ? 'var(--surface-sunken)' : 'transparent',
      cursor: onRowClick ? 'pointer' : 'default',
      transition: 'background .12s ease'
    }
  }, columns.map((c, ci) => /*#__PURE__*/React.createElement("td", {
    key: ci,
    style: {
      textAlign: c.align || 'left',
      padding: '15px 20px',
      fontSize: 'var(--text-sm)',
      color: c.strong ? 'var(--text-strong)' : 'var(--text-body)',
      fontWeight: c.strong ? 'var(--weight-semibold)' : 'var(--weight-regular)',
      borderBottom: ri < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
      whiteSpace: 'nowrap'
    }
  }, c.render ? c.render(row[c.key], row) : row[c.key])))))));
}
Object.assign(__ds_scope, { DataTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/DataTable.jsx", error: String((e && e.message) || e) }); }

// components/navigation/NavItem.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Sidebar navigation row. Active state is the solid black pill; idle rows are
 * quiet with a muted icon.
 */
function NavItem({
  icon,
  children,
  active = false,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", _extends({
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      width: '100%',
      padding: '12px 16px',
      border: 'none',
      textAlign: 'left',
      cursor: 'pointer',
      borderRadius: 'var(--radius-pill)',
      background: active ? 'var(--surface-inverse)' : hover ? 'var(--surface-sunken)' : 'transparent',
      color: active ? 'var(--text-on-inverse)' : 'var(--text-body)',
      boxShadow: active ? 'var(--shadow-pill)' : 'none',
      fontFamily: 'var(--font-body)',
      fontWeight: 'var(--weight-semibold)',
      fontSize: 'var(--text-md)',
      transition: 'background .15s ease',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      width: 22,
      justifyContent: 'center',
      color: active ? '#fff' : 'var(--text-muted)'
    }
  }, icon), /*#__PURE__*/React.createElement("span", null, children));
}
Object.assign(__ds_scope, { NavItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/NavItem.jsx", error: String((e && e.message) || e) }); }

// components/navigation/PageHeader.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Page header: large title, optional subtitle/counter line, and a right-aligned
 * actions slot.
 */
function PageHeader({
  title,
  subtitle,
  actions,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 24,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 'var(--text-2xl)',
      color: 'var(--text-strong)',
      letterSpacing: 'var(--tracking-tight)',
      lineHeight: 1.1
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 0',
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-sm)',
      color: 'var(--text-muted)'
    }
  }, subtitle)), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0
    }
  }, actions));
}
Object.assign(__ds_scope, { PageHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/PageHeader.jsx", error: String((e && e.message) || e) }); }

// ui_kits/presupuestos/App.jsx
try { (() => {
function App() {
  const [screen, setScreen] = React.useState('dashboard');
  const views = {
    dashboard: /*#__PURE__*/React.createElement(Dashboard, null),
    motores: /*#__PURE__*/React.createElement(MotoresScreen, null),
    excel: /*#__PURE__*/React.createElement(ExcelScreen, null),
    presupuestos: /*#__PURE__*/React.createElement(PresupuestosScreen, null),
    precios: /*#__PURE__*/React.createElement(EmptyScreen, {
      title: "Editar Precios"
    }),
    clientes: /*#__PURE__*/React.createElement(ClientesScreen, null)
  };
  React.useEffect(() => {
    refreshIcons();
  }, [screen]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      background: 'var(--bg-app)',
      padding: 24,
      boxSizing: 'border-box',
      fontFamily: 'var(--font-body)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1360,
      margin: '0 auto',
      background: 'var(--surface-shell)',
      borderRadius: 'var(--radius-2xl)',
      boxShadow: 'var(--shadow-lg)',
      display: 'flex',
      overflow: 'hidden',
      minHeight: 'calc(100vh - 48px)'
    }
  }, /*#__PURE__*/React.createElement(Sidebar, {
    current: screen,
    onNav: setScreen
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      padding: '28px 30px',
      overflow: 'auto'
    }
  }, views[screen])));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
refreshIcons();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/presupuestos/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/presupuestos/Dashboard.jsx
try { (() => {
function Dashboard() {
  const {
    StatCard,
    BarChart,
    ListItem,
    StatusBadge,
    Button,
    Select,
    DataTable
  } = NS;
  const [filterOpen, setFilterOpen] = React.useState(false);
  refreshIcons();
  const stats = [{
    icon: 'users',
    value: '2',
    label: 'Clientes'
  }, {
    icon: 'wrench',
    value: '491',
    label: 'Motores'
  }, {
    icon: 'file-text',
    value: '6',
    label: 'Presupuestos',
    active: true,
    corner: /*#__PURE__*/React.createElement(Icon, {
      n: "arrow-up-right",
      s: 16
    })
  }, {
    icon: 'dollar-sign',
    value: '$1.8M',
    label: 'Facturado'
  }, {
    icon: 'clock',
    value: '2',
    label: 'Pendientes'
  }, {
    icon: 'alert-triangle',
    value: '1',
    label: 'Vencidos'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 18,
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      maxWidth: 200
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 22,
      color: 'var(--text-strong)'
    }
  }, "Resumen"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      color: 'var(--text-muted)',
      marginTop: 8
    }
  }, "Tu actividad de presupuestos del per\xEDodo.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(6,1fr)',
      gap: 14,
      flex: 1
    }
  }, stats.map((s, i) => /*#__PURE__*/React.createElement(StatCard, {
    key: i,
    icon: /*#__PURE__*/React.createElement(Icon, {
      n: s.icon
    }),
    value: s.value,
    label: s.label,
    active: s.active,
    corner: s.corner
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.6fr 1fr',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-xl)',
      padding: '22px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 19,
      color: 'var(--text-strong)'
    }
  }, "Presupuestos por mes"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      fontFamily: 'var(--font-body)',
      fontSize: 12,
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 99,
      background: 'var(--chart-bar)'
    }
  }), "Emitidos"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: 8,
      height: 8,
      borderRadius: 99,
      background: 'var(--chart-bar-alt)'
    }
  }), "Aprobados"))), /*#__PURE__*/React.createElement(BarChart, {
    data: CHART,
    height: 210
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-xl)',
      padding: '20px 22px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 19,
      color: 'var(--text-strong)'
    }
  }, "Por aprobar"), /*#__PURE__*/React.createElement(Icon, {
    n: "more-horizontal",
    s: 18
  })), APROBACIONES.map((a, i) => /*#__PURE__*/React.createElement(ListItem, {
    key: i,
    leading: /*#__PURE__*/React.createElement(Icon, {
      n: a.icon
    }),
    title: a.title,
    meta: a.meta,
    trailing: /*#__PURE__*/React.createElement(StatusBadge, {
      status: a.estado
    })
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-xl)',
      padding: '22px 24px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 19,
      color: 'var(--text-strong)'
    }
  }, "Gestionar presupuestos"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Select, {
    label: "Estado",
    open: filterOpen,
    onClick: () => setFilterOpen(o => !o)
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    iconRight: /*#__PURE__*/React.createElement(Icon, {
      n: "download",
      s: 16
    })
  }, "Exportar"))), /*#__PURE__*/React.createElement(DataTable, {
    columns: [{
      key: 'code',
      header: 'Nº',
      strong: true,
      width: 70
    }, {
      key: 'fecha',
      header: 'Fecha',
      width: 110
    }, {
      key: 'cliente',
      header: 'Cliente',
      width: 130
    }, {
      key: 'motor',
      header: 'Motor'
    }, {
      key: 'total',
      header: 'Total',
      align: 'right'
    }, {
      key: 'estado',
      header: 'Estado',
      render: v => /*#__PURE__*/React.createElement(StatusBadge, {
        status: v
      })
    }],
    rows: PRESUPUESTOS,
    style: {
      border: 'none',
      borderRadius: 0
    }
  })));
}
window.Dashboard = Dashboard;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/presupuestos/Dashboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/presupuestos/Screens.jsx
try { (() => {
// Secondary screens for the kit (Motores, Presupuestos, Clientes, Excel, Precios)
function PageTitle({
  title,
  subtitle,
  actions
}) {
  const {
    PageHeader
  } = NS;
  return /*#__PURE__*/React.createElement(PageHeader, {
    title: title,
    subtitle: subtitle,
    actions: actions
  });
}
function MotoresScreen() {
  const {
    DataTable,
    SearchInput,
    PageHeader
  } = NS;
  const marcas = ['Todos', 'BEDFORD', 'BORGWARD', 'CATERPILLAR', 'CHERY', 'CHEVROLET', 'CHRYSLER', 'CUMMINS', 'DEUTZ', 'DODGE', 'FIAT', 'FORD'];
  const [sel, setSel] = React.useState('Todos');
  refreshIcons();
  const rows = [{
    code: 'BED200',
    motor: 'BEDFORD 200 DIESEL *4CIL* 98.4mm',
    marca: 'BEDFORD',
    tipo: 'DIESEL',
    cil: '4',
    diam: '98.4 mm',
    lista: '4'
  }, {
    code: 'BED350',
    motor: 'BEDFORD 350 DIESEL *4CIL* 106.3mm',
    marca: 'BEDFORD',
    tipo: 'DIESEL',
    cil: '4',
    diam: '106.3 mm',
    lista: '4'
  }, {
    code: 'CAT.3406',
    motor: 'CATERPILLAR 3406 TURBO DIESEL *6CIL* 137.2mm',
    marca: 'CATERPILLAR',
    tipo: 'TURBO DIESEL',
    cil: '6',
    diam: '137.2 mm',
    lista: '11'
  }, {
    code: 'CAT.C-15',
    motor: 'CATERPILLAR C-15 DIESEL *6CIL* 145mm',
    marca: 'CATERPILLAR',
    tipo: 'DIESEL',
    cil: '6',
    diam: '145.0 mm',
    lista: '12'
  }, {
    code: 'BORGVM',
    motor: 'BORGWARD VM HR492 *4CIL* 92mm',
    marca: 'BORGWARD',
    tipo: '—',
    cil: '4',
    diam: '92.0 mm',
    lista: '4'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Listado de Motores",
    subtitle: "491 motores \xB7 todas las marcas",
    actions: /*#__PURE__*/React.createElement(SearchInput, {
      width: 320,
      icon: /*#__PURE__*/React.createElement(Icon, {
        n: "search",
        s: 16
      }),
      placeholder: "Buscar por marca, modelo o c\xF3digo\u2026"
    })
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '180px 1fr',
      gap: 18,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-xl)',
      padding: '14px 10px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      color: 'var(--text-faint)',
      padding: '6px 12px'
    }
  }, "Marcas"), marcas.map(m => /*#__PURE__*/React.createElement("button", {
    key: m,
    onClick: () => setSel(m),
    style: {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      border: 'none',
      cursor: 'pointer',
      padding: '10px 12px',
      borderRadius: 'var(--radius-md)',
      fontFamily: 'var(--font-body)',
      fontSize: 14,
      fontWeight: sel === m ? 600 : 500,
      background: sel === m ? 'var(--surface-inverse)' : 'transparent',
      color: sel === m ? '#fff' : 'var(--text-body)'
    }
  }, m))), /*#__PURE__*/React.createElement(DataTable, {
    columns: [{
      key: 'code',
      header: 'Código',
      strong: true,
      width: 120
    }, {
      key: 'motor',
      header: 'Motor'
    }, {
      key: 'marca',
      header: 'Marca'
    }, {
      key: 'tipo',
      header: 'Tipo'
    }, {
      key: 'cil',
      header: 'Cil.',
      align: 'center',
      width: 60
    }, {
      key: 'diam',
      header: 'Diámetro',
      align: 'right',
      width: 110
    }, {
      key: 'lista',
      header: 'Lista',
      align: 'center',
      width: 70
    }],
    rows: rows
  })));
}
function PresupuestosScreen() {
  const {
    DataTable,
    PageHeader,
    Button,
    StatusBadge
  } = NS;
  refreshIcons();
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Presupuestos",
    subtitle: "6 presupuestos \xB7 2 clientes",
    actions: /*#__PURE__*/React.createElement(Button, {
      variant: "success",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        n: "plus",
        s: 16
      })
    }, "Nuevo Presupuesto")
  }), /*#__PURE__*/React.createElement(DataTable, {
    columns: [{
      key: 'code',
      header: 'Nº',
      strong: true,
      width: 70
    }, {
      key: 'fecha',
      header: 'Fecha',
      width: 120
    }, {
      key: 'cliente',
      header: 'Cliente',
      width: 140
    }, {
      key: 'motor',
      header: 'Motor'
    }, {
      key: 'total',
      header: 'Total',
      align: 'right'
    }, {
      key: 'estado',
      header: 'Estado',
      render: v => /*#__PURE__*/React.createElement(StatusBadge, {
        status: v
      })
    }],
    rows: PRESUPUESTOS
  }));
}
function ClientesScreen() {
  const {
    DataTable,
    PageHeader,
    Button,
    Avatar
  } = NS;
  refreshIcons();
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Clientes",
    subtitle: "2 clientes",
    actions: /*#__PURE__*/React.createElement(Button, {
      variant: "success",
      iconLeft: /*#__PURE__*/React.createElement(Icon, {
        n: "plus",
        s: 16
      })
    }, "Nuevo Cliente")
  }), /*#__PURE__*/React.createElement(DataTable, {
    columns: [{
      key: 'nombre',
      header: 'Nombre',
      strong: true,
      render: v => /*#__PURE__*/React.createElement("span", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }
      }, /*#__PURE__*/React.createElement(Avatar, {
        name: v,
        size: 34
      }), v)
    }, {
      key: 'presu',
      header: 'Presupuestos',
      align: 'center'
    }, {
      key: 'ultimo',
      header: 'Último presupuesto',
      align: 'right'
    }],
    rows: [{
      nombre: 'Cliente 2',
      presu: '5',
      ultimo: '04/06/2026'
    }, {
      nombre: 'Prueba',
      presu: '1',
      ultimo: '29/05/2026'
    }]
  }));
}
function ExcelScreen() {
  const {
    PageHeader,
    Button
  } = NS;
  refreshIcons();
  const Card = ({
    icon,
    title,
    desc,
    cta,
    disabled
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-xl)',
      padding: '22px 24px',
      opacity: disabled ? 0.6 : 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-sunken)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    n: icon,
    s: 20
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 18,
      color: 'var(--text-strong)'
    }
  }, title)), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 16px',
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, desc), /*#__PURE__*/React.createElement(Button, {
    variant: disabled ? 'secondary' : 'primary',
    disabled: disabled,
    iconLeft: /*#__PURE__*/React.createElement(Icon, {
      n: "folder",
      s: 16
    })
  }, cta));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Actualizar Excel",
    subtitle: "Import\xE1 los archivos de FACRA para mantener motores y precios al d\xEDa."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      color: 'var(--text-faint)'
    }
  }, "FACRA"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Card, {
    icon: "file-text",
    title: "Nomenclador de Motores",
    desc: "Lista de todos los motores con su n\xFAmero de lista asignado (1\u201313).",
    cta: "Cargar nomenclador.xls"
  }), /*#__PURE__*/React.createElement(Card, {
    icon: "dollar-sign",
    title: "Lista Orientadora de Mano de Obra",
    desc: "Precios vigentes por servicio, clasificados por n\xFAmero de lista.",
    cta: "Cargar lista_orientadora.xls"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      color: 'var(--text-faint)'
    }
  }, "CRAC \u2014 Pr\xF3ximamente"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Card, {
    icon: "package",
    title: "Lista de Precios CRAC",
    desc: "Precios de repuestos del proveedor CRAC. Se habilitar\xE1 en una pr\xF3xima versi\xF3n.",
    cta: "Cargar precios_crac.xls",
    disabled: true
  }), /*#__PURE__*/React.createElement(Card, {
    icon: "tag",
    title: "Lista de Prefijos CRAC",
    desc: "Codificaci\xF3n y prefijos de partes CRAC. Se habilitar\xE1 en una pr\xF3xima versi\xF3n.",
    cta: "Cargar prefijos_crac.xls",
    disabled: true
  })));
}
function EmptyScreen({
  title
}) {
  const {
    PageHeader
  } = NS;
  refreshIcons();
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(PageHeader, {
    title: title
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 360,
      fontFamily: 'var(--font-body)',
      fontSize: 14,
      color: 'var(--text-faint)'
    }
  }, "Este m\xF3dulo estar\xE1 disponible en una pr\xF3xima versi\xF3n."));
}
Object.assign(window, {
  MotoresScreen,
  PresupuestosScreen,
  ClientesScreen,
  ExcelScreen,
  EmptyScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/presupuestos/Screens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/presupuestos/Sidebar.jsx
try { (() => {
function Sidebar({
  current,
  onNav
}) {
  const {
    NavItem,
    Avatar
  } = NS;
  const items = [{
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'layout-dashboard'
  }, {
    id: 'motores',
    label: 'Listado de Motores',
    icon: 'wrench'
  }, {
    id: 'excel',
    label: 'Actualizar Excel',
    icon: 'folder'
  }, {
    id: 'presupuestos',
    label: 'Presupuestos',
    icon: 'file-text'
  }, {
    id: 'precios',
    label: 'Editar Precios',
    icon: 'dollar-sign'
  }, {
    id: 'clientes',
    label: 'Clientes',
    icon: 'users'
  }];
  refreshIcons();
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 248,
      flexShrink: 0,
      padding: '28px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 28,
      borderRight: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '0 8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 'var(--radius-md)',
      background: 'var(--brand-ink)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    n: "wrench",
    s: 22
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 19,
      color: 'var(--text-strong)'
    }
  }, "Rectifi")), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      flex: 1
    }
  }, items.map(it => /*#__PURE__*/React.createElement(NavItem, {
    key: it.id,
    icon: /*#__PURE__*/React.createElement(Icon, {
      n: it.icon
    }),
    active: current === it.id,
    onClick: () => onNav(it.id)
  }, it.label))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 8px',
      borderTop: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Taller Central",
    size: 40,
    badge: 12
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 600,
      fontSize: 14,
      color: 'var(--text-strong)'
    }
  }, "Taller Central"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 12,
      color: 'var(--text-muted)'
    }
  }, "rectificadora@mail.com"))));
}
window.Sidebar = Sidebar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/presupuestos/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/presupuestos/data.jsx
try { (() => {
// Shared helpers for the Presupuestos UI kit
const NS = window.RectificadoraDesignSystem_cc48ac;
const Icon = ({
  n,
  s = 20
}) => /*#__PURE__*/React.createElement("i", {
  "data-lucide": n,
  style: {
    width: s,
    height: s,
    display: 'inline-flex'
  }
});
function refreshIcons() {
  setTimeout(() => window.lucide && window.lucide.createIcons(), 20);
}
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const CHART = [6, 8, 3, 5, 7, 6.4, 4, 5, 3, 6, 4, 5].map((a, i) => ({
  label: MESES[i],
  a,
  b: a * 0.55 + 1
}));
const PRESUPUESTOS = [{
  code: '0006',
  fecha: '04/06/2026',
  cliente: 'Cliente 2',
  motor: 'CHEVROLET MERIVA 1.8 8V -SIENA NAF.INY.*4CIL* 80.50mm',
  total: '$ 494.677,19',
  estado: 'pending'
}, {
  code: '0005',
  fecha: '04/06/2026',
  cliente: 'Cliente 2',
  motor: 'BEDFORD 350 DIESEL *4CIL* 106.3mm',
  total: '$ 35.492,35',
  estado: 'active'
}, {
  code: '0004',
  fecha: '04/06/2026',
  cliente: 'Cliente 2',
  motor: 'BEDFORD 300 DIESEL *4CIL* 98.4mm',
  total: '$ 289.737,30',
  estado: 'active'
}, {
  code: '0003',
  fecha: '29/05/2026',
  cliente: 'Cliente 2',
  motor: 'BORGWARD VM HR492 *4CIL* 92mm',
  total: '$ 540.619,22',
  estado: 'expired'
}, {
  code: '0002',
  fecha: '29/05/2026',
  cliente: 'Cliente 2',
  motor: 'BEDFORD 350 DIESEL *4CIL* 106.3mm',
  total: '$ 99.917,03',
  estado: 'pending'
}, {
  code: '0001',
  fecha: '29/05/2026',
  cliente: 'Prueba',
  motor: 'BEDFORD 200 DIESEL *4CIL* 98.4mm',
  total: '$ 381.846,86',
  estado: 'active'
}];
const APROBACIONES = [{
  icon: 'wrench',
  title: 'Caterpillar 3406',
  meta: 'Jun 10 03:20 · $494.677',
  estado: 'pending'
}, {
  icon: 'wrench',
  title: 'Bedford 350',
  meta: 'Jun 12 04:30 · $35.492',
  estado: 'pending'
}, {
  icon: 'wrench',
  title: 'Borgward VM',
  meta: 'Jun 14 05:40 · $540.619',
  estado: 'pending'
}];
Object.assign(window, {
  NS,
  Icon,
  refreshIcons,
  MESES,
  CHART,
  PRESUPUESTOS,
  APROBACIONES
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/presupuestos/data.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.SearchInput = __ds_scope.SearchInput;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.ListItem = __ds_scope.ListItem;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.StatusBadge = __ds_scope.StatusBadge;

__ds_ns.BarChart = __ds_scope.BarChart;

__ds_ns.DataTable = __ds_scope.DataTable;

__ds_ns.NavItem = __ds_scope.NavItem;

__ds_ns.PageHeader = __ds_scope.PageHeader;

})();
