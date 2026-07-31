"""
Copia de seguridad completa del sistema: exporta/restaura la base de datos
SQLite (motores, servicios, clientes, presupuestos, catálogo CRAC) y los PDFs
generados. Los Excel de FACRA y el CSV de CRAC no se incluyen: son insumos
reimportables desde "Actualizar Excel", no estado propio del sistema.
"""
import hashlib
import io
import json
import os
import shutil
import sqlite3
import tempfile
import time
import uuid
import zipfile
from datetime import datetime

from . import config, db

MANIFEST_VERSION = 1
_RESTORES_DIR = os.path.join(config.DATA_DIR, "tmp_restores")
_PRE_RESTORE_DIR = os.path.join(config.DATA_DIR, "pre_restore_backups")
# Tiempo que un backup subido queda esperando confirmación antes de descartarse.
_TOKEN_TTL_SEGUNDOS = 60 * 60


class BackupInvalido(Exception):
    pass


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _snapshot_db_bytes() -> bytes:
    """Copia consistente de la base viva usando la Online Backup API de SQLite:
    segura aunque haya escrituras concurrentes (a diferencia de copiar el
    archivo .db a mano, que podría capturar una transacción a medio escribir)."""
    fd, tmp_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        src = sqlite3.connect(config.DB_PATH)
        dst = sqlite3.connect(tmp_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        os.remove(tmp_path)


def _resumen_contenidos(conn: sqlite3.Connection) -> dict:
    tablas = ["motores", "servicios", "clientes", "presupuestos", "crac_repuestos"]
    resumen = {}
    for tabla in tablas:
        try:
            resumen[tabla] = conn.execute(f"SELECT COUNT(*) FROM {tabla}").fetchone()[0]
        except sqlite3.OperationalError:
            resumen[tabla] = 0
    return resumen


def _listar_pdfs() -> list[str]:
    if not os.path.isdir(config.PDFS_DIR):
        return []
    return sorted(f for f in os.listdir(config.PDFS_DIR) if f.lower().endswith(".pdf"))


def crear_backup_zip() -> tuple[io.BytesIO, str]:
    """Genera el .zip de copia de seguridad completo en memoria."""
    db_bytes = _snapshot_db_bytes()

    conn = sqlite3.connect(config.DB_PATH)
    try:
        resumen = _resumen_contenidos(conn)
    finally:
        conn.close()

    pdfs = _listar_pdfs()
    manifest = {
        "version": MANIFEST_VERSION,
        "creado": datetime.now().isoformat(timespec="seconds"),
        "db_sha256": _sha256_bytes(db_bytes),
        "resumen": resumen,
        "pdfs": [],
    }

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("presupuestos.db", db_bytes)
        for nombre in pdfs:
            path = os.path.join(config.PDFS_DIR, nombre)
            manifest["pdfs"].append({"nombre": nombre, "sha256": _sha256_file(path)})
            zf.write(path, arcname=f"pdfs/{nombre}")
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

    buffer.seek(0)
    nombre_zip = f"backup-rectificadora-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
    return buffer, nombre_zip


def _limpiar_restores_vencidos():
    if not os.path.isdir(_RESTORES_DIR):
        return
    ahora = time.time()
    for nombre in os.listdir(_RESTORES_DIR):
        path = os.path.join(_RESTORES_DIR, nombre)
        try:
            if ahora - os.path.getmtime(path) > _TOKEN_TTL_SEGUNDOS:
                os.remove(path)
        except OSError:
            pass


def analizar_backup(archivo_stream) -> dict:
    """
    Lee el .zip subido sin aplicar ningún cambio todavía: guarda una copia
    temporal (identificada por un token) y devuelve un resumen comparando
    contra el estado actual, para que el usuario confirme antes de restaurar
    de verdad (ver restaurar_backup).
    """
    os.makedirs(_RESTORES_DIR, exist_ok=True)
    _limpiar_restores_vencidos()

    token = uuid.uuid4().hex
    tmp_path = os.path.join(_RESTORES_DIR, f"{token}.zip")
    archivo_stream.save(tmp_path)

    try:
        with zipfile.ZipFile(tmp_path) as zf:
            namelist = zf.namelist()
            if "manifest.json" not in namelist:
                raise BackupInvalido("El archivo no es una copia de seguridad válida (falta manifest.json).")
            if "presupuestos.db" not in namelist:
                raise BackupInvalido("El archivo no es una copia de seguridad válida (falta presupuestos.db).")
            manifest = json.loads(zf.read("manifest.json"))
    except zipfile.BadZipFile:
        raise BackupInvalido("El archivo no es un .zip válido.")
    except BackupInvalido:
        os.remove(tmp_path)
        raise
    except Exception:
        os.remove(tmp_path)
        raise BackupInvalido("No se pudo leer el archivo como copia de seguridad.")

    # Ojo: comparar contra un hash del archivo .db crudo daría falsos "distinta"
    # todo el tiempo — sqlite3.Connection.backup() no produce bytes idénticos al
    # archivo fuente (difiere el freelist/layout de páginas) aunque el contenido
    # lógico sea el mismo. Por eso el hash "actual" se calcula con el mismo
    # snapshot method que generó db_sha256 en el manifest, para que sea comparable.
    db_actual_hash = _sha256_bytes(_snapshot_db_bytes()) if os.path.exists(config.DB_PATH) else None
    db_identica = bool(manifest.get("db_sha256")) and manifest.get("db_sha256") == db_actual_hash

    pdfs_nuevos = []
    pdfs_actualizados = []
    pdfs_sin_cambios = 0
    for item in manifest.get("pdfs", []):
        nombre = item.get("nombre")
        path_local = os.path.join(config.PDFS_DIR, nombre) if nombre else None
        if not nombre:
            continue
        if not os.path.exists(path_local):
            pdfs_nuevos.append(nombre)
        elif _sha256_file(path_local) != item.get("sha256"):
            pdfs_actualizados.append(nombre)
        else:
            pdfs_sin_cambios += 1

    ya_cargada = db_identica and not pdfs_nuevos and not pdfs_actualizados

    resumen_actual = {}
    if os.path.exists(config.DB_PATH):
        conn = sqlite3.connect(config.DB_PATH)
        try:
            resumen_actual = _resumen_contenidos(conn)
        finally:
            conn.close()

    if ya_cargada:
        # No hace falta mantener el temporal ni ofrecer confirmar nada.
        os.remove(tmp_path)
        token = None

    return {
        "token": token,
        "ya_cargada": ya_cargada,
        "creado": manifest.get("creado"),
        "db_identica": db_identica,
        "resumen_backup": manifest.get("resumen", {}),
        "resumen_actual": resumen_actual,
        "pdfs_nuevos": pdfs_nuevos,
        "pdfs_actualizados": pdfs_actualizados,
        "pdfs_sin_cambios": pdfs_sin_cambios,
    }


def restaurar_backup(token: str) -> dict:
    """Aplica de verdad el backup identificado por `token` (generado por
    analizar_backup). Antes de sobrescribir, guarda una copia de seguridad
    del estado actual por si hace falta deshacer la restauración."""
    if not token or any(c not in "0123456789abcdef" for c in token):
        raise BackupInvalido("Token inválido.")
    tmp_path = os.path.join(_RESTORES_DIR, f"{token}.zip")
    if not os.path.exists(tmp_path):
        raise BackupInvalido("La copia de seguridad expiró o ya fue usada. Volvé a cargar el archivo.")

    os.makedirs(_PRE_RESTORE_DIR, exist_ok=True)
    if os.path.exists(config.DB_PATH):
        pre_buffer, _ = crear_backup_zip()
        pre_nombre = f"pre-restore-{datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
        with open(os.path.join(_PRE_RESTORE_DIR, pre_nombre), "wb") as f:
            f.write(pre_buffer.getvalue())

    with zipfile.ZipFile(tmp_path) as zf:
        manifest = json.loads(zf.read("manifest.json"))

        os.makedirs(config.PDFS_DIR, exist_ok=True)
        fd, tmp_db_path = tempfile.mkstemp(suffix=".db", dir=config.DATA_DIR)
        os.close(fd)
        with open(tmp_db_path, "wb") as f:
            f.write(zf.read("presupuestos.db"))
        os.replace(tmp_db_path, config.DB_PATH)

        pdfs_agregados = 0
        pdfs_actualizados = 0
        for item in manifest.get("pdfs", []):
            nombre = item.get("nombre")
            if not nombre:
                continue
            destino = os.path.join(config.PDFS_DIR, nombre)
            existia = os.path.exists(destino)
            if existia and _sha256_file(destino) == item.get("sha256"):
                continue
            with zf.open(f"pdfs/{nombre}") as origen, open(destino, "wb") as out:
                shutil.copyfileobj(origen, out)
            if existia:
                pdfs_actualizados += 1
            else:
                pdfs_agregados += 1

    db.init_db()  # aplica migraciones automáticas si el backup viene de un esquema viejo
    os.remove(tmp_path)

    conn = sqlite3.connect(config.DB_PATH)
    try:
        resumen = _resumen_contenidos(conn)
    finally:
        conn.close()

    return {
        "pdfs_agregados": pdfs_agregados,
        "pdfs_actualizados": pdfs_actualizados,
        "resumen": resumen,
    }
