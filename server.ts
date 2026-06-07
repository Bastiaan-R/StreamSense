import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import cron from 'node-cron';
import Database from 'better-sqlite3';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import { encryptToken, decryptToken, getJwtSecret } from './cryptoUtils.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite Database
const dbPath = process.env.DATABASE_PATH || 'cinema_sense.db';
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT,
    token TEXT,
    is_admin INTEGER DEFAULT 0,
    last_history_sync TEXT,
    last_recs_sync TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    username TEXT,
    action TEXT,
    details TEXT,
    timestamp TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS watch_history (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT,
    type TEXT,
    genres TEXT,
    overview TEXT,
    date_played TEXT,
    run_time_ticks INTEGER,
    series_name TEXT,
    season_name TEXT,
    episode_number INTEGER,
    season_number INTEGER,
    play_duration INTEGER,
    client TEXT,
    device TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS recommendations (
    user_id TEXT PRIMARY KEY,
    data TEXT,
    updated_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS seerr_requests (
    id INTEGER PRIMARY KEY,
    tmdb_id INTEGER,
    type TEXT,
    status INTEGER,
    requested_by_id INTEGER,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sync_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  INSERT OR IGNORE INTO sync_settings (key, value) VALUES ('history_sync_interval', '12');
  INSERT OR IGNORE INTO sync_settings (key, value) VALUES ('requests_sync_interval', '1');
`);

// Migrations for existing databases
const columns = db.prepare("PRAGMA table_info(watch_history)").all() as any[];
const columnNames = columns.map(c => c.name);

if (!columnNames.includes('run_time_ticks')) {
  db.exec("ALTER TABLE watch_history ADD COLUMN run_time_ticks INTEGER DEFAULT 0");
}
if (!columnNames.includes('series_name')) {
  db.exec("ALTER TABLE watch_history ADD COLUMN series_name TEXT");
}
if (!columnNames.includes('season_name')) {
  db.exec("ALTER TABLE watch_history ADD COLUMN season_name TEXT");
}
if (!columnNames.includes('episode_number')) {
  db.exec("ALTER TABLE watch_history ADD COLUMN episode_number INTEGER");
}
if (!columnNames.includes('season_number')) {
  db.exec("ALTER TABLE watch_history ADD COLUMN season_number INTEGER");
}
if (!columnNames.includes('play_duration')) {
  db.exec("ALTER TABLE watch_history ADD COLUMN play_duration INTEGER DEFAULT 0");
}
if (!columnNames.includes('client')) {
  db.exec("ALTER TABLE watch_history ADD COLUMN client TEXT");
}
if (!columnNames.includes('device')) {
  db.exec("ALTER TABLE watch_history ADD COLUMN device TEXT");
}

// Helper: Get site configuration (checks DB first, then process.env)
function getConfig(key: string): string {
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (row && row.value) {
      return row.value;
    }
  } catch (err) {
    // Ignore error if table doesn't exist yet during init
  }
  return process.env[key] || '';
}

// Helper: Log an action
function logAction(userId: string | null, username: string | null, action: string, details: string) {
  try {
    db.prepare('INSERT INTO audit_logs (user_id, username, action, details, timestamp) VALUES (?, ?, ?, ?, ?)')
      .run(userId, username, action, details, new Date().toISOString());
  } catch (err) {
    console.error('Logging failed:', err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(cookieParser());

  // Rate Limiting for login
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: { error: 'Too many login attempts, please try again later.' },
    validate: { trustProxy: false, xForwardedForHeader: false, forwardedHeader: false }
  });

  // JWT Auth Middleware
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    try {
      const decoded = jwt.verify(token, getJwtSecret()) as any;
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: 'Invalid or expired session' });
    }
  };

  // Proxy/Logic Endpoints (Updated to use DB config)
  const requireAdmin = (req: any, res: any, next: any) => {
    // Authenticate first
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    let decoded;
    try {
      decoded = jwt.verify(token, getJwtSecret()) as any;
      req.user = decoded;
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const userId = req.user.userId;
    
    // Check if user is in ADMIN_USER_IDS env variable (comma separated)
    const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(id => id.trim());
    if (adminIds.includes(userId)) return next();

    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId) as { is_admin: number } | undefined;
    if (!user?.is_admin) return res.status(403).json({ error: 'Admin access required' });
    next();
  };

  app.get('/api/admin/users', requireAdmin, (req, res) => {
    const users = db.prepare('SELECT id, username, is_admin, last_history_sync FROM users').all();
    res.json(users);
  });

  app.post('/api/admin/users/promote', requireAdmin, (req: any, res: any) => {
    const { targetUserId, promote } = req.body;
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(promote ? 1 : 0, targetUserId);
    logAction(req.user.userId, req.user.username, 'PROMOTE_USER', `${promote ? 'Promoted' : 'Demoted'} ${targetUserId}`);
    res.json({ success: true });
  });

  app.get('/api/admin/logs', requireAdmin, (req, res) => {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 500').all();
    res.json(logs);
  });


  // Helper to sync history for a user
  async function syncUserHistory(userId: string, token: string) {
    try {
      const jellyfinUrl = getConfig('JELLYFIN_URL');
      if (!jellyfinUrl) throw new Error('Jellyfin URL missing');
      const cleanUrl = jellyfinUrl.replace(/\/$/, '');
      const authHeader = `MediaBrowser Client="StreamSense AI", Device="Web Browser", DeviceId="StreamSense-Web", Version="1.0.0", Token="${token}"`;

      console.log(`Starting Playback Reporting sync for user ${userId} at ${cleanUrl}`);

      // Fetch Playback Reports
      const endpoints = [
        '/PlaybackReporting/Report',
        '/PlaybackReporting/Reports',
        '/PlaybackReporting/GetReport',
        '/PlaybackReporting/Activity'
      ];

      let reportsResponse = null;
      let lastError = null;

      for (const endpoint of endpoints) {
        try {
          const testRes = await axios.get(`${cleanUrl}${endpoint}`, {
            params: {
              UserId: userId,
              Skip: 0,
              Take: 2000,
              SortBy: 'Date',
              SortOrder: 'Descending',
              Grouping: 'None'
            },
            headers: { 
              'X-Emby-Token': token,
              'X-Emby-Authorization': authHeader 
            }
          });
          
          if (testRes && testRes.data && testRes.data.Items) {
            reportsResponse = testRes;
            console.log(`Successfully connected to Playback Reporting endpoint: ${endpoint}`);
            break;
          }
        } catch (err: any) {
          lastError = err;
          // Silent fail for individual endpoint attempts to avoid log noise
        }
      }

      let reports = [];
      let itemsMetadata = [];

      if (reportsResponse && reportsResponse.data && reportsResponse.data.Items) {
        reports = reportsResponse.data.Items;
        console.log(`Jellyfin Playback Reporting sync successful: ${reports.length} sessions found.`);
      } else {
        // FALLBACK: Standard Jellyfin Library History
        console.warn(`Playback Reporting Plugin not found or unresponsive at ${userId}. Falling back to standard Jellyfin Library history.`);
        try {
          const fallbackRes = await axios.get(`${cleanUrl}/Users/${userId}/Items`, {
            params: {
              IncludeItemTypes: 'Movie,Episode',
              Recursive: true,
              IsPlayed: true,
              SortBy: 'DatePlayed',
              SortOrder: 'Descending',
              Limit: 2000,
              Fields: 'Overview,Genres,SeriesId,SeriesName,SeriesOverview,RunTimeTicks,IndexNumber,ParentIndexNumber,DatePlayed'
            },
            headers: { 
              'X-Emby-Token': token,
              'X-Emby-Authorization': authHeader 
            }
          });
          
          itemsMetadata = fallbackRes.data.Items || [];
          // Map standard items to a "report-like" structure
          reports = itemsMetadata.map((item: any) => {
            const datePlayed = item.UserData?.LastPlayedDate || item.UserData?.DateLastPlayed || item.DateCreated || new Date().toISOString();
            return {
              ItemId: item.Id,
              ItemName: item.Name,
              ItemType: item.Type,
              Date: datePlayed,
              Duration: 0, // Not available in standard history
              Client: 'Jellyfin',
              Device: 'Unknown',
              Id: `fallback-${item.Id}` // Stable ID to prevent duplicate insertions on every sync
            };
          });
          console.log(`Fallback sync returned ${reports.length} standard items for user ${userId}`);
        } catch (fallbackErr: any) {
          if (fallbackErr.response?.status === 401) {
            console.error(`Token invalid for user ${userId} (401 Unauthorized).`);
            throw new Error('Unauthorized');
          }
          console.error('Standard history fallback also failed:', fallbackErr.message);
          throw new Error(`History sync failed completely. Plugin 404 and fallback failed: ${fallbackErr.message}`);
        }
      }

      if (reports.length === 0) return 0;

      // Get unique ItemIds to fetch metadata (for reports from plugin)
      const itemIds = [...new Set(reports.map((r: any) => r.ItemId))];
      const itemMetadataMap = new Map<string, any>();

      // If we used the fallback, we already have the metadata
      if (itemsMetadata.length > 0) {
        itemsMetadata.forEach((item: any) => {
          itemMetadataMap.set(item.Id, item);
        });
      } else {
        // Fetch metadata for these items in chunks to avoid URL length limits
        const chunkSize = 50;
        for (let i = 0; i < itemIds.length; i += chunkSize) {
          const chunk = itemIds.slice(i, i + chunkSize);
          const itemsResponse = await axios.get(`${cleanUrl}/Items`, {
            params: {
              Ids: chunk.join(','),
              Fields: 'Overview,Genres,SeriesId,SeriesName,SeriesOverview,RunTimeTicks,IndexNumber,ParentIndexNumber'
            },
            headers: { 
              'X-Emby-Token': token,
              'X-Emby-Authorization': authHeader 
            }
          });
          
          (itemsResponse.data.Items || []).forEach((item: any) => {
            itemMetadataMap.set(item.Id, item);
          });
        }
      }

      const insert = db.prepare(`
        INSERT OR REPLACE INTO watch_history (
          id, user_id, name, type, genres, overview, date_played, 
          run_time_ticks, series_name, season_name, episode_number, season_number,
          play_duration, client, device
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = db.transaction((sessions) => {
        for (const session of sessions) {
          const meta = itemMetadataMap.get(session.ItemId);
          
          insert.run(
            session.Id || `${session.ItemId}-${session.Date}`, // Use session ID if available, else composite
            userId,
            session.ItemName || (meta ? meta.Name : 'Unknown'),
            session.ItemType || (meta ? meta.Type : 'Unknown'),
            JSON.stringify(meta ? (meta.Genres || []) : []),
            meta ? (meta.Overview || '') : '',
            session.Date || new Date().toISOString(),
            meta ? (meta.RunTimeTicks || 0) : 0,
            meta ? (meta.SeriesName || null) : null,
            meta ? (meta.SeasonName || null) : null,
            meta ? (meta.IndexNumber || null) : null,
            meta ? (meta.ParentIndexNumber || null) : null,
            session.Duration || 0,
            session.Client || null,
            session.Device || null
          );
        }
      });

      transaction(reports);
      db.prepare('UPDATE users SET last_history_sync = ? WHERE id = ?').run(new Date().toISOString(), userId);
      return reports.length;
    } catch (error: any) {
      console.error(`Playback Reporting sync failed for ${userId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async function syncSeerrRequests() {
    try {
      const seerrUrl = getConfig('SEERR_URL');
      const seerrApiKey = getConfig('SEERR_API_KEY');
      if (!seerrUrl || !seerrApiKey) return;

      let cleanUrl = seerrUrl.trim().replace(/\/$/, '');
      if (!cleanUrl.endsWith('/api/v1')) {
        cleanUrl = `${cleanUrl}/api/v1`;
      }

      console.log('Syncing Seerr requests...');
      const response = await axios.get(`${cleanUrl}/request`, {
        params: { take: 100, skip: 0, sort: 'added' },
        headers: { 'X-Api-Key': seerrApiKey.trim() }
      });

      const requests = response.data.results || [];
      const insert = db.prepare(`
        INSERT OR REPLACE INTO seerr_requests (id, tmdb_id, type, status, requested_by_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = db.transaction((reqs) => {
        for (const r of reqs) {
          insert.run(
            r.id,
            r.media.tmdbId,
            r.media.mediaType || (r.type === 1 ? 'movie' : 'tv'),
            r.status,
            r.requestedBy.id,
            r.createdAt,
            r.updatedAt
          );
        }
      });

      transaction(requests);
      console.log(`Synced ${requests.length} Seerr requests`);
      return requests.length;
    } catch (error: any) {
      console.error('Seerr request sync failed:', error.message);
      throw error;
    }
  }

  // Scheduled Jobs
  const historyIntervalRow = db.prepare("SELECT value FROM sync_settings WHERE key = 'history_sync_interval'").get() as any;
  const requestsIntervalRow = db.prepare("SELECT value FROM sync_settings WHERE key = 'requests_sync_interval'").get() as any;
  
  const historyInterval = parseInt(historyIntervalRow?.value || '12');
  const requestsInterval = parseInt(requestsIntervalRow?.value || '1');
  cron.schedule(`0 */${historyInterval} * * *`, async () => {
    console.log('Running scheduled history sync...');
    const users = db.prepare('SELECT id, token FROM users').all() as { id: string, token: string }[];
    for (const user of users) {
      try {
        const decryptedToken = decryptToken(user.token);
        await syncUserHistory(user.id, decryptedToken);
      } catch (err) {
        console.error(`Scheduled history sync failed for user ${user.id}`);
      }
    }
  });

  // Seerr Requests Sync Job
  cron.schedule(`0 */${requestsInterval} * * *`, async () => {
    console.log('Running scheduled Seerr requests sync...');
    try {
      await syncSeerrRequests();
    } catch (err) {
      console.error('Scheduled Seerr requests sync failed');
    }
  });

  app.post('/api/recommendations/save', authenticate, async (req: any, res: any) => {
    try {
      const userId = req.user.userId;
      const { recs } = req.body;
      if (!recs) return res.status(400).json({ error: 'Missing data' });

      db.prepare('INSERT OR REPLACE INTO recommendations (user_id, data, updated_at) VALUES (?, ?, ?)')
        .run(userId, JSON.stringify(recs), new Date().toISOString());
      
      db.prepare('UPDATE users SET last_recs_sync = ? WHERE id = ?').run(new Date().toISOString(), userId);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Save recs error:", error)
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/recommendations', authenticate, async (req: any, res: any) => {
    try {
      const userId = req.user.userId;

      const row = db.prepare('SELECT * FROM recommendations WHERE user_id = ?').get(userId) as any;
      if (!row) return res.json({ recs: { movies: [], shows: [] } });

      res.json({
        recs: JSON.parse(row.data),
        updatedAt: row.updated_at
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
  });



  // Manual Trigger: Sync All History
  app.post('/api/admin/sync-history', requireAdmin, async (req, res) => {
    try {
      const users = db.prepare('SELECT id, token FROM users').all() as { id: string, token: string }[];
      let total = 0;
      for (const user of users) {
        const decryptedToken = decryptToken(user.token);
        total += await syncUserHistory(user.id, decryptedToken);
      }
      res.json({ success: true, message: `Synced ${total} items across ${users.length} users` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Manual Trigger: Sync Seerr Requests
  app.post('/api/admin/sync-seerr', requireAdmin, async (req, res) => {
    try {
      const count = await syncSeerrRequests();
      res.json({ success: true, message: `Synced ${count} requests from Seerr` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Sync Settings
  app.get('/api/admin/sync-settings', requireAdmin, (req, res) => {
    const settings = db.prepare('SELECT * FROM sync_settings').all();
    res.json(settings);
  });

  app.post('/api/admin/sync-settings', requireAdmin, (req, res) => {
    const { history_sync_interval, requests_sync_interval } = req.body;
    if (history_sync_interval) {
      db.prepare("UPDATE sync_settings SET value = ? WHERE key = 'history_sync_interval'").run(history_sync_interval.toString());
    }
    if (requests_sync_interval) {
      db.prepare("UPDATE sync_settings SET value = ? WHERE key = 'requests_sync_interval'").run(requests_sync_interval.toString());
    }
    res.json({ success: true });
  });

  // App Settings (API Keys, URLs)
  app.get('/api/admin/app-settings', requireAdmin, (req, res) => {
    const keys = ['JELLYFIN_URL', 'SEERR_URL', 'SEERR_API_KEY', 'TMDB_READ_ACCESS_TOKEN'];
    const settings: Record<string, string> = {};
    const rows = db.prepare('SELECT key, value FROM app_settings').all() as { key: string, value: string }[];
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  });

  app.post('/api/admin/app-settings', requireAdmin, (req, res) => {
    const keys = ['JELLYFIN_URL', 'SEERR_URL', 'SEERR_API_KEY', 'TMDB_READ_ACCESS_TOKEN'];
    const stmt = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
    db.transaction(() => {
      for (const k of keys) {
        if (req.body[k] !== undefined) {
          stmt.run(k, req.body[k]);
        }
      }
    })();
    res.json({ success: true });
  });

  app.get('/api/admin/status', requireAdmin, async (req, res) => {
    try {
      const users = db.prepare('SELECT id, username, last_history_sync, last_recs_sync FROM users').all();
      const historyCount = db.prepare('SELECT COUNT(*) as count FROM watch_history').get() as any;
      res.json({
        users,
        totalHistoryItems: historyCount.count,
        intervals: {
          history: historyInterval,
          requests: requestsInterval
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/auth/me', authenticate, async (req: any, res: any) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const userId = req.user.userId;
      const user = db.prepare('SELECT id, username, is_admin, last_recs_sync FROM users WHERE id = ?').get(userId) as any;
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(id => id.trim());
      const isAdmin = user.is_admin === 1 || adminIds.includes(userId);

      res.json({
        userId: user.id,
        username: user.username,
        isAdmin,
        lastRecsSync: user.last_recs_sync
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Jellyfin Login
  app.post('/api/jellyfin/login', loginLimiter, async (req, res) => {
    try {
      const jellyfinUrl = getConfig('JELLYFIN_URL');
      const { username, password } = req.body;
      
      if (!jellyfinUrl) {
        return res.status(500).json({ error: 'Jellyfin URL missing' });
      }

      const cleanUrl = jellyfinUrl.replace(/\/$/, '');
      const authHeader = `MediaBrowser Client="StreamSense AI", Device="Web Browser", DeviceId="StreamSense-Web", Version="1.0.0"`;

      const response = await axios.post(`${cleanUrl}/Users/AuthenticateByName`, {
        Username: username,
        Pw: password
      }, {
        headers: {
          'X-Emby-Authorization': authHeader
        }
      });

      const userId = response.data.User.Id;
      
      // Check if user is already admin
      let userRow = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId) as { is_admin: number } | undefined;
      
      const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(id => id.trim());
      const isEnvAdmin = adminIds.includes(userId);

      const sessionData = {
        userId,
        username: response.data.User.Name,
        isAdmin: !!userRow?.is_admin || isEnvAdmin
      };

      // Store user in DB - ENCRYPT the token before storing
      const encryptedToken = encryptToken(response.data.AccessToken);
      db.prepare('INSERT OR REPLACE INTO users (id, username, token, is_admin) VALUES (?, ?, ?, ?)')
        .run(sessionData.userId, sessionData.username, encryptedToken, sessionData.isAdmin ? 1 : 0);

      // Issue JWT Cookie
      const jwtToken = jwt.sign(sessionData, getJwtSecret(), { expiresIn: '7d' });
      res.cookie('auth_token', jwtToken, { 
        httpOnly: true, 
        secure: true, 
        sameSite: 'none', 
        maxAge: 7 * 24 * 3600000 
      });

      // Trigger immediate sync (don't block login response but catch errors)
      syncUserHistory(sessionData.userId, response.data.AccessToken).catch(err => {
        console.error(`Initial sync failed for ${sessionData.userId}:`, err.message);
      });

      res.json(sessionData); // Returns session context, NO RAW TOKEN
    } catch (error: any) {
      console.error('Jellyfin login error:', error.response?.data || error.message);
      res.status(401).json({ error: 'Invalid Jellyfin credentials' });
    }
  });

  // Jellyfin API Proxy - History (From DB)
  app.get('/api/jellyfin/history', authenticate, async (req: any, res: any) => {
    try {
      const userId = req.user.userId;
      
      // Ensure user exists in DB
      const userExists = db.prepare('SELECT id, token FROM users WHERE id = ?').get(userId) as any;
      if (!userExists) return res.status(401).json({ error: 'User not found in DB.' });

      let history = db.prepare('SELECT * FROM watch_history WHERE user_id = ? ORDER BY date_played DESC').all(userId);
      
      // If history is empty, try an immediate sync
      if (history.length === 0 && userExists.token) {
        console.log(`History empty for ${userId}, triggering immediate sync...`);
        try {
          const decryptedToken = decryptToken(userExists.token);
          await syncUserHistory(userId, decryptedToken);
          history = db.prepare('SELECT * FROM watch_history WHERE user_id = ? ORDER BY date_played DESC').all(userId);
        } catch (err: any) {
          console.error(`Immediate sync during history fetch failed for ${userId}:`, err.message);
          if (err.message === 'Unauthorized') {
            db.prepare('UPDATE users SET token = NULL WHERE id = ?').run(userId);
            return res.status(401).json({ error: 'Jellyfin token expired or invalid. Please log in again.' });
          }
        }
      }

      // Calculate stats
      const stats = {
        totalMovies: 0,
        totalEpisodes: 0,
        totalSeries: new Set<string>().size,
        totalSeasons: new Set<string>().size,
        movieWatchTime: 0, // in minutes
        seriesWatchTime: 0, // in minutes
        last10Movies: [] as any[],
        last10Shows: [] as any[],
        topGenres: [] as { name: string, count: number }[]
      };

      const seriesSet = new Set<string>();
      const seasonSet = new Set<string>();
      const genreCounts: Record<string, number> = {};

      history.forEach((h: any) => {
        const ticksToMinutes = (ticks: number) => Math.floor(ticks / 600000000);
        const secondsToMinutes = (s: number) => Math.floor(s / 60);
        
        // Use play_duration if available, else fallback to run_time_ticks (if it was marked as played)
        const watchTime = h.play_duration > 0 ? secondsToMinutes(h.play_duration) : ticksToMinutes(h.run_time_ticks);

        let genres: string[] = [];
        try {
          genres = JSON.parse(h.genres) || [];
        } catch(e) {}

        genres.forEach(g => {
          genreCounts[g] = (genreCounts[g] || 0) + 1;
        });

        if (h.type === 'Movie') {
          stats.totalMovies++;
          stats.movieWatchTime += watchTime;
          if (stats.last10Movies.length < 10) {
            stats.last10Movies.push({ name: h.name, date: h.date_played });
          }
        } else if (h.type === 'Episode' || h.type === 'Series') {
          stats.totalEpisodes++;
          stats.seriesWatchTime += watchTime;
          if (h.series_name) {
            seriesSet.add(h.series_name);
            if (stats.last10Shows.length < 10 && !stats.last10Shows.find(s => s.name === h.series_name)) {
              stats.last10Shows.push({ name: h.series_name, date: h.date_played });
            }
          }
          if (h.series_name && h.season_number !== null) {
            seasonSet.add(`${h.series_name}-S${h.season_number}`);
          }
        }
      });

      stats.topGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      stats.totalSeries = seriesSet.size;
      stats.totalSeasons = seasonSet.size;

      // Get Seerr requests
      const seerrRequests = db.prepare('SELECT * FROM seerr_requests').all();

      // Map back to Jellyfin-like format for frontend compatibility
      const mappedHistory = history.slice(0, 200).map((h: any) => ({
        Id: h.id,
        Name: h.name,
        Type: h.type,
        Genres: JSON.parse(h.genres),
        Overview: h.overview,
        DatePlayed: h.date_played,
        SeriesName: h.series_name,
        SeasonNumber: h.season_number,
        EpisodeNumber: h.episode_number,
        PlayDuration: h.play_duration,
        Client: h.client,
        Device: h.device
      }));

      res.json({
        history: mappedHistory,
        stats,
        seerrRequests
      });
    } catch (error: any) {
      console.error('History fetch error:', error.message);
      res.status(500).json({ error: 'Failed to fetch history: ' + error.message, stack: error.stack });
    }
  });

  // Seerr API Proxy - Request (Dynamic)
  app.post('/api/seerr/request', authenticate, async (req: any, res: any) => {
    try {
      const seerrUrl = getConfig('SEERR_URL');
      const seerrApiKey = getConfig('SEERR_API_KEY');
      const { mediaId, mediaType } = req.body;
      const jellyfinUserId = req.user.userId;
      
      if (!seerrUrl || !seerrApiKey) {
        return res.status(500).json({ error: 'Seerr configuration missing' });
      }

      let cleanUrl = seerrUrl.trim().replace(/\/$/, '');
      if (!cleanUrl.endsWith('/api/v1')) {
        cleanUrl = `${cleanUrl}/api/v1`;
      }

      const apiKey = seerrApiKey?.trim() || '';

      // 1. Find the Seerr user ID corresponding to the Jellyfin user ID
      const usersResponse = await axios.get(`${cleanUrl}/user`, {
        headers: { 'X-Api-Key': apiKey }
      });

      // Seerr /user returns { results: [...], pageInfo: ... }
      const users = usersResponse.data.results || usersResponse.data || [];
      const seerrUser = Array.isArray(users) ? users.find((u: any) => u.jellyfinUserId === jellyfinUserId) : null;
      
      const targetUserId = seerrUser ? seerrUser.id : null;

      const requestBody: any = {
        mediaId: Number(mediaId),
        mediaType,
        userId: targetUserId
      };

      // If seasons are provided in the body, use them. Otherwise, default to all for TV.
      if (mediaType === 'tv') {
        if (req.body.seasons && Array.isArray(req.body.seasons)) {
          requestBody.seasons = req.body.seasons.map(Number);
        } else {
          try {
            const tvDetails = await axios.get(`${cleanUrl}/tv/${mediaId}`, {
              headers: { 'X-Api-Key': apiKey }
            });
            // Request all seasons that are not "specials" (season 0)
            requestBody.seasons = tvDetails.data.seasons
              .filter((s: any) => s.seasonNumber > 0)
              .map((s: any) => s.seasonNumber);
            
            if (requestBody.seasons.length === 0 && tvDetails.data.seasons.length > 0) {
              requestBody.seasons = [tvDetails.data.seasons[0].seasonNumber];
            }
          } catch (tvErr: any) {
            console.error('Failed to fetch TV details for seasons, defaulting to season 1:', tvErr.message);
            requestBody.seasons = [1];
          }
        }
      }

      console.log(`Sending Seerr request for ${mediaType} ${mediaId} (User: ${targetUserId})`);

      const response = await axios.post(`${cleanUrl}/request`, requestBody, {
        headers: { 'X-Api-Key': apiKey }
      });

      res.json(response.data);
    } catch (error: any) {
      const seerrError = error.response?.data;
      console.error('Seerr request error:', JSON.stringify(seerrError, null, 2) || error.message);
      res.status(error.response?.status || 500).json({ 
        error: 'Failed to send request to Seerr',
        details: seerrError
      });
    }
  });

  // Seerr API Proxy - TV Details
  app.get('/api/seerr/tv/:id', async (req, res) => {
    try {
      const seerrUrl = getConfig('SEERR_URL');
      const seerrApiKey = getConfig('SEERR_API_KEY');
      const { id } = req.params;
      if (!seerrUrl || !seerrApiKey) {
        return res.status(500).json({ error: 'Seerr configuration missing' });
      }

      let cleanUrl = seerrUrl.trim().replace(/\/$/, '');
      if (!cleanUrl.endsWith('/api/v1')) {
        cleanUrl = `${cleanUrl}/api/v1`;
      }

      const response = await axios.get(`${cleanUrl}/tv/${id}`, {
        headers: { 'X-Api-Key': seerrApiKey?.trim() || '' }
      });

      res.json(response.data);
    } catch (error: any) {
      console.error('Seerr TV details error:', error.message);
      res.status(500).json({ error: 'Failed to fetch TV details' });
    }
  });

  // TMDB API Proxy - Trending
  app.get('/api/tmdb/trending', async (req, res) => {
    try {
      const tmdbToken = getConfig('TMDB_READ_ACCESS_TOKEN');
      const { type } = req.query; // type: 'movie' or 'tv'
      if (!tmdbToken) {
        return res.status(500).json({ error: 'TMDB configuration missing' });
      }

      const endpoint = type === 'tv' ? 'trending/tv/week' : 'trending/movie/week';
      const response = await axios.get(`https://api.themoviedb.org/3/${endpoint}`, {
        headers: { 
          Authorization: `Bearer ${tmdbToken.trim()}`,
          accept: 'application/json'
        }
      });

      res.json(response.data);
    } catch (error: any) {
      console.error('TMDB trending error:', error.response?.data || error.message);
      res.status(500).json({ error: 'Failed to fetch trending from TMDB' });
    }
  });

  // TMDB API Proxy - Discover by Genre
  app.get('/api/tmdb/discover_genre', async (req, res) => {
    try {
      const tmdbToken = getConfig('TMDB_READ_ACCESS_TOKEN');
      const { genre, type } = req.query as { genre: string, type: 'movie' | 'tv' };
      if (!tmdbToken || !genre) {
        return res.status(500).json({ error: 'TMDB configuration missing or genre not provided' });
      }

      const headers = { 
        Authorization: `Bearer ${tmdbToken.trim()}`,
        accept: 'application/json'
      };

      // Fetch genre list to map name to ID
      const genreResponse = await axios.get(`https://api.themoviedb.org/3/genre/${type}/list`, { headers });
      const genres = genreResponse.data.genres;
      
      const gLower = genre.toLowerCase();
      // Match exactly, or by partial match. e.g. "Sci-Fi" -> "Science Fiction" or "Sci-Fi & Fantasy"
      const matchedGenre = genres.find((g: any) => {
        const tLower = g.name.toLowerCase();
        if (tLower === gLower) return true;
        if (tLower.includes(gLower) || gLower.includes(tLower)) return true;
        if (gLower.includes('sci-fi') && tLower.includes('science')) return true;
        if (gLower.includes('fantasy') && tLower.includes('fantasy')) return true;
        if (gLower.includes('action') && tLower.includes('action')) return true;
        return false;
      });
      
      let discoverData = { results: [] };
      if (matchedGenre) {
        let endpoint = `https://api.themoviedb.org/3/discover/${type}?with_genres=${matchedGenre.id}&sort_by=popularity.desc`;
        const response = await axios.get(endpoint, { headers });
        discoverData = response.data;
      }

      res.json(discoverData);
    } catch (error: any) {
      console.error('TMDB discover error:', error.response?.data || error.message);
      res.status(500).json({ error: 'Failed to fetch discover from TMDB' });
    }
  });

  // Seerr API Proxy - Search
  app.get('/api/seerr/search', async (req, res) => {
    try {
      const seerrUrl = getConfig('SEERR_URL');
      const seerrApiKey = getConfig('SEERR_API_KEY');
      const query = req.query.query as string;
      
      if (!seerrUrl || !seerrApiKey) {
        return res.status(500).json({ error: 'Seerr configuration missing' });
      }

      if (!query || query.trim().length === 0) {
        return res.status(400).json({ error: 'Search query is required' });
      }

      let cleanUrl = seerrUrl.trim().replace(/\/$/, '');
      if (!cleanUrl.endsWith('/api/v1')) {
        cleanUrl = `${cleanUrl}/api/v1`;
      }

      const searchUrl = `${cleanUrl}/search`;
      console.log(`[Seerr] Searching: "${query}" at ${searchUrl}`);

      const response = await axios.get(searchUrl, {
        params: { query: query.trim() },
        headers: { 
          'X-Api-Key': seerrApiKey?.trim() || '',
          'Accept': 'application/json'
        }
      });

      res.json(response.data);
    } catch (error: any) {
      const seerrError = error.response?.data;
      const status = error.response?.status || 500;
      console.error(`Seerr search error (${status}):`, JSON.stringify(seerrError, null, 2) || error.message);
      res.status(status).json({ 
        error: 'Failed to search Seerr',
        details: seerrError,
        message: error.message
      });
    }
  });

  // TMDB API Proxy - Search for posters
  app.get('/api/tmdb/details', async (req, res) => {
    try {
      const tmdbToken = getConfig('TMDB_READ_ACCESS_TOKEN');
      const { id, type } = req.query;
      
      if (!tmdbToken) {
        return res.status(500).json({ error: 'TMDB configuration missing' });
      }

      if (!id || !type) {
        return res.status(400).json({ error: 'Missing id or type' });
      }

      const response = await axios.get(`https://api.themoviedb.org/3/${type}/${id}?append_to_response=credits,external_ids`, {
        headers: { 
          Authorization: `Bearer ${tmdbToken.trim()}`,
          accept: 'application/json'
        }
      });
      
      res.json(response.data);
    } catch (error: any) {
      console.error('TMDB Search Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/tmdb/advanced_search', async (req, res) => {
    try {
      const tmdbToken = getConfig('TMDB_READ_ACCESS_TOKEN');
      const { query, type = 'movie', year, genre } = req.query as { query?: string, type?: 'movie'|'tv'|'multi', year?: string, genre?: string };
      
      if (!tmdbToken) {
        return res.status(500).json({ error: 'TMDB configuration missing' });
      }

      const headers = { 
        Authorization: `Bearer ${tmdbToken.trim()}`,
        accept: 'application/json'
      };

      let genreId = null;
      if (genre && type !== 'multi') {
        try {
          const genreResponse = await axios.get(`https://api.themoviedb.org/3/genre/${type}/list`, { headers });
          const genres = genreResponse.data.genres;
          const gLower = genre.toLowerCase();
          const matchedGenre = genres.find((g: any) => g.name.toLowerCase().includes(gLower) || gLower.includes(g.name.toLowerCase()));
          if (matchedGenre) genreId = matchedGenre.id;
        } catch (e) {
          console.error("Failed to fetch genre list", e);
        }
      }

      let results: any[] = [];

      if (query && query.trim() !== '') {
        const endpoint = type === 'multi' ? 'search/multi' : `search/${type}`;
        const params: any = { query };
        if (year) {
          if (type === 'movie') params.year = year;
          if (type === 'tv') params.first_air_date_year = year;
        }
        const response = await axios.get(`https://api.themoviedb.org/3/${endpoint}`, { params, headers });
        results = response.data.results;

        // Filter by genre in code if search was used
        if (genreId && type !== 'multi') {
          results = results.filter(r => r.genre_ids && r.genre_ids.includes(genreId));
        }
      } else {
        // Use discover API
        const endpoint = type === 'tv' ? 'discover/tv' : 'discover/movie';
        const params: any = {
          sort_by: 'popularity.desc',
          'vote_count.gte': 100
        };
        if (year) {
          if (type === 'movie') params.primary_release_year = year;
          if (type === 'tv') params.first_air_date_year = year;
        }
        if (genreId) {
          params.with_genres = genreId;
        }
        const response = await axios.get(`https://api.themoviedb.org/3/${endpoint}`, { params, headers });
        results = response.data.results;
      }

      res.json({ results });
    } catch (error: any) {
      console.error('TMDB advanced search error:', error.response?.data || error.message);
      res.status(500).json({ error: 'Failed to search TMDB' });
    }
  });
  app.get('/api/tmdb/search', async (req, res) => {
    try {
      const tmdbToken = getConfig('TMDB_READ_ACCESS_TOKEN');
      const { query, type } = req.query;
      
      if (!tmdbToken) {
        console.error('TMDB_READ_ACCESS_TOKEN is missing');
        return res.status(500).json({ error: 'TMDB configuration missing' });
      }

      const endpoint = type === 'tv' ? 'search/tv' : 'search/movie';
      const response = await axios.get(`https://api.themoviedb.org/3/${endpoint}`, {
        params: { query },
        headers: { 
          Authorization: `Bearer ${tmdbToken.trim()}`,
          accept: 'application/json'
        }
      });

      res.json(response.data);
    } catch (error: any) {
      console.error('TMDB search error:', error.response?.data || error.message);
      res.status(500).json({ error: 'Failed to search TMDB' });
    }
  });

  // Seerr API Proxy - Queue/Requests
  app.get('/api/seerr/requests', async (req, res) => {
    try {
      const seerrUrl = getConfig('SEERR_URL');
      const seerrApiKey = getConfig('SEERR_API_KEY');
      if (!seerrUrl || !seerrApiKey) {
        return res.status(500).json({ error: 'Seerr configuration missing' });
      }

      let cleanUrl = seerrUrl.trim().replace(/\/$/, '');
      if (!cleanUrl.endsWith('/api/v1')) {
        cleanUrl = `${cleanUrl}/api/v1`;
      }

      const response = await axios.get(`${cleanUrl}/request`, {
        params: { take: 20, skip: 0, sort: 'added' },
        headers: { 'X-Api-Key': seerrApiKey?.trim() || '' }
      });

      res.json(response.data);
    } catch (error: any) {
      console.error('Seerr queue error:', error.message);
      res.status(500).json({ error: 'Failed to fetch Seerr queue' });
    }
  });

  // Catch-all for API routes to return JSON instead of HTML
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API endpoint ${req.path} not found` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
