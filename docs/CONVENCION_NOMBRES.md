# Convención de nombres

## Regla general
- **Dominio de negocio (modules/)**: Español — `portones`, `grupos_portones`, `cultivos`, `usuarios`, `eventos_porton`
- **Infraestructura y shared**: Inglés — `identity`, `auth`, `gateAccess`, `scope`, `mqttBridge`

## Excepciones
- **auth.types (USER_ROLES)**: Valores en español (`superadministrador`, `administrador_cuenta`, `operador`) por compatibilidad con JWT
- **Prisma/DB**: Enums en inglés (`SUPERADMIN`, `ADMIN`, `OPERATOR`) — mapeo en auth.service
- **Rutas API**: Español con guiones — `/api/grupos-portones`, `/api/eventos-porton`
