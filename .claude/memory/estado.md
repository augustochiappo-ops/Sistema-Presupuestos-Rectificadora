# Estado del proyecto

## Fase actual
**Desarrollo activo** — scaffold completo corriendo. Próximo paso: módulo de Presupuestos.

## Completado
- [x] CLAUDE.md con visión completa del sistema, dominio, fuentes de datos y features
- [x] Stack tecnológico definido: Python + PyQt6 + pandas + reportlab + SQLite3
- [x] Repositorio git inicializado
- [x] .gitignore configurado
- [x] Excel de FACRA disponibles en `Excel/Facra/`
- [x] Skills de engineering y design configuradas para uso proactivo
- [x] Sistema de memoria local del proyecto creado
- [x] **Scaffold completo del proyecto** (commit `21024a0`)
  - `main.py` — punto de entrada
  - `requirements.txt` — PyQt6, pandas, xlrd, openpyxl, reportlab
  - `src/data/db.py` — SQLite: init, migración automática de columnas
  - `src/data/facra.py` — parser FACRA + consultas
  - `src/ui/styles.py` — design tokens centralizados
  - `src/ui/main_window.py` — ventana principal con sidebar
  - `src/ui/motores_widget.py` — listado de motores
  - `src/ui/actualizar_widget.py` — importación de Excel
  - `src/ui/presupuestos_widget.py` — placeholder con botón "Nuevo"
  - `src/ui/placeholder_widget.py` — placeholder genérico
- [x] **Listado de Motores funcionando:**
  - Filtro por marca (panel izquierdo)
  - Buscador en tiempo real con debounce
  - Tabla con columnas: Código, Motor, Marca, Cilindrada, Tipo, Cilindros, Diámetro cil., Lista Nº, Origen
  - Ordenamiento por clic en encabezado (toggle asc/desc), numérico correcto
  - Columnas redimensionables individualmente
  - Columna Motor se expande automáticamente para llenar el ancho disponible
  - Se carga solo una vez por sesión (flag `_cargado`)
- [x] **Actualizar Excel funcionando:**
  - Importación de nomenclador FACRA (491 motores)
  - Importación de lista orientadora FACRA (235 servicios)
  - Botones CRAC deshabilitados (para más adelante)
  - Importación en hilo separado (no bloquea la UI)
  - Señal `datos_actualizados` recarga el listado de motores automáticamente
- [x] **Parser de descripciones FACRA** extrae:
  - `marca` — primera palabra
  - `cilindros` — patrón `*NCIL*`
  - `tipo` — NAFTA / DIESEL / TURBO DIESEL
  - `cilindrada` — NNNNcc o N.NL
  - `diametro` — valor antes de `mm` al final de la descripción
- [x] **Base de datos SQLite** con tablas: motores, servicios, clientes, presupuestos, presupuesto_items
- [x] **Migración automática** de columnas nuevas (ALTER TABLE si no existen)

## Pendiente
- [ ] **Módulo Presupuestos** (próximo paso principal)
  - Historial de presupuestos en tabla
  - Formulario: cliente, fecha, selector de motor (con buscador)
  - Botón "+" para crear motor manual si no está en FACRA
  - Lista de servicios con checkboxes + precios de la lista del motor
  - Total calculado automático
  - Generación de PDF
- [ ] Módulo Clientes (CRUD)
- [ ] Módulo Editar Precios (factor de ajuste sobre lista FACRA)
- [ ] Buscador de repuestos CRAC (cuando se habilite)

## Próximo paso
Construir el módulo de Presupuestos: formulario de creación → selector de motor → servicios → PDF.

## Para correr el programa
```
cd "C:\Users\Usuario\Documents\Sistema de Presupuestos"
pip install -r requirements.txt   # solo la primera vez
python main.py
```

## Archivos de datos disponibles
- `Excel/Facra/nomenclador_1779985703.xls` — nomenclador de motores FACRA
- `Excel/Facra/lista_orientadora_de_mano_de_obra_1779985697.xls` — precios de mano de obra FACRA
