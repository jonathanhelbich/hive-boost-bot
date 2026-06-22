const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const packages = (process.env.PACKAGES || 'basico:1:50,plus:3:80,premium:5:100,pro:10:100')
  .split(',')
  .map(p => {
    const [name, amount, votePercent] = p.split(':');
    return { name, amount: parseFloat(amount), votePercent: parseFloat(votePercent) };
  });

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
    multiplier: parseFloat(process.env.BOOST_MULTIPLIER || '1.5'),
    maxVotesPerDay: parseInt(process.env.MAX_VOTES_PER_DAY || '200'),
    minVotePercent: parseInt(process.env.MIN_VOTE_PERCENT || '1'),
    maxVotePercent: parseInt(process.env.MAX_VOTE_PERCENT || '100'),
  },
  packages,
};
