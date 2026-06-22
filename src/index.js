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
  app.listen(config.server.port, () => {
    logger.info(`Servidor web corriendo en puerto ${config.server.port}`);
  });

  startListener((boost) => {
    queueVote(boost);
  }).catch(err => {
    logger.error(`Error fatal en listener: ${err.message}`);
    process.exit(1);
  });
}

main();
