"""
Design tokens y estilos globales del sistema.
Todos los colores, fuentes y bordes se definen acá.
"""

# ─── Paleta de colores ────────────────────────────────────────────────────────
COLOR_SIDEBAR_BG      = "#1a2744"
COLOR_SIDEBAR_HOVER   = "#2d3f6e"
COLOR_SIDEBAR_ACTIVE  = "#3b5090"
COLOR_SIDEBAR_ACCENT  = "#5b85d0"
COLOR_SIDEBAR_TEXT    = "#ffffff"

COLOR_CONTENT_BG      = "#f5f6fa"
COLOR_PANEL_BG        = "#eef0f7"
COLOR_PANEL_BORDER    = "#d0d4e8"

COLOR_WHITE           = "#ffffff"
COLOR_TEXT_PRIMARY    = "#1a2744"
COLOR_TEXT_SECONDARY  = "#555555"
COLOR_TEXT_MUTED      = "#999999"
COLOR_TEXT_PLACEHOLDER= "#aaaaaa"

COLOR_SUCCESS         = "#2e7d32"
COLOR_SUCCESS_HOVER   = "#1b5e20"
COLOR_ERROR           = "#c62828"
COLOR_WARNING         = "#e65100"

COLOR_BORDER          = "#dddddd"
COLOR_GRID            = "#eeeeee"
COLOR_ROW_ALT         = "#f8f9ff"
COLOR_ROW_SELECTED    = "#d0daf5"

COLOR_BTN_PRIMARY     = "#3b5090"
COLOR_BTN_PRIMARY_HOV = "#2d3f6e"
COLOR_BTN_DISABLED_BG = "#aabbcc"
COLOR_BTN_DISABLED_FG = "#dddddd"

# ─── Tipografía ───────────────────────────────────────────────────────────────
FONT_FAMILY = "Segoe UI"
FONT_SIZE_XS  = 10
FONT_SIZE_SM  = 11
FONT_SIZE_MD  = 13
FONT_SIZE_LG  = 16
FONT_SIZE_XL  = 18

# ─── Estilos QSS reutilizables ────────────────────────────────────────────────
SIDEBAR_STYLE = f"""
QWidget#sidebar {{
    background-color: {COLOR_SIDEBAR_BG};
    min-width: 220px;
    max-width: 220px;
}}
QListWidget {{
    background-color: transparent;
    border: none;
    color: {COLOR_SIDEBAR_TEXT};
    font-size: {FONT_SIZE_MD}px;
    font-family: {FONT_FAMILY};
    padding: 8px 0;
    outline: none;
}}
QListWidget::item {{
    padding: 13px 20px;
}}
QListWidget::item:hover {{
    background-color: {COLOR_SIDEBAR_HOVER};
}}
QListWidget::item:selected {{
    background-color: {COLOR_SIDEBAR_ACTIVE};
    border-left: 3px solid {COLOR_SIDEBAR_ACCENT};
}}
"""

BUTTON_PRIMARY = f"""
QPushButton {{
    background-color: {COLOR_BTN_PRIMARY};
    color: white;
    border: none;
    border-radius: 6px;
    padding: 9px 20px;
    font-size: {FONT_SIZE_MD}px;
    font-family: {FONT_FAMILY};
    font-weight: bold;
}}
QPushButton:hover {{ background-color: {COLOR_BTN_PRIMARY_HOV}; }}
QPushButton:disabled {{
    background-color: {COLOR_BTN_DISABLED_BG};
    color: {COLOR_BTN_DISABLED_FG};
}}
"""

BUTTON_SUCCESS = f"""
QPushButton {{
    background-color: {COLOR_SUCCESS};
    color: white;
    border: none;
    border-radius: 6px;
    padding: 10px 20px;
    font-size: {FONT_SIZE_MD}px;
    font-family: {FONT_FAMILY};
    font-weight: bold;
}}
QPushButton:hover {{ background-color: {COLOR_SUCCESS_HOVER}; }}
"""

SEARCH_INPUT = f"""
QLineEdit {{
    border: 1px solid {COLOR_BORDER};
    border-radius: 6px;
    padding: 8px 12px;
    font-size: {FONT_SIZE_MD}px;
    font-family: {FONT_FAMILY};
    background: {COLOR_WHITE};
    color: {COLOR_TEXT_PRIMARY};
}}
QLineEdit:focus {{ border-color: {COLOR_BTN_PRIMARY}; }}
QLineEdit::placeholder {{ color: {COLOR_TEXT_PLACEHOLDER}; }}
"""

TABLE_STYLE = f"""
QTableWidget {{
    background: {COLOR_WHITE};
    border: none;
    border-radius: 0px;
    gridline-color: {COLOR_GRID};
    font-size: {FONT_SIZE_MD}px;
    font-family: {FONT_FAMILY};
}}
QHeaderView::section {{
    background-color: {COLOR_SIDEBAR_BG};
    color: {COLOR_SIDEBAR_TEXT};
    padding: 9px 8px;
    font-weight: bold;
    border: none;
    border-right: 1px solid #2d3f6e;
    font-size: 12px;
    font-family: {FONT_FAMILY};
}}
QHeaderView::section:last {{
    border-right: none;
}}
QTableWidget::item {{
    padding: 4px 6px;
    border-bottom: 1px solid {COLOR_GRID};
}}
QTableWidget::item:selected {{
    background-color: {COLOR_ROW_SELECTED};
    color: {COLOR_TEXT_PRIMARY};
}}
QTableWidget::item:alternate {{
    background-color: {COLOR_ROW_ALT};
}}
"""

BRANDS_PANEL_STYLE = f"""
QFrame {{
    background-color: {COLOR_PANEL_BG};
    border-right: 1px solid {COLOR_PANEL_BORDER};
}}
QListWidget {{
    background: transparent;
    border: none;
    font-size: {FONT_SIZE_MD}px;
    font-family: {FONT_FAMILY};
    outline: none;
}}
QListWidget::item {{
    padding: 9px 16px;
    color: {COLOR_TEXT_SECONDARY};
}}
QListWidget::item:hover {{ background: #dce0f0; }}
QListWidget::item:selected {{
    background: {COLOR_BTN_PRIMARY};
    color: white;
    font-weight: bold;
}}
"""

CARD_STYLE = f"""
QFrame {{
    background: {COLOR_WHITE};
    border-radius: 10px;
    border: 1px solid #e0e4ef;
}}
"""
