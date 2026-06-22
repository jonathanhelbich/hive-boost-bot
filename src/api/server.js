const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('../core/config');
const db = require('../core/database');
const { getVotingMana, getQueueState } = require('../core/voter');
const logger = require('../core/logger');

function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'web')));

  app.get('/api/packages', (req, res) => {
    res.json({
      dynamic: true,
      baseAmount: config.boost.baseAmount,
      baseVotePercent: config.boost.baseVotePercent,
      minVotePercent: config.boost.minVotePercent,
      maxVotePercent: config.boost.maxVotePercent,
      botAccount: config.bot.username,
    });
  });

  app.get('/api/stats', async (req, res) => {
    try {
      const mana = await getVotingMana();
      const todayVotes = await db.getTodayVotes();
      const boosts = await db.getAllBoosts(10);
      const regenHours = Math.max(0, (100 - mana) / 20);
      const regenMinutes = Math.round(regenHours * 60);
      res.json({
        botAccount: config.bot.username,
        votingMana: mana.toFixed(1),
        manaRegenMinutes: regenMinutes,
        todayVotes,
        maxVotesPerDay: config.boost.maxVotesPerDay,
        totalBoosts: boosts.length,
        recentBoosts: boosts.slice(0, 5).map(b => ({
          id: b.id,
          username: b.username,
          author: b.author,
          permlink: b.permlink,
          amount: b.amount_paid,
          status: b.status,
          votedAt: b.voted_at,
        })),
      });
    } catch (err) {
      logger.error(`Error en /api/stats: ${err.message}`);
      res.status(500).json({ error: 'Error interno' });
    }
  });

  app.get('/api/queue', (req, res) => {
    const queue = getQueueState();
    res.json({
      queueLength: queue.length,
      isProcessing: require('../core/voter').isProcessing(),
      queue,
    });
  });

  app.get('/api/boosts/:username', async (req, res) => {
    const boosts = await db.getUserBoosts(req.params.username);
    res.json({ boosts });
  });

  app.get('/api/boosts', async (req, res) => {
    const boosts = await db.getAllBoosts(100);
    res.json({ boosts });
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'web', 'index.html'));
  });

  return app;
}

module.exports = { createServer };
