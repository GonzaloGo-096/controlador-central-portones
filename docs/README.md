# Controlador Central de Portones

## 📌 Descripción general

Este proyecto es el **cerebro central** de un sistema de control de portones automáticos basado en eventos.

No controla hardware directamente.  
No depende de Telegram.  
No depende de una placa específica.

Su única responsabilidad es:
- recibir eventos
- decidir qué debe pasar
- publicar comandos

---

## 🎯 Objetivo del sistema

Centralizar la lógica de negocio que gobierna uno o múltiples portones automáticos, permitiendo:

- Control desde Telegram, web o app
- Comunicación desacoplada vía MQTT
- Escalabilidad a múltiples portones (múltiples ESP32)
- Seguridad, trazabilidad y control de estado

---

## 🧠 Principio fundamental

El sistema está basado en una **Máquina de Estados Finitos (FSM)**.

Un portón:
- NO responde a botones
- NO responde a órdenes directas

Responde a **EVENTOS**, y su reacción depende del **estado actual**.

Ejemplo:
- Evento: `PRESS`
- Estado actual: `CLOSED`
- Resultado: `OPENING`

---

## 🧩 Estados posibles del portón

- `CLOSED` → completamente cerrado
- `OPENING` → abriendo
- `OPEN` → completamente abierto
- `CLOSING` → cerrando
- `STOPPED` → detenido a mitad de recorrido
- `ERROR` → fallo detectado

Un portón siempre está en **un solo estado**.

---

## ⚡ Eventos posibles

Los eventos representan **cosas que pasaron**, no acciones.

- `PRESS` → solicitud de acción (Telegram / Web)
- `SENSOR_OPEN` → sensor detecta portón abierto
- `SENSOR_CLOSED` → sensor detecta portón cerrado
- `ERROR_DETECTED`
- `RESET`

---

## 🧠 Arquitectura general

```
[ Usuario / Telegram / Web ]
|
v
API de Eventos (HTTP)
|
v
Máquina de Estados
|
v
Publicación MQTT
|
v
ESP32 / Portón
```

---

## 🧱 Estructura del proyecto

controlador-central-portones/
├── README.md
├── src/
│   ├── index.js
│   ├── core/
│   │   └── stateMachine.js
│   ├── api/
│   │   └── events.controller.js
│   ├── mqtt/
│   │   └── mqttClient.js
│   └── config/
│       └── env.js
└── docs/

---

## 🧠 Responsabilidades por módulo

### src/core/stateMachine.js
- Define estados y eventos
- Contiene la tabla de transiciones
- Decide el próximo estado
- No habla con hardware
- No habla con Telegram

### src/api/events.controller.js
- Recibe eventos externos
- Valida datos
- Traduce solicitudes en eventos internos
- No contiene lógica de negocio

### src/mqtt/mqttClient.js
- Conexión con HiveMQ
- Publicación de comandos
- Recepción de estados/sensores
- No toma decisiones

### src/index.js
- Punto de arranque del sistema
- Inicializa módulos
- Orquesta dependencias

---

## 🌐 MQTT – Modelo de comunicación

MQTT se utiliza como **bus de eventos distribuido**.

Principios:
- Un backend central
- Múltiples portones
- Cada portón identificado por `portonId`

Ejemplo de topics:

```
portones/{portonId}/command
portones/{portonId}/status
```

El backend:
- Publica comandos
- Mantiene el estado lógico
- No ejecuta hardware

---

## 🧠 Autoridad del sistema

Este backend es la **única fuente de verdad** del estado del portón.

- El estado lógico vive aquí
- Las placas ESP32 solo ejecutan comandos
- Las placas reportan sensores, no decisiones
- Telegram y otros clientes solo emiten eventos

Nunca se debe duplicar lógica de estados en:
- firmware
- bots
- frontends

---

## 🔐 Seguridad

- Credenciales vía variables de entorno
- Ninguna clave se versiona
- El backend es la autoridad
- Las placas no deciden lógica

---

## 🚀 Deploy

Pensado para **Railway**.

Requisitos:
- Node.js
- Variables de entorno configuradas
- Acceso a HiveMQ

---

## 🚫 Qué NO hace este proyecto

- No controla motores directamente
- No reemplaza firmware de ESP32
- No depende de Telegram
- No contiene UI

---

## 🧭 Filosofía

- Arquitectura antes que hacks
- Claridad antes que velocidad
- Escalabilidad antes que soluciones rápidas

La lógica se diseña, no se improvisa.

---

## 📍 Estado del proyecto

- Arquitectura definida
- Estructura creada
- Implementación en progreso

---

## 📌 Próximos pasos

1. Implementar máquina de estados
2. Implementar cliente MQTT
3. Conectar backend de Telegram
4. Deploy inicial en Railway
5. Integración con ESP32