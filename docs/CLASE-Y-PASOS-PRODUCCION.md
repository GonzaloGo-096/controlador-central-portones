# Clase: bases de datos y producción (paso a paso)

---

## PARTE 1 — La clase (qué es cada cosa)

### ¿Qué es PostgreSQL?

**PostgreSQL** es un programa que guarda datos (usuarios, tenants, gates, etc.). Ese programa puede estar instalado en **diferentes lugares**.

### ¿Dónde está “la base de datos” con la que veníamos trabajando?

En **tu PC**.

- Instalaste PostgreSQL en tu computadora.
- Creaste una base que se llama **portones_db**.
- Ahí creaste las tablas **users**, **tenants**, **gates**.
- Tu backend, cuando lo corrés con `node src/index.js` en tu PC, se conecta a **esa** base (localhost, portones_db).

Eso es “donde veníamos trabajando”: **Postgres en tu PC + base portones_db**.

### ¿Por qué en Railway “creamos una nueva” base?

Porque **Railway no es tu PC**.

- Cuando hacés “deploy”, el **código** del backend corre en los **servidores de Railway** (en la nube).
- Esos servidores **no pueden** conectarse a tu casa: no ven tu “localhost”, no ven tu portones_db.
- Por eso Railway te ofrece **su propio** PostgreSQL: una base que está **en la nube**, al lado de tu backend. Así el backend en Railway tiene una base a la que sí puede conectarse.

Resumen:

| Dónde corre el backend | Dónde está la base de datos | Nombre de la base |
|------------------------|-----------------------------|--------------------|
| En **tu PC** (local)    | En **tu PC** (Postgres instalado ahí) | **portones_db** |
| En **Railway** (producción) | En **Railway** (Postgres de Railway) | **railway** |

Son **dos bases distintas**. La de tu PC solo la usa el backend cuando corre en tu PC. La de Railway solo la usa el backend cuando corre en Railway.

### ¿Para qué sirve entonces la aplicación Postgres en tu PC?

Para **desarrollar y probar en local**:

- Trabajás en tu código.
- Probás con `node src/index.js` + `node testBackend.js`.
- Todo usa la base de tu PC (portones_db). No gastás ni tocás producción.

Cuando querés que el **bot de Telegram** (y cualquier persona) use el sistema, el backend tiene que estar **en Internet** (Railway) y hablar con una base **también en Internet** (la de Railway). Por eso hace falta la base en Railway.

### Si ya funciona en local, ¿qué falta para producción?

1. Que el **backend** esté desplegado en Railway (ya lo tenés).
2. Que la **base de Railway** tenga las **mismas tablas** que portones_db (users, tenants, gates).
3. Que el backend en Railway tenga la variable **DATABASE_URL** apuntando a esa base (ya lo configuraste).
4. (Opcional) Poner **datos de prueba** en la base de Railway (un usuario con tu telegram_id, un tenant, un gate) para probar con Telegram.

Cuando eso esté, en producción vas a poder probar con Telegram incluido.

---

## PARTE 2 — Click a click: que funcione en producción

Seguí estos pasos en orden. No saltees.

---

### Paso 1 — Entrar a Railway

1. Abrí el navegador y andá a **https://railway.app**
2. Iniciá sesión.
3. Entrá al **proyecto** donde está tu backend (controlador-central-portones).

---

### Paso 2 — Ver que tengas dos “servicios”

En el proyecto deberías ver algo como:

- Un servicio que es tu **app** (backend Node).
- Un servicio que es **PostgreSQL** (base de datos).

Si no tenés el de PostgreSQL:

- Clic en **"+ New"** (o "Add Service").
- Elegí **"Database"** → **"PostgreSQL"**.
- Railway crea la base. Después tenés que conectar el backend a ella (Paso 4).

---

### Paso 3 — Crear las tablas en la base de Railway

La base de Railway viene vacía. Hay que crear las mismas tablas que en tu PC.

