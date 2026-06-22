# Hive Boost Bot

Bot de votación automática para Hive. Los usuarios pagan HIVE/HBD y reciben votos en sus posts.

## Requisitos

- Node.js 18+
- Una cuenta en Hive con HP (Hive Power) delegado
- Claves posting y active de la cuenta

## Instalación

```bash
npm install
cp .env.example .env
# Editar .env con tus datos
```

## Configuración

Editar `.env`:

| Variable | Descripción |
|---|---|
| `BOT_USERNAME` | Cuenta Hive del bot |
| `BOT_POSTING_KEY` | Private posting key |
| `BOT_ACTIVE_KEY` | Private active key |
| `PORT` | Puerto web (default 3000) |
| `BOOST_MULTIPLIER` | Multiplicador de retorno estimado |
| `MAX_VOTES_PER_DAY` | Límite diario de votos |
| `PACKAGES` | Paquetes: nombre:monto:peso_voto |

## Uso

```bash
npm start
```

## Flujo

1. Usuario selecciona paquete en la web e ingresa URL
2. La web genera el memo exacto a usar
3. Usuario envía HIVE/HBD a la cuenta del bot con ese memo
4. El bot detecta la transferencia, verifica y vota
5. El usuario ve su boost en el historial

## Despliegue

Recomendado en VPS (Ubuntu 22.04):
- Usar PM2: `pm2 start src/index.js --name hive-boost-bot`
- Proxy reverso con Nginx si se desea HTTPS

## Disclaimer

Este bot opera dentro de las reglas de Hive blockchain. El creador no se responsabiliza por mal uso.
