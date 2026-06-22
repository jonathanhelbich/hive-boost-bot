const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

module.exports = {
  bot: {
    username: process.env.BOT_USERNAME,
    postingKey: process.env.BOT_POSTING_KEY,
    activeKey: process.env.BOT_ACTIVE_KEY,
  },
  server: {
    port: parseInt(process.env.PORT || '3000'),
  },
  boost: {
    baseAmount: parseFloat(process.env.BASE_AMOUNT || '1'),
    baseVotePercent: parseFloat(process.env.BASE_VOTE_PERCENT || '50'),
    maxVotesPerDay: parseInt(process.env.MAX_VOTES_PER_DAY || '200'),
    minVotePercent: parseInt(process.env.MIN_VOTE_PERCENT || '1'),
    maxVotePercent: parseInt(process.env.MAX_VOTE_PERCENT || '100'),
  },
};
