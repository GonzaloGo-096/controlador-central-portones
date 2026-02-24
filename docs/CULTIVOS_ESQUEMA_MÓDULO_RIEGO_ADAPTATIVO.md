# Módulo Cultivos – Esquema y relaciones (riego adaptativo por maceta)

**Versión:** 1.1  
**Fecha:** 24 de febrero de 2025  
**Migración correctiva:** 20260224130000_cultivos_estructura_correctiva

---

## 1. Esquema de tablas

| Tabla | PK | Descripción |
|-------|-----|-------------|
| **cultivos** | `id` (SERIAL) | Cultivo por cuenta; ya existente. Conserva PK entera por compatibilidad con Account. |
| **macetas** | `id` (UUID) | Maceta perteneciente a un cultivo. |
| **sensores_lecturas** | `id` (UUID) | Lecturas de sensores (humedad, temperatura, etc.) por maceta. |
| **riegos** | `id` (UUID) | Eventos de riego ejecutado por maceta. |
| **parametros_riego** | `id` (UUID) | Parámetros de riego versionados por maceta. |
| **adaptaciones** | `id` (UUID) | Historial de recalibraciones/ajustes por maceta. |
| **logs_sistema** | `id` (UUID) | Logs de sistema con contexto JSONB; `maceta_id` opcional. |

### 1.1 Columnas por tabla

**cultivos** (existente)
- `id` SERIAL PRIMARY KEY
- `account_id` INT NOT NULL → accounts(id)
- `nombre`, `descripcion`, `is_active`, `created_at`, `updated_at`, `deleted_at`

**macetas**
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `cultivo_id` INT NOT NULL → cultivos(id)
- `nombre` TEXT NOT NULL, `identificador` TEXT
- `is_active` BOOLEAN DEFAULT true
- `created_at`, `updated_at` TIMESTAMP(3)

**sensores_lecturas**
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `maceta_id` UUID NOT NULL → macetas(id)
- `humedad`, `temperatura`, `ec` DOUBLE PRECISION (opcionales)
- `extras` JSONB (opcional)
- `created_at` TIMESTAMP(3)

**riegos**
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `maceta_id` UUID NOT NULL → macetas(id)
- `volumen_ml` INT NOT NULL, `ejecutado_at` TIMESTAMP(3) NOT NULL
- `created_at` TIMESTAMP(3)

**parametros_riego**
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `maceta_id` UUID NOT NULL → macetas(id)
- `version` INT DEFAULT 1
- `humedad_objetivo_min`, `humedad_objetivo_max` DOUBLE PRECISION
- `volumen_ml_base` INT
- `vigente_desde` TIMESTAMP(3) NOT NULL, `vigente_hasta` TIMESTAMP(3)
- `created_at`, `updated_at` TIMESTAMP(3)
- **Constraint:** UNIQUE (maceta_id) WHERE vigente_hasta IS NULL → solo un registro vigente por maceta

**adaptaciones**
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `maceta_id` UUID NOT NULL → macetas(id)
- `tipo` TEXT NOT NULL
- `parametros_anteriores`, `parametros_nuevos` JSONB
- `created_at` TIMESTAMP(3)

**logs_sistema**
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `nivel` TEXT NOT NULL, `mensaje` TEXT NOT NULL
- `contexto` JSONB
- `modulo` TEXT, `evento` TEXT (opcionales)
- `user_id` INT NULL, `cultivo_id` INT NULL, `ciclo_id` UUID NULL
- `maceta_id` UUID → macetas(id) (opcional)
- `created_at` TIMESTAMP(3)

---

## 2. Relaciones (foreign keys)

| Tabla origen | Columna | Tabla destino | onDelete | onUpdate |
|--------------|---------|---------------|----------|----------|
| cultivos | account_id | accounts | RESTRICT | CASCADE |
| macetas | cultivo_id | cultivos | RESTRICT | CASCADE |
| sensores_lecturas | maceta_id | macetas | RESTRICT | CASCADE |
| riegos | maceta_id | macetas | RESTRICT | CASCADE |
| parametros_riego | maceta_id | macetas | RESTRICT | CASCADE |
| adaptaciones | maceta_id | macetas | RESTRICT | CASCADE |
| logs_sistema | maceta_id | macetas | SET NULL | CASCADE |

