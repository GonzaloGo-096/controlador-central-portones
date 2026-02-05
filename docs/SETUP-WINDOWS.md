# Setup en Windows

Pasos para dejar el proyecto listo y ejecutar `npm start` sin errores.

## 1. Limpiar node_modules trackeados por Git

Si `node_modules` fue agregado a Git por error:

```powershell
git rm -r --cached node_modules
git commit -m "Remove node_modules from tracking"
```

## 2. Crear archivo .env

Copiá el ejemplo y completá las variables:

```powershell
copy .env.example .env
```

Editá `.env` y asegurate de tener al menos:

```
MQTT_BROKER_URL=mqtt://broker.hivemq.com
MQTT_CLIENT_ID=controlador-local
```

## 3. Instalar dependencias

```powershell
npm install
```

## 4. Ejecutar el proyecto

```powershell
npm start
```

Para desarrollo con recarga automática:

```powershell
npm run dev
```

## Resultado esperado

```
🚀 Controlador Central de Portones iniciado
📡 MQTT conectado al broker
📥 Suscrito a portones/+/status
```

Ctrl+C para detener.
