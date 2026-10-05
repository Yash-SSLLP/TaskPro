/**
 * MongoDB connection.
 *
 * With no MONGO_URI outside production, an in-memory MongoDB is started so
 * `npm run dev` works on a fresh machine. Its data is gone when the server stops.
 */
const dns = require('dns');
const mongoose = require('mongoose');
const config = require('../config');

mongoose.set('strictQuery', true);

let memoryServer = null;

/**
 * A mongodb+srv:// address needs a DNS SRV lookup. On some Windows networks
 * Node's resolver ends up on 127.0.0.1 (the router hands out an IPv6
 * link-local DNS server Node can't use) and the lookup is refused even though
 * the browser and nslookup work. If the system resolver can't answer, switch
 * this process to DNS_SERVERS (default: public DNS).
 */
async function ensureSrvResolvable(uri) {
  const m = /^mongodb\+srv:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(uri);
  if (!m) return;
  const record = `_mongodb._tcp.${m[1]}`;
  try {
    await dns.promises.resolveSrv(record);
  } catch (err) {
    const fallback = config.dnsServers;
    console.warn(`[db] DNS lookup for ${m[1]} failed (${err.code}) via ${dns.getServers().join(', ')}; using ${fallback.join(', ')}`);
    dns.setServers(fallback);
  }
}

async function connectDB(uri = config.mongoUri) {
  let target = uri;
  if (!target) {
    if (config.isProd) throw new Error('MONGO_URI must be set in production');
    // Lazy: mongodb-memory-server is a dev dependency.
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    target = memoryServer.getUri('app');
    console.warn('[db] MONGO_URI is not set: using a TEMPORARY in-memory database. Data is lost on restart.');
  } else {
    await ensureSrvResolvable(target);
  }
  await mongoose.connect(target, { autoIndex: true });
  // Build declared indexes (unique logins and pins) before serving.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

module.exports = { connectDB, disconnectDB };
