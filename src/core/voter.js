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

    try {
      await postComment(boost);
    } catch (commentErr) {
      logger.warn(`Error comentando #${boost.id}: ${commentErr.message}`);
    }
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

const COMMENTS = [
  'Muy buen post 🙌. Si querés darle más visibilidad a tus próximos posts, pasá por https://hive-boost-bot.onrender.com',
  'Está buenísimo el contenido. Por cierto, si te sirve, en hive-boost-bot.onrender.com podés potenciar tus posts con votos al instante.',
  'Te quedó genial el post. 🚀 Acá tenés un boost de parte del bot, si querés repetir ya sabés: https://hive-boost-bot.onrender.com',
  'Buen contenido 🙌. Pasá la voz: hay un bot en hive-boost-bot.onrender.com que da votos por transferencia, sin paquetes fijos.',
  'Sumo un voto a tu post desde el bot. Si te copa la idea, entra a https://hive-boost-bot.onrender.com y potenciá tus próximos posts.',
  'Buenardo el post. 🔥 Avísale a tus amigos: en hive-boost-bot.onrender.com pueden subir sus posts con votos dinámicos.',
  'Te dejamos un voto. Si querés seguí potenciando tu contenido, pegate una vuelta por https://hive-boost-bot.onrender.com',
  'Buen post 🙌. Acá va un apoyo del bot. Cualquier cosa, en hive-boost-bot.onrender.com podés conseguir más votos cuando quieras.',
];

async function postComment(boost) {
  const text = COMMENTS[Math.floor(Math.random() * COMMENTS.length)];
  const permlink = `re-${boost.author}-${boost.permlink}-${Math.floor(Date.now() / 1000)}`;
  const commentOp = [
    'comment',
    {
      parent_author: boost.author,
      parent_permlink: boost.permlink,
      author: config.bot.username,
      permlink,
      title: '',
      body: text,
      json_metadata: JSON.stringify({}),
    },
  ];
  const key = PrivateKey.fromString(config.bot.postingKey);
  await client.broadcast.sendOperations([commentOp], key);
  logger.info(`Comentado en #${boost.id}: @${boost.author}/${boost.permlink}`);
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

function getQueueState() {
  return VOTE_QUEUE.map((b, i) => ({
    position: i,
    id: b.id,
    author: b.author,
    permlink: b.permlink,
    votePercent: b.vote_weight,
    estimatedSeconds: i * 3 + 5,
  }));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { queueVote, getVotingMana, getQueueState, isProcessing: () => isProcessing };
