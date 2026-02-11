# Si hiciste push y Railway sigue con 404 (código viejo)

## 1. Ver desde qué rama despliega Railway

- Railway → tu proyecto → servicio **backend** → **Settings**.
- Buscá **"Branch"** o **"Source"** / **"Build"**.
- Si dice `main` y vos pusheaste a otra rama, Railway no va a tomar los cambios. Hacé push a esa rama (o cambiá la rama en Settings).

## 2. Forzar un redeploy

- Railway → servicio **backend** → pestaña **Deployments**.
- En el último deployment, menú **⋮** (tres puntos) → **Redeploy**.
- O: **Settings** → **Redeploy** / **Deploy**.
- Esperá a que el estado pase a **Success** (verde).

## 3. Revisar que el build use el repo correcto

- En **Settings** del servicio, revisá **"Connected Repository"** (o similar).
- Tiene que ser tu repo y la rama que estás usando (ej. `main`).

## 4. Ver los logs del build

- **Deployments** → último deploy → **View Logs** (o **Build Logs**).
- Si el build falla, no se despliega código nuevo. Revisá que no haya error de `npm install` o que no falte `src/api/prodDbTest.js` en el commit.

## 5. Probar después del redeploy

Cuando el último deploy esté en verde:

- `https://controlador-central-portones-production.up.railway.app/api/_prod_db_test`  
  (debería responder JSON)
- `https://controlador-central-portones-production.up.railway.app/api/_prod_db_test?schema=1`  
  (schema de la DB)
- `https://controlador-central-portones-production.up.railway.app/api/_prod_schema`  
  (mismo schema)

Si después de un **Redeploy** manual seguís con 404, es posible que el servicio esté conectado a otra rama o a un commit anterior; en Settings fijá la rama y el último commit que muestra Railway.
