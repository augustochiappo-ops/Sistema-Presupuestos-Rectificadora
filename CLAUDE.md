# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Sistema de Presupuestos para una **rectificadora de motores**. Permite generar presupuestos semiautomáticos seleccionando un motor, que el sistema calcule repuestos + mano de obra, y emita un PDF. Corre **100% local**, sin dependencia de servicios en la nube.

## Commands

```bash
# Instalar dependencias
pip install -r requirements.txt

# Ejecutar la app
python main.py

# Dependencias principales
# PyQt6        → UI de escritorio
# pandas       → lectura del Excel del proveedor
# reportlab    → generación de PDF
# SQLite3      → base de datos local (incluido en Python stdlib)
```

## Domain concepts

| Término | Descripción |
|---|---|
| Rectificadora | Taller de rectificación de motores (engine reconditioning shop) |
| Cámara de Rectificadores | Entidad gremial que publica la lista oficial de precios de mano de obra y los motores soportados. Actualización semanal o quincenal. |
| Proveedor | Empresa que envía **diariamente** un archivo Excel con precios de repuestos |
| Motor | Unidad central del presupuesto; se selecciona de la lista de la Cámara |
| Repuesto | Pieza asociada a un motor; tiene un código del proveedor y un precio del Excel diario |
| Asociación motor–repuesto | Vínculo guardado en la base de datos interna: una vez que se asigna un código de repuesto a un motor, queda guardado para futuros presupuestos |

## Data sources (external)

1. **Lista de la Cámara de Rectificadores** — fuente de: lista de motores disponibles + precios de mano de obra por operación. Se importa/actualiza periódicamente.
2. **Excel del Proveedor** — fuente de: precios actuales de repuestos (se reemplaza diariamente). El sistema lee este archivo para obtener el precio al momento de armar el presupuesto.

## Core features (full vision)

- **Selección de motor**: desplegable/buscador con todos los motores de la Cámara.
- **Cálculo automático**: al elegir el motor se consultan la lista de la Cámara (mano de obra) y el Excel del proveedor (repuestos asociados al motor).
- **Buscador de repuestos**: ícono de lupa en cada ítem (ej. "válvulas") que abre una interfaz de búsqueda dentro del catálogo del proveedor. El código elegido queda guardado asociado al motor para próximos presupuestos.
- **Edición post-creación**: los presupuestos se pueden modificar después de generados.
- **Historial de clientes**: cada presupuesto queda vinculado a un cliente (nombre + motor + fecha).
- **Generación de PDF**: presupuesto formal con nombre del cliente, motor, fecha y leyenda de validez de 1 semana.

## Skills disponibles para el desarrollo

Estas skills deben usarse **proactivamente** cuando la tarea corresponda a su especialidad. No esperar a que el usuario las pida.

| Skill | Cuándo usarla |
|---|---|
| `engineering:architecture` | Al diseñar la estructura general del sistema o de un módulo nuevo |
| `engineering:system-design` | Al diseñar componentes específicos (base de datos, importación de Excel, generación de PDF) |
| `engineering:code-review` | Al revisar código antes de darlo por terminado |
| `engineering:testing-strategy` | Al definir cómo testear un módulo o feature |
| `engineering:tech-debt` | Al detectar problemas de diseño o deuda técnica acumulada |
| `engineering:debug` | Al diagnosticar errores difíciles de rastrear |
| `engineering:deploy-checklist` | Al preparar una versión para entregar al usuario final |
| `design:design-system` | Al definir la paleta visual, tipografía y componentes PyQt6 reutilizables |
| `design:ux-copy` | Al redactar textos de la interfaz: botones, labels, mensajes de error, tooltips |
| `design:accessibility-review` | Al revisar que la UI sea clara y usable |
| `design:design-critique` | Al evaluar decisiones de UI/UX antes de implementarlas |

## Architecture notes

- **Local-first**: toda la lógica y el almacenamiento son locales. Sin backend remoto.
- **Base de datos interna**: persiste las asociaciones motor → repuestos (códigos del proveedor). Se va enriqueciendo a medida que se usan presupuestos.
- **Actualización de precios**: el sistema debe poder reimportar la lista de la Cámara y el Excel del proveedor sin perder las asociaciones guardadas.
- **Stack**: Python + PyQt6 para la UI de escritorio. pandas para leer el Excel del proveedor. reportlab (o similar) para generar PDF. SQLite como base de datos local.
