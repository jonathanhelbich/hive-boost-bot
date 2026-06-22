const { Client } = require('@hiveio/dhive');
const config = require('./config');
const db = require('./database');
const logger = require('./logger');

const client = new Client(['https://api.hive.blog'], { timeout: 30000 });

let lastCheckedBlock = 0;

async function startListener(onTransfer) {
  logger.info('Iniciando listener de blockchain...');
  const props = await client.database.getDynamicGlobalProperties();
  lastCheckedBlock = props.last_irreversible_block_num - 20;
  if (lastCheckedBlock < 1) lastCheckedBlock = 1;
  logger.info(`Comenzando desde el bloque ${lastCheckedBlock}`);
  pollLoop(onTransfer);
}

async function pollLoop(onTransfer) {
  try {
    const props = await client.database.getDynamicGlobalProperties();
    const currentBlock = props.last_irreversible_block_num;

    if (currentBlock > lastCheckedBlock) {
      await processBlocks(lastCheckedBlock + 1, currentBlock, onTransfer);
      lastCheckedBlock = currentBlock;
    }
  } catch (err) {
    logger.error(`Error en pollLoop: ${err.message}`);
  }

  setTimeout(() => pollLoop(onTransfer), 3000);
}

async function processBlocks(from, to, onTransfer) {
  for (let blockNum = from; blockNum <= to; blockNum++) {
    try {
      const block = await client.database.getBlock(blockNum);
      if (!block || !block.transactions) continue;
      for (const tx of block.transactions) {
        for (const op of tx.operations) {
          const [opType, opData] = op;
          if (opType === 'transfer' && opData.to === config.bot.username) {
            await handleTransfer(opData, tx.transaction_id, onTransfer);
          }
        }
      }
    } catch (err) {
      logger.warn(`Error procesando bloque ${blockNum}: ${err.message}`);
    }
  }
}

async function handleTransfer(transfer, txId, onTransfer) {
  const { from, to, amount, memo } = transfer;
  if (to !== config.bot.username || from === config.bot.username) return;

  logger.info(`Transferencia recibida: ${amount} de ${from} - ${memo || 'sin memo'}`);

  if (!memo) {
    logger.warn(`Transferencia sin memo de ${from}: ignorada`);
    return;
  }

  const parsed = parseMemo(memo);
  if (!parsed) {
    logger.warn(`Memo inválido de ${from}: "${memo}"`);
    return;
  }

  const amountNum = parseFloat(amount.split(' ')[0]);
  const currency = amount.split(' ')[1];

  const boostPackage = config.packages.find(p => p.name === parsed.packageName);
  if (!boostPackage) {
    logger.warn(`Paquete inválido "${parsed.packageName}" de ${from}`);
    return;
  }

  if (amountNum < boostPackage.amount) {
    logger.warn(`Monto insuficiente de ${from}: ${amountNum} < ${boostPackage.amount}`);
    return;
  }

  const user = await db.getOrCreateUser(from);
  const voteWeight = boostPackage.voteWeight;

  const boost = await db.createBoost({
    userId: user.id,
    author: parsed.author,
    permlink: parsed.permlink,
    packageName: parsed.packageName,
    amountPaid: amountNum,
    currency,
    voteWeight,
    txId,
  });

  logger.info(`Boost creado #${boost.id}: ${from} -> @${parsed.author}/${parsed.permlink} (${voteWeight}%)`);

  if (onTransfer) onTransfer(boost);
}

function parseMemo(memo) {
  memo = memo.trim();
  let packageName = 'basico';
  let author, permlink;

  const parts = memo.split(/\s+/);
  if (parts.length === 1) {
    const parsed = parsePostUrl(parts[0]);
    if (!parsed) return null;
    author = parsed.author;
    permlink = parsed.permlink;
  } else if (parts.length === 2) {
    packageName = parts[0].toLowerCase();
    const parsed = parsePostUrl(parts[1]);
    if (!parsed) return null;
    author = parsed.author;
    permlink = parsed.permlink;
  } else if (parts.length >= 3) {
    packageName = parts[0].toLowerCase();
    author = parts[1].replace('@', '');
    permlink = parts[2];
  } else {
    return null;
  }

  const validPackage = config.packages.find(p => p.name === packageName);
  if (!validPackage) return null;

  return { packageName, author, permlink };
}

function parsePostUrl(url) {
  const patterns = [
    /hive\.blog\/(?:@)?(\w+)\/([\w-]+)/,
    /peakd\.com\/(?:\w+\/)?@?(\w+)\/([\w-]+)/,
    /ecency\.com\/(?:\w+\/)?@?(\w+)\/([\w-]+)/,
    /hivebuzz\.com\/(?:\w+\/)?@?(\w+)\/([\w-]+)/,
    /\/(?:@)?(\w+)\/([\w-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return { author: match[1], permlink: match[2] };
  }
  return null;
}

module.exports = { startListener };
