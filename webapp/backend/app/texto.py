"""
Normalización de texto para las búsquedas que se resuelven en SQL.

Es la misma regla que `webapp/frontend/src/utils/texto.js` (los dos tienen que
dar exactamente el mismo resultado, porque parte de los buscadores filtran en el
navegador y parte en la base):

  - sin acentos y sin mayúsculas: "valvulas" encuentra "VÁLVULAS";
  - por palabras sueltas y en cualquier orden: "fiat 2.8" encuentra
    "FIAT DUCATO 2.8TD" (cada palabra se busca como fragmento, no como palabra
    entera, y puede estar en cualquier posición);
  - el punto se conserva (separa decimales de cilindrada) y la coma se pasa a
    punto, así "2,8" y "2.8" buscan lo mismo.
"""
import re
import unicodedata

_NO_ALFANUM = re.compile(r"[^a-z0-9.]+")


def normalizar(texto: str | None) -> str:
    """Texto listo para comparar: minúsculas, sin acentos, sin puntuación."""
    if not texto:
        return ""
    plano = unicodedata.normalize("NFD", str(texto))
    plano = "".join(c for c in plano if unicodedata.category(c) != "Mn")
    return _NO_ALFANUM.sub(" ", plano.lower().replace(",", ".")).strip()


def palabras(busqueda: str | None) -> list[str]:
    """Las palabras de una búsqueda, ya normalizadas."""
    return [p for p in normalizar(busqueda).split(" ") if p]


def condicion_like(columnas: list[str], busqueda: str | None) -> tuple[str, list]:
    """
    Fragmento SQL que exige que TODAS las palabras de la búsqueda aparezcan en
    alguna de las columnas (que ya tienen que venir normalizadas en la base).
    Devuelve ("", []) si no hay nada que buscar.
    """
    tokens = palabras(busqueda)
    if not tokens or not columnas:
        return "", []
    partes, params = [], []
    for token in tokens:
        alternativas = " OR ".join(f"{col} LIKE ?" for col in columnas)
        partes.append(f"({alternativas})")
        params.extend([f"%{token}%"] * len(columnas))
    return " AND ".join(partes), params


def coincide(campos, busqueda: str | None) -> bool:
    """Versión en memoria de lo mismo, para listas chicas que no vale la pena
    filtrar en SQL."""
    tokens = palabras(busqueda)
    if not tokens:
        return True
    if not isinstance(campos, (list, tuple)):
        campos = [campos]
    texto = " ".join(normalizar(c) for c in campos if c)
    return all(t in texto for t in tokens)
