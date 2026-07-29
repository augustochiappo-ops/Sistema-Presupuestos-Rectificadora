import re


def formato_nombre_titulo(texto: str) -> str:
    """
    Title Case por palabra para nombres de cliente: "juan garcia" o
    "JUAN GARCIA" -> "Juan Garcia". Usa str.capitalize() (Unicode-aware, respeta
    acentos y ñ) en vez de str.title(), que rompe con apóstrofos y mayúsculas
    internas. Se preservan los espacios tal cual vinieron (incluidos dobles).
    """
    return "".join(w.capitalize() if w.strip() else w for w in re.split(r"(\s+)", texto))


def formato_precio_ars(valor) -> str:
    """Formatea un número como precio argentino: $ 1.234,50"""
    if valor is None:
        return "—"
    try:
        entero, decimal = f"{float(valor):.2f}".split(".")
        entero_fmt = ""
        for i, d in enumerate(reversed(entero)):
            if i and i % 3 == 0:
                entero_fmt = "." + entero_fmt
            entero_fmt = d + entero_fmt
        return f"$ {entero_fmt},{decimal}"
    except (ValueError, TypeError):
        return "—"
