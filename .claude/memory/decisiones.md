# Decisiones técnicas y de diseño

## Stack tecnológico
**Decisión:** Python + PyQt6 + pandas + reportlab + SQLite3  
**Por qué:** el sistema corre 100% local en Windows. PyQt6 permite UI de escritorio nativa. pandas es ideal para leer los Excel diarios del proveedor. SQLite no requiere instalación de servidor. reportlab genera PDFs programáticamente.  
**Fecha:** 2026-05-28

## Ejecución local
**Decisión:** app de escritorio, sin servidor web, sin dependencias cloud.  
**Por qué:** el usuario opera en un taller. No depende de internet. Los datos son locales y privados.  
**Fecha:** 2026-05-28

## Gestión de versiones de datos externos
**Decisión:** los Excel de la Cámara (CRAC/FACRA) se versionan en git. El Excel diario del proveedor NO se versiona (cambia todos los días, se excluye con .gitignore).  
**Por qué:** los archivos de la Cámara son actualizaciones periódicas relevantes de rastrear. El del proveedor es un archivo operativo que se reemplaza diariamente.  
**Fecha:** 2026-05-28
