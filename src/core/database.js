const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'db', 'boostbot.db');

let db;

async function getDb() {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    db.run('PRAGMA journal_mode = WAL');
    initTables();
    saveDb();
  }
  return db;
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function initTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer)),
      total_boosts INTEGER NOT NULL DEFAULT 0,
      total_spent REAL NOT NULL DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS boosts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      author TEXT NOT NULL,
      permlink TEXT NOT NULL,
      package_name TEXT NOT NULL,
      amount_paid REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'HIVE',
      vote_weight REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      tx_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer)),
      voted_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS votes_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      boost_id INTEGER NOT NULL,
      voter TEXT NOT NULL,
      author TEXT NOT NULL,
      permlink TEXT NOT NULL,
      weight REAL NOT NULL,
      voted_at INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer)),
      FOREIGN KEY (boost_id) REFERENCES boosts(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS mana_tracker (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      current_mana REAL NOT NULL DEFAULT 100,
      last_check INTEGER NOT NULL DEFAULT (cast(strftime('%s','now') as integer)),
      votes_today INTEGER NOT NULL DEFAULT 0,
      last_reset_date TEXT NOT NULL DEFAULT (date('now'))
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_boosts_status ON boosts(status)');
  db.run('CREATE INDEX IF NOT EXISTS idx_boosts_user ON boosts(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_boosts_tx ON boosts(tx_id)');
}

async function getOrCreateUser(username) {
  const d = await getDb();
  let user = d.exec(`SELECT * FROM users WHERE username = '${username}'`);
  if (user.length === 0 || user[0].values.length === 0) {
    d.run(`INSERT INTO users (username) VALUES ('${username}')`);
    saveDb();
    user = d.exec(`SELECT * FROM users WHERE username = '${username}'`);
  }
  return rowToObj(user[0], user[0].values[0]);
}

async function createBoost({ userId, author, permlink, packageName, amountPaid, currency, voteWeight, txId }) {
  const d = await getDb();
  d.run(`
    INSERT INTO boosts (user_id, author, permlink, package_name, amount_paid, currency, vote_weight, tx_id, status)
    VALUES (${userId}, '${author.replace(/'/g, "''")}', '${permlink.replace(/'/g, "''")}', '${packageName}', ${amountPaid}, '${currency}', ${voteWeight}, '${txId}', 'pending')
  `);
  saveDb();
  const rows = d.exec('SELECT last_insert_rowid() as id');
  const id = rows[0].values[0][0];
  const boost = d.exec(`SELECT * FROM boosts WHERE id = ${id}`);
  return rowToObj(boost[0], boost[0].values[0]);
}

async function getPendingBoosts() {
  const d = await getDb();
  const rows = d.exec('SELECT * FROM boosts WHERE status = \'pending\' ORDER BY created_at ASC');
  return rowsToArray(rows[0]);
}

async function updateBoostStatus(id, status, votedAt) {
  const d = await getDb();
  if (votedAt) {
    d.run(`UPDATE boosts SET status = '${status}', voted_at = ${votedAt} WHERE id = ${id}`);
  } else {
    d.run(`UPDATE boosts SET status = '${status}' WHERE id = ${id}`);
  }
  saveDb();
}

async function logVote(boostId, voter, author, permlink, weight) {
  const d = await getDb();
  d.run(`
    INSERT INTO votes_log (boost_id, voter, author, permlink, weight)
    VALUES (${boostId}, '${voter}', '${author}', '${permlink.replace(/'/g, "''")}', ${weight})
  `);
  saveDb();
}

async function getManaState() {
  const d = await getDb();
  const today = new Date().toISOString().split('T')[0];
  let rows = d.exec('SELECT * FROM mana_tracker WHERE id = 1');
  if (rows.length === 0 || rows[0].values.length === 0) {
    d.run(`INSERT INTO mana_tracker (current_mana, last_check, votes_today, last_reset_date) VALUES (100, cast(strftime('%s','now') as integer), 0, '${today}')`);
    saveDb();
    rows = d.exec('SELECT * FROM mana_tracker WHERE id = 1');
  }
  const state = rowToObj(rows[0], rows[0].values[0]);
  if (state.last_reset_date !== today) {
    d.run(`UPDATE mana_tracker SET votes_today = 0, last_reset_date = '${today}' WHERE id = 1`);
    saveDb();
    state.votes_today = 0;
  }
  return state;
}

async function updateManaState(mana, votesToday) {
  const d = await getDb();
  d.run(`UPDATE mana_tracker SET current_mana = ${mana}, votes_today = ${votesToday}, last_check = cast(strftime('%s','now') as integer) WHERE id = 1`);
  saveDb();
}

async function getTodayVotes() {
  const state = await getManaState();
  return state.votes_today || 0;
}

async function getUserBoosts(username) {
  const d = await getDb();
  const rows = d.exec(`
    SELECT b.*, u.username FROM boosts b
    JOIN users u ON u.id = b.user_id
    WHERE u.username = '${username}'
    ORDER BY b.created_at DESC
    LIMIT 50
  `);
  return rowsToArray(rows[0]);
}

async function getAllBoosts(limit = 50) {
  const d = await getDb();
  const rows = d.exec(`
    SELECT b.*, u.username FROM boosts b
    JOIN users u ON u.id = b.user_id
    ORDER BY b.created_at DESC
    LIMIT ${limit}
  `);
  return rowsToArray(rows[0]);
}

async function getTotalHiveReceived() {
  const d = await getDb();
  const rows = d.exec("SELECT COALESCE(SUM(amount_paid), 0) as total FROM boosts WHERE currency = 'HIVE'");
  if (rows.length > 0 && rows[0].values.length > 0) {
    return rows[0].values[0][0];
  }
  return 0;
}

async function getTotalVotesCast() {
  const d = await getDb();
  const rows = d.exec("SELECT COUNT(*) as total FROM votes_log");
  if (rows.length > 0 && rows[0].values.length > 0) {
    return rows[0].values[0][0];
  }
  return 0;
}

function rowToObj(meta, values) {
  if (!meta || !values) return null;
  const obj = {};
  meta.columns.forEach((col, i) => {
    obj[col] = values[i];
  });
  return obj;
}

function rowsToArray(meta) {
  if (!meta || !meta.values) return [];
  return meta.values.map(v => rowToObj(meta, v));
}

module.exports = {
  getDb,
  getOrCreateUser,
  createBoost,
  getPendingBoosts,
  updateBoostStatus,
  logVote,
  getManaState,
  updateManaState,
  getTodayVotes,
  getUserBoosts,
  getAllBoosts,
  getTotalHiveReceived,
  getTotalVotesCast,
};
