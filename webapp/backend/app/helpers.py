import math
import re


def formato_nombre_titulo(texto: str) -> str:
    """
    Title Case por palabra para nombres de cliente: "juan garcia" o
    "JUAN GARCIA" -> "Juan Garcia". Usa str.capitalize() (Unicode-aware, respeta
    acentos y ñ) en vez de str.title(), que rompe con apóstrofos y mayúsculas
    internas. Se preservan los espacios tal cual vinieron (incluidos dobles).
    """
    return "".join(w.capitalize() if w.strip() else w for w in re.split(r"(\s+)", texto))


def pesos(valor):
    """
    Plata en pesos ENTEROS, redondeando SIEMPRE hacia arriba (2026-08-19, pedido
    del dueño). El sistema no maneja centavos: el taller cobra en pesos redondos
    y los decimales que arrastra el catálogo del proveedor solo ensuciaban la
    pantalla y el PDF. Hacia arriba y no al más cercano para no cobrar de menos.

    Es el equivalente exacto de `aPesos` del frontend (utils/format.js): las dos
    cuentas tienen que dar el mismo número o los totales discrepan entre lo que
    se ve al armar el presupuesto y lo que guarda el backend.

    El catálogo del proveedor NO se redondea al importarlo: los datos crudos se
    guardan como vienen y el redondeo pasa recién cuando el precio entra a un
    presupuesto o se muestra. Por eso los presupuestos ya emitidos (guardados
    con centavos) se ven redondeados sin haber tocado la base.
    """
    if valor is None:
        return None
    try:
        return math.ceil(float(valor))
    except (ValueError, TypeError):
        return None


def formato_precio_ars(valor) -> str:
    """Formatea un número como precio argentino, en pesos enteros: $ 1.234"""
    entero = pesos(valor)
    if entero is None:
        return "—"
    negativo = entero < 0
    entero_fmt = ""
    for i, d in enumerate(reversed(str(abs(entero)))):
        if i and i % 3 == 0:
            entero_fmt = "." + entero_fmt
        entero_fmt = d + entero_fmt
    return f"$ -{entero_fmt}" if negativo else f"$ {entero_fmt}"
