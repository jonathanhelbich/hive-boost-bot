const fs = require('fs');
const path = require('path');
const config = require('./core/config');
const logger = require('./core/logger');
const { startListener } = require('./core/listener');
const { queueVote } = require('./core/voter');
const { createServer } = require('./api/server');

const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function main() {
  logger.info('========================================');
  logger.info('  Hive Boost Bot v1.0.0');
  logger.info(`  Cuenta: ${config.bot.username}`);
  logger.info(`  Precio dinámico: ${config.boost.baseAmount} HIVE = ${config.boost.baseVotePercent}% de voto (máx ${config.boost.maxVotePercent}%)`);
  logger.info('========================================');

  const app = createServer();
  app.listen(config.server.port, '0.0.0.0', () => {
    logger.info(`Servidor web corriendo en http://0.0.0.0:${config.server.port}`);
  });

  startListener((boost) => {
    queueVote(boost);
  }).catch(err => {
    logger.error(`Error fatal en listener: ${err.message}`);
    process.exit(1);
  });

  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) {
    const http = require('http');
    setInterval(() => {
      http.get(renderUrl + '/api/health', (res) => {
        logger.debug(`Keepalive ping: ${res.statusCode}`);
      }).on('error', (err) => {
        logger.debug(`Keepalive error: ${err.message}`);
      });
    }, 10 * 60 * 1000);
    logger.info(`Keepalive activo cada 10 min en ${renderUrl}`);
  }
}

main();
