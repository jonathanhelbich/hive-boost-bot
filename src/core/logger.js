const winston = require('winston');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', '..', 'logs', 'boostbot.log');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: LOG_PATH, maxsize: 5242880, maxFiles: 5 }),
  ],
});

module.exports = logger;