1. En Railway, hacé clic en el servicio **PostgreSQL** (el de la base de datos).
2. Buscá la pestaña **"Data"** o **"Query"** (o un botón **"Connect"** que te lleve a una consola SQL).
3. Si hay **"Query"** o un cuadro de texto para escribir SQL:
   - Abrí en tu PC el archivo del repo: **`scripts/schema.sql`**.
   - Copiá **todo** el contenido.
   - Pegalo en ese cuadro de Railway.
   - Ejecutá (botón **Run** / **Execute** / **▶**).
4. Si no hay Query pero sí **"Connect"**:
   - Railway te muestra una **URL** (DATABASE_PUBLIC_URL).
   - Con esa URL podés conectarte desde **pgAdmin** o **DBeaver** desde tu PC a la base de Railway.
   - En pgAdmin/DBeaver: nueva conexión con esa URL, luego abrís un “Query tool” y pegás el contenido de **`scripts/schema.sql`** y ejecutás.

Cuando termine sin error, la base de Railway ya tiene las tablas **users**, **tenants**, **gates** (igual que en tu PC).

---

### Paso 4 — Conectar el backend a la base en Railway

El backend en Railway tiene que “saber” la dirección de la base.

1. En Railway, hacé clic en el servicio de tu **backend** (el de Node), no en el de Postgres.
2. Entrá a **"Variables"** (o **Settings** → **Variables**).
3. Verificá que exista la variable **DATABASE_URL**.
   - Si **no** está: **"New Variable"** / **"Add Variable"**.
     - Nombre: `DATABASE_URL`
     - Valor: copiá la **DATABASE_URL** del servicio **PostgreSQL** (en Railway, entrá al servicio Postgres y en Variables verás DATABASE_URL; copiá ese valor).
   - Si **sí** está: no hace falta cambiarla.
4. Guardá.

Así el backend en Railway usa la base de Railway.

---

### Paso 5 — (Opcional) Datos de prueba en Railway

Para que el bot de Telegram te muestre algo, en la base de Railway tiene que haber al menos un usuario con tu **telegram_id** y un tenant con un gate.

En la misma consola **Query** de Railway (o en pgAdmin conectado a Railway), ejecutá **una sola vez** (cambiá el telegram_id por el tuyo si es distinto):

```sql
INSERT INTO users (full_name, telegram_id) VALUES ('Yo', '1837694465');
INSERT INTO tenants (name, user_id) VALUES ('Mi edificio', 1);
INSERT INTO gates (name, tenant_id) VALUES ('Portón principal', 1);
```

Si ya tenés usuarios/tenants/gates, los `user_id` y `tenant_id` tienen que coincidir (1, 1 como en el ejemplo; si no, ajustá los números).

---

### Paso 6 — Redeploy del backend

Para que el backend tome la variable y use la base:

1. Volvé al servicio del **backend** en Railway.
2. Buscá **"Redeploy"** o **"Deploy"** (o la pestaña **Deployments** y un botón para desplegar de nuevo).
3. Ejecutá el redeploy y esperá a que termine en verde.

---

### Paso 7 — Probar que producción funciona

1. En Railway, en el servicio del backend, buscá la **URL pública** del backend (ej. `https://controlador-central-portones-production.up.railway.app`).
2. En el navegador o con un script probá:
   - `https://TU-URL/api/ping`  
     Debería responder algo como: `{"ok":true,"service":"controlador-portones"}`.
   - `https://TU-URL/api/telegram/tenants?telegram_id=1837694465`  
     Debería responder JSON con `tenants` (lista, puede ser vacía o con el tenant que insertaste).

Si eso anda, **producción está funcionando**. Después podés probar con el bot de Telegram apuntando a esa URL.

---

## Resumen en una frase

- **Postgres en tu PC** = donde venías trabajando (local).
- **Postgres en Railway** = la base que usa el backend cuando está en producción; no es la de tu PC.
- Para que funcione en producción: **mismas tablas** en Railway (con `scripts/schema.sql`), **DATABASE_URL** en el backend, **redeploy**, y opcionalmente **datos de prueba** en Railway. Después probás con Telegram apuntando a la URL del backend en Railway.

Cuando termines estos pasos, si algo no sale como en la guía, decime en qué paso estás y qué ves en pantalla y lo afinamos.
