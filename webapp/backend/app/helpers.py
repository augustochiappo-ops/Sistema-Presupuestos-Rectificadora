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
