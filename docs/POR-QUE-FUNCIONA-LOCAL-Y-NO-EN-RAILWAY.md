# Por qué funciona local y no desplegado en Railway

Cuando el backend anda en tu PC pero en Railway falla (500, “connection refused”, o el bot no muestra datos), casi siempre es **una de estas tres cosas**. Seguí los pasos en orden.

---

## 1. La causa más común: el backend en Railway no tiene `DATABASE_URL`

En tu PC tenés un archivo **`.env`** con `DB_HOST`, `DB_USER`, etc. (o `DATABASE_URL`). Ese archivo **no se sube a Railway** (y no debería, por seguridad). En Railway las variables se configuran **a mano en el panel**, por **servicio**.

- El servicio **PostgreSQL** de Railway ya tiene su propia `DATABASE_URL` (es la URL de esa base).
- El servicio de tu **backend (Node)** es **otro** servicio. Por defecto **no** tiene `DATABASE_URL`.
- Si el backend no tiene `DATABASE_URL`, el código usa `DB_HOST`, `DB_USER`, etc., que en Railway están **vacíos** → intenta conectar a `localhost:5432` → **falla**.

### Qué hacer (click a click)

1. Entrá a [Railway](https://railway.app) y abrí tu **proyecto**.
2. Clic en el servicio de tu **backend** (el que corre Node/Express), **no** en el de PostgreSQL.
3. Entrá a la pestaña **"Variables"** (o **Settings** → **Variables**).
4. Mirá si existe la variable **`DATABASE_URL`**.
   - **Si NO está:**
     1. Clic en **"New Variable"** / **"Add Variable"** / **"+ Add"**.
     2. **Nombre:** `DATABASE_URL` (exacto, mayúsculas).
     3. **Valor:** tenés que copiarlo del servicio de **PostgreSQL**:
         - Abrí **otra pestaña** o volvé atrás y entrá al servicio **PostgreSQL**.
         - En ese servicio, entrá a **Variables** (o **Connect**).
         - Ahí vas a ver **`DATABASE_URL`** (y a veces `DATABASE_PUBLIC_URL`).
         - **Copiá el valor completo** de `DATABASE_URL` (empieza con `postgresql://...`). Si hay una que dice **internal** o con `postgres.railway.internal`, preferí esa para el backend.
         - Volvé al servicio de tu **backend** → Variables → pegá ese valor en la variable `DATABASE_URL` que creaste.
     4. Guardá (Save / Deploy si te lo pide).
   - **Si SÍ está:** no la borres; si aun así falla, pasá al punto 2.
5. **Redeploy del backend:** en el servicio del backend, buscá **"Redeploy"** o **Deployments** → **Redeploy** y esperá a que termine.
6. Después de que arranque, probá de nuevo tu app o el endpoint de diagnóstico.

### Cómo comprobar que ya está bien

- En Railway, en el servicio del **backend**, abrí **"Deployments"** y entrá al último deploy. Abrí **"View Logs"** (logs del arranque).
- Buscá una línea que diga algo como:
  - **`DB pool: DATABASE_URL set → host: postgres.railway.internal`** (o similar) → bien, el backend está usando la base de Railway.
  - **`DB pool: DATABASE_URL no set → usando DB_* → host: (vacío)`** → mal: el backend **sigue sin** `DATABASE_URL`; repetí los pasos de arriba y asegurate de guardar y redeploy.

También podés llamar al endpoint de diagnóstico (si lo tenés desplegado):

- `GET https://TU-URL-DEL-BACKEND.up.railway.app/api/_prod_db_test`

Si responde `ok: true` y ves `tables` y `counts`, la conexión a la DB en Railway está bien.

---

## 2. Las tablas no existen en la base de Railway

Aunque el backend tenga `DATABASE_URL` correcta, si en esa base **no** creaste las tablas (`users`, `tenants`, `gates`), las consultas van a fallar.

### Qué hacer

1. En Railway, entrá al servicio **PostgreSQL**.
2. Abrí **"Query"** (o **Data** / **Connect** y usá la consola SQL que te den).
3. Ejecutá el contenido de **`scripts/schema.sql`** de este repo (o el SQL que usás para crear `users`, `tenants`, `gates`).
4. Verificá que existan esas tablas. Después probá de nuevo el backend.

Si llamás a **`/api/_prod_db_test`** y falla con `step: "list_tables"` o `step: "count_users"` (o similar), suele ser por tablas faltantes o permisos; crear el schema corrige lo primero.

---

## 3. URL pública vs interna (menos frecuente)

En Railway a veces hay dos URLs de la base:

- **Interna:** tipo `postgres.railway.internal:5432` (solo desde dentro de Railway).
- **Pública:** tipo `caboose.proxy.rlwy.net:11919` (desde tu PC o desde fuera).

Para el **backend desplegado en Railway**, lo correcto es usar la URL **interna** (la que suele estar en `DATABASE_URL` del servicio Postgres cuando lo “conectás” al backend). Si en el backend pusiste a mano la URL **pública** y en tu región/proyecto Railway exige usar la interna, puede fallar. Solución: en Variables del **backend**, usá la **misma** `DATABASE_URL` que muestra el servicio **PostgreSQL** (la que no es “public” si hay dos).

---

## Resumen

| Dónde | Qué pasa |
|-------|----------|
| **Local** | Lee `.env` → `DB_HOST`/`DB_*` o `DATABASE_URL` → conecta a tu PC o a Railway. |
| **Railway** | No hay `.env`. Si el **servicio backend** no tiene **`DATABASE_URL`** en Variables → usa `DB_*` vacías → intenta `localhost` → **falla**. |

Pasos que casi siempre arreglan “funciona local y no en Railway”:

1. **Variables** del servicio **backend** en Railway → que exista **`DATABASE_URL`** (copiada del servicio PostgreSQL).
2. **Redeploy** del backend.
3. Revisar **logs** del backend y (si está desplegado) **`/api/_prod_db_test`** para confirmar conexión y tablas.

Si después de esto sigue fallando, con el mensaje exacto del log o la respuesta de `_prod_db_test` (incluido `step` y `error`) se puede acotar el problema al instante.
