const { Client, PrivateKey } = require('@hiveio/dhive');
const config = require('./config');
const db = require('./database');
const logger = require('./logger');

const client = new Client(['https://api.hive.blog'], { timeout: 30000 });

const VOTE_QUEUE = [];
let isProcessing = false;

function queueVote(boost) {
  VOTE_QUEUE.push(boost);
  logger.info(`Voto encolado #${boost.id}: @${boost.author}/${boost.permlink}`);
  processQueue();
}

async function processQueue() {
  if (isProcessing || VOTE_QUEUE.length === 0) return;
  isProcessing = true;

  while (VOTE_QUEUE.length > 0) {
    const boost = VOTE_QUEUE.shift();
    try {
      await castVote(boost);
    } catch (err) {
      logger.error(`Error votando boost #${boost.id}: ${err.message}`);
      VOTE_QUEUE.push(boost); // re-queue
      break;
    }
    await sleep(3000);
  }

  isProcessing = false;
}

async function castVote(boost) {
  const manaState = db.getManaState();

  if (manaState.votes_today >= config.boost.maxVotesPerDay) {
    logger.warn(`Límite diario alcanzado (${config.boost.maxVotesPerDay}). Re-encolando #${boost.id}`);
    VOTE_QUEUE.unshift(boost);
    return;
  }

  const votingMana = await getVotingMana();
  if (votingMana < 20) {
    logger.warn(`Mana bajo (${votingMana.toFixed(1)}%). Esperando regeneración...`);
    VOTE_QUEUE.unshift(boost);
    isProcessing = false;
    return;
  }

  const weight = Math.min(boost.vote_weight, config.boost.maxVotePercent);
  const maxAfford = Math.floor(votingMana);
  const finalWeight = Math.min(weight, maxAfford);

  if (finalWeight < 1) {
    logger.warn(`Mana insuficiente para votar #${boost.id}. Re-encolando.`);
    VOTE_QUEUE.unshift(boost);
    isProcessing = false;
    return;
  }

  const key = PrivateKey.fromString(config.bot.postingKey);

  const voteOp = [
    'vote',
    {
      voter: config.bot.username,
      author: boost.author,
      permlink: boost.permlink,
      weight: finalWeight * 100,
    },
  ];

  try {
    const result = await client.broadcast.sendOperations([voteOp], key);
    const now = Math.floor(Date.now() / 1000);

    db.updateBoostStatus(boost.id, 'voted', now);
    db.logVote(boost.id, config.bot.username, boost.author, boost.permlink, finalWeight);
    db.updateManaState(finalWeight, db.getTodayVotes() + 1);

    logger.info(`Votado #${boost.id}: @${boost.author}/${boost.permlink} (${finalWeight}%) - TX: ${result.id}`);
  } catch (err) {
    if (err.message.includes('voting')) {
      logger.warn(`Error de voto #${boost.id}: ${err.message}. Re-encolando.`);
      VOTE_QUEUE.unshift(boost);
    } else {
      logger.error(`Error crítico votando #${boost.id}: ${err.message}`);
      db.updateBoostStatus(boost.id, 'failed');
    }
  }
}

async function getVotingMana() {
  try {
    const account = await client.database.getAccounts([config.bot.username]);
    if (!account || account.length === 0) {
      logger.warn('No se pudo obtener información de la cuenta');
      return 0;
    }
    const acc = account[0];
    const totalVests = parseFloat(acc.vesting_shares);
    const delegatedVests = parseFloat(acc.delegated_vesting_shares);
    const receivedVests = parseFloat(acc.received_vesting_shares);
    const effectiveVests = totalVests - delegatedVests + receivedVests;

    const votingPower = acc.voting_power / 10000;
    const lastVoteTime = new Date(acc.last_vote_time + 'Z').getTime();
    const elapsedHours = (Date.now() - lastVoteTime) / (1000 * 60 * 60);
    const regen = elapsedHours * 20;
    const currentPower = Math.min(votingPower + regen, 100);

    return currentPower;
  } catch (err) {
    logger.error(`Error obteniendo mana: ${err.message}`);
    return 0;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { queueVote, getVotingMana };