- **RESTRICT:** no se puede borrar el padre si hay filas hijas (evita borrado en cascada sin control).
- **SET NULL** solo en `logs_sistema.maceta_id`: el log se conserva aunque se borre la maceta.

---

## 3. Índices creados

| Tabla | Índice | Columnas |
|-------|--------|----------|
| cultivos | idx_cultivos_account_id | (account_id) |
| macetas | idx_macetas_cultivo_id | (cultivo_id) |
| sensores_lecturas | idx_sensores_lecturas_maceta_created_at_desc | (maceta_id, created_at DESC) |
| riegos | idx_riegos_maceta_id | (maceta_id) |
| riegos | idx_riegos_ejecutado_at | (ejecutado_at) |
| parametros_riego | idx_parametros_riego_maceta_id | (maceta_id) |
| parametros_riego | idx_parametros_riego_vigente | (maceta_id, vigente_desde) |
| parametros_riego | uq_parametros_riego_vigente_por_maceta | UNIQUE (maceta_id) WHERE vigente_hasta IS NULL |
| adaptaciones | idx_adaptaciones_maceta_id | (maceta_id) |
| adaptaciones | idx_adaptaciones_created_at | (created_at) |
| logs_sistema | idx_logs_sistema_maceta_id | (maceta_id) |
| logs_sistema | idx_logs_sistema_created_at | (created_at) |
| logs_sistema | idx_logs_sistema_nivel | (nivel) |
| logs_sistema | idx_logs_sistema_modulo | (modulo) |
| logs_sistema | idx_logs_sistema_evento | (evento) |
| logs_sistema | idx_logs_sistema_user_id | (user_id) |
| logs_sistema | idx_logs_sistema_cultivo_id | (cultivo_id) |

---

## 4. Diagrama textual de relaciones

```
accounts
    │
    │ 1:N (account_id)
    ▼
cultivos
    │
    │ 1:N (cultivo_id)
    ▼
macetas ◄──────────────────────────────────────────────────────────────┐
    │                                                                   │
    ├── 1:N (maceta_id) ──► sensores_lecturas                          │
    │                                                                   │
    ├── 1:N (maceta_id) ──► riegos                                     │
    │                                                                   │
    ├── 1:N (maceta_id) ──► parametros_riego                           │
    │                                                                   │
    ├── 1:N (maceta_id) ──► adaptaciones                               │
    │                                                                   │
    └── 0:N (maceta_id, opcional) ──► logs_sistema ────────────────────┘
```

**Leyenda**
- Todas las tablas hijas de `macetas` tienen índice por `maceta_id` para consultas por maceta.
- `logs_sistema.contexto` es JSONB para contexto flexible (eventId, identityId, payload, etc.).
- Sin borrado en cascada: eliminación de cultivo o maceta debe hacerse con control (previo borrado o restricción de hijos).

---

## 5. Migraciones

Cada tabla tiene su migración en `prisma/migrations/`:

| Migración | Tabla |
|-----------|--------|
| 20260224120001_cultivos_macetas | macetas |
| 20260224120002_cultivos_sensores_lecturas | sensores_lecturas |
| 20260224120003_cultivos_riegos | riegos |
| 20260224120004_cultivos_parametros_riego | parametros_riego |
| 20260224120005_cultivos_adaptaciones | adaptaciones |
| 20260224120006_cultivos_logs_sistema | logs_sistema |
| **20260224130000_cultivos_estructura_correctiva** | sensores_lecturas, parametros_riego, logs_sistema (columnas e índices) |

La tabla **cultivos** ya existe (creada en migración anterior); no se modifica su PK.

---

## 6. Seeds

El seed en `prisma/seed.js` incluye datos mínimos para testing del módulo cultivos:

- 1 cultivo (asociado a la cuenta del seed).
- 1 maceta asociada al cultivo.
- 1 fila en parametros_riego (version 1, humedad 30–70 %, volumen base 150 ml).
- 1 lectura de sensor (humedad 45.5 %).
- 1 riego (120 ml, ejecutado_at = ahora).
- 1 adaptación (tipo recalibracion_inicial).
- 1 log_sistema (nivel info, contexto JSON con modulo, macetaId, cultivoId).

Orden de borrado en el seed: hijos antes que padres (logs_sistema → … → macetas → cultivos).
