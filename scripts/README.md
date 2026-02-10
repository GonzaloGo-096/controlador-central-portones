# Scripts de base de datos

## schema.sql — misma estructura en local y en Railway

Este archivo es la **única definición** del esquema (tablas e índices). Si lo ejecutás en tu base local y en la de Railway, las dos quedan **iguales**.

- **No se pierde nada:** el esquema está en el repo; no depende de “lo que hiciste a mano” en cada base.
- **Cómo saber que son iguales:** porque usás el mismo archivo en ambos lados.

### En tu PC (base local)

```bash
psql -U postgres -d portones_db -f scripts/schema.sql
```

(O abrís `schema.sql` en pgAdmin y lo ejecutás contra `portones_db`.)

### En Railway

1. Railway → servicio **PostgreSQL** → **Query** (o Connect con la URL pública).
2. Abrís `scripts/schema.sql` en el repo, copiás todo el contenido.
3. Pegás y ejecutás en la consola de Railway.

Así las configuraciones (tablas, columnas, índices) son las mismas en local y en Railway.
