/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  History, 
  Sparkles, 
  Plus, 
  Check, 
  Loader2, 
  AlertCircle, 
  Search,
  Tv,
  Film,
  RefreshCw,
  Database,
  LogOut,
  X,
  Info,
  Settings,
  Clock,
  ChevronLeft,
  ChevronRight,
  Wand2
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

// --- Types ---

interface JellyfinItem {
  Id: string;
  Name: string;
  Type: string;
  Overview?: string;
  Genres?: string[];
  ProductionYear?: number;
  SeriesName?: string;
  SeasonNumber?: number;
  EpisodeNumber?: number;
  DatePlayed?: string;
  PlayDuration?: number;
  Client?: string;
  Device?: string;
}

interface WatchStats {
  totalMovies: number;
  totalEpisodes: number;
  totalSeries: number;
  totalSeasons: number;
  movieWatchTime: number;
  seriesWatchTime: number;
  last10Movies: { name: string; date: string }[];
  last10Shows: { name: string; date: string }[];
}

interface Recommendation {
  title: string;
  type: 'movie' | 'tv';
  reason: string;
  posterPath?: string;
}

interface CategorizedRecommendations {
  movies: Recommendation[];
  shows: Recommendation[];
  trendingMovies: Recommendation[];
  trendingShows: Recommendation[];
}

interface User {
  userId: string;
  username: string;
  token: string;
  isAdmin?: boolean;
}

// --- Components ---

const MediaCard = React.memo(({ 
  item, 
  handleRequest, 
  requestingId, 
  requestedTitles 
}: { 
  item: Recommendation, 
  handleRequest: (rec: Recommendation) => void, 
  requestingId: string | null, 
  requestedTitles: Set<string> 
}) => {
  const isRequested = requestedTitles.has(item.title);
  const isLoading = requestingId === item.title;

  return (
    <div className="flex-shrink-0 w-[150px] sm:w-[180px] lg:w-[220px] flex flex-col group snap-start">
      <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-gray-900 shadow-2xl transition-transform duration-300 sm:group-hover:scale-[1.04] sm:group-hover:ring-1 sm:group-hover:ring-accent/30">
        {item.posterPath ? (
          <img 
            src={item.posterPath} 
            alt={item.title} 
            className="w-full h-full object-cover pointer-events-none select-none"
            referrerPolicy="no-referrer"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700 bg-gray-900 font-bold border border-white/5">?</div>
        )}
        
        {/* Info Trigger (Mobile/Tablet only) */}
        <div className="absolute top-2 right-2 sm:hidden pointer-events-none opacity-60">
          <div className="p-1 rounded-full bg-black/60 backdrop-blur-md text-white/50 border border-white/10">
            <Info size={12} />
          </div>
        </div>

        {/* Desktop Detail Overlay */}
        <div className="absolute inset-0 bg-gray-950/90 items-center justify-center p-6 text-center opacity-0 sm:group-hover:opacity-100 hidden sm:flex transition-opacity duration-300 pointer-events-none">
          <p className="text-xs text-accent/90 font-medium leading-relaxed italic line-clamp-8 leading-relaxed">
            "{item.reason}"
          </p>
        </div>
      </div>
      
      <div className="mt-4 px-2 space-y-2 flex-grow flex flex-col items-start">
        <h3 className="text-xs sm:text-sm font-bold tracking-tight text-gray-100 line-clamp-1 sm:group-hover:text-accent transition-colors w-full">
          {item.title}
        </h3>
        
        <button 
          onClick={() => handleRequest(item)}
          disabled={isLoading || isRequested}
          className={`
            w-full py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all
            ${isRequested 
              ? 'bg-success/10 text-success border border-success/20 cursor-default' 
              : 'bg-gray-800 text-gray-100 border border-white/5 sm:hover:bg-accent sm:hover:text-gray-950 sm:hover:border-accent'
            }
            disabled:opacity-50 flex items-center justify-center gap-2
          `}
        >
          {isLoading ? (
            <Loader2 className="animate-spin" size={12} />
          ) : isRequested ? (
            <> <Check size={12} /> Requested </>
          ) : (
            <> Request </>
          )}
        </button>
      </div>
    </div>
  );
});

const MediaRow = React.memo(({ 
  items, 
  title, 
  handleRequest, 
  requestingId, 
  requestedTitles 
}: { 
  items: Recommendation[], 
  title: string,
  handleRequest: (rec: Recommendation) => void,
  requestingId: string | null,
  requestedTitles: Set<string>
}) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - (clientWidth * 0.8) : scrollLeft + (clientWidth * 0.8);
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  return (
    <section className="relative mb-14 last:mb-0">
      <div className="flex items-end justify-between mb-5 px-6 lg:px-10">
        <div className="space-y-1">
          <h2 className="text-lg font-extrabold tracking-tight text-white flex items-center gap-3">
            {title}
          </h2>
          <div className="h-0.5 w-12 bg-accent rounded-full opacity-50" />
        </div>
        <div className="hidden md:flex gap-2">
          <button onClick={() => scroll('left')} className="p-2 rounded-lg bg-gray-900 border border-gray-800 hover:bg-gray-800 text-gray-400 hover:text-accent transition-colors">
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => scroll('right')} className="p-2 rounded-lg bg-gray-900 border border-gray-800 hover:bg-gray-800 text-gray-400 hover:text-accent transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex flex-row flex-nowrap overflow-x-auto gap-4 md:gap-6 pb-6 no-scrollbar snap-x px-6 lg:px-10"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {items.map((item) => (
          <MediaCard 
            key={item.title} 
            item={item} 
            handleRequest={handleRequest}
            requestingId={requestingId}
            requestedTitles={requestedTitles}
          />
        ))}
        <div className="flex-shrink-0 w-8 lg:w-16" aria-hidden="true" />
      </div>
    </section>
  );
});

const SetupWizard = ({ onComplete }: { onComplete: () => void }) => {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState({
    jellyfinUrl: '',
    jellyfinApiKey: '',
    tmdbToken: '',
    seerrUrl: '',
    seerrApiKey: '',
    geminiKey: ''
  });
  const [adminUser, setAdminUser] = useState<{ username: string; password: string }>({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInitialize = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Authenticate the first admin via Jellyfin first
      const authHeader = `MediaBrowser Client="StreamSense AI", Device="Web Browser", DeviceId="StreamSense-Web", Version="1.0.0"`;
      const loginRes = await fetch(`${config.jellyfinUrl.replace(/\/$/, '')}/Users/AuthenticateByName`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Emby-Authorization': authHeader
        },
        body: JSON.stringify({ Username: adminUser.username, Pw: adminUser.password })
      });

      if (!loginRes.ok) throw new Error('Jellyfin Admin authentication failed');
      const loginData = await loginRes.json();

      const payload = {
        ...config,
        adminUser: {
          userId: loginData.User.Id,
          username: loginData.User.Name,
          token: loginData.AccessToken
        }
      };

      const res = await fetch('/api/setup/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Initialization failed');
      onComplete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-gray-950 flex items-center justify-center p-6 overflow-y-auto">
      <div className="max-w-xl w-full bg-gray-900 border border-white/10 rounded-3xl p-8 lg:p-12 space-y-8">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
             <Database className="text-accent" size={32} />
          </div>
          <h1 className="text-3xl font-black italic tracking-tighter uppercase">Initial Setup</h1>
          <p className="text-gray-500 text-sm font-medium">Configure your StreamSense integration</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-xl flex items-center gap-3 text-red-200 text-sm">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <div className="space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold">1. Jellyfin Connection</h3>
              <p className="text-xs text-gray-400 leading-relaxed italic">StreamSense needs to pull your watch history to generate recommendations.</p>
              <input 
                placeholder="Jellyfin Server URL (e.g., http://192.168.1.100:8096)"
                className="w-full bg-gray-800 border border-white/5 rounded-xl px-5 py-3 text-sm focus:border-accent/50 outline-none transition-all"
                value={config.jellyfinUrl}
                onChange={e => setConfig({...config, jellyfinUrl: e.target.value})}
              />
              <input 
                placeholder="Admin API Key (Optional, or setup admin below)"
                className="w-full bg-gray-800 border border-white/5 rounded-xl px-5 py-3 text-sm focus:border-accent/50 outline-none transition-all"
                type="password"
                value={config.jellyfinApiKey}
                onChange={e => setConfig({...config, jellyfinApiKey: e.target.value})}
              />
              <div className="pt-4 space-y-4">
                 <h4 className="text-sm font-bold text-gray-300">Setting First Admin User</h4>
                 <input 
                  placeholder="Jellyfin Admin Username"
                  className="w-full bg-gray-800 border border-white/5 rounded-xl px-5 py-3 text-sm focus:border-accent/50 outline-none transition-all"
                  value={adminUser.username}
                  onChange={e => setAdminUser({...adminUser, username: e.target.value})}
                />
                <input 
                  placeholder="Jellyfin Admin Password"
                  className="w-full bg-gray-800 border border-white/5 rounded-xl px-5 py-3 text-sm focus:border-accent/50 outline-none transition-all"
                  type="password"
                  value={adminUser.password}
                  onChange={e => setAdminUser({...adminUser, password: e.target.value})}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-bold">2. TMDB & AI</h3>
                <p className="text-xs text-gray-400 leading-relaxed italic">TMDB is used for posters and discovery. Gemini powers the recommendations.</p>
                <input 
                  placeholder="TMDB Read Access Token (v4)"
                  className="w-full bg-gray-800 border border-white/5 rounded-xl px-5 py-3 text-sm focus:border-accent/50 outline-none transition-all"
                  type="password"
                  value={config.tmdbToken}
                  onChange={e => setConfig({...config, tmdbToken: e.target.value})}
                />
                <input 
                  placeholder="Google Gemini API Key"
                  className="w-full bg-gray-800 border border-white/5 rounded-xl px-5 py-3 text-sm focus:border-accent/50 outline-none transition-all"
                  type="password"
                  value={config.geminiKey}
                  onChange={e => setConfig({...config, geminiKey: e.target.value})}
                />
              </div>
              
              <div className="space-y-4">
                <h3 className="text-lg font-bold">3. Seerr Integration (Optional)</h3>
                <input 
                  placeholder="Seerr URL (Overseerr / Jellyseerr)"
                  className="w-full bg-gray-800 border border-white/5 rounded-xl px-5 py-3 text-sm focus:border-accent/50 outline-none transition-all"
                  value={config.seerrUrl}
                  onChange={e => setConfig({...config, seerrUrl: e.target.value})}
                />
                <input 
                  placeholder="Seerr API Key"
                  className="w-full bg-gray-800 border border-white/5 rounded-xl px-5 py-3 text-sm focus:border-accent/50 outline-none transition-all"
                  type="password"
                  value={config.seerrApiKey}
                  onChange={e => setConfig({...config, seerrApiKey: e.target.value})}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-4">
          {step > 1 && (
            <button 
              onClick={() => setStep(step - 1)}
              className="flex-1 py-4 text-sm font-black uppercase tracking-widest text-gray-500 hover:text-white transition-all"
            >
              Back
            </button>
          )}
          {step < 2 ? (
            <button 
              onClick={() => setStep(step + 1)}
              disabled={!config.jellyfinUrl || !adminUser.username || !adminUser.password}
              className="flex-[2] py-4 bg-gray-800 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-gray-700 transition-all disabled:opacity-50"
            >
              Next Step
            </button>
          ) : (
            <button 
              onClick={handleInitialize}
              disabled={loading || !config.tmdbToken || !config.geminiKey}
              className="flex-[2] py-4 bg-accent text-gray-950 rounded-2xl text-sm font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-accent/20 disabled:opacity-50"
            >
              {loading ? 'Initializing...' : 'Finish Setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const AdminPanel = ({ user }: { user: User }) => {
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<'users' | 'logs' | 'config'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAdminData();
  }, [activeAdminSubTab]);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const headers = { 'x-jellyfin-userid': user.userId };
      if (activeAdminSubTab === 'users') {
        const res = await fetch('/api/admin/users', { headers });
        setUsers(await res.json());
      } else if (activeAdminSubTab === 'logs') {
        const res = await fetch('/api/admin/logs', { headers });
        setLogs(await res.json());
      } else if (activeAdminSubTab === 'config') {
        const res = await fetch('/api/admin/config', { headers });
        setConfigs(await res.json());
      }
    } catch (err) {
      console.error('Admin fetch error');
    } finally {
      setLoading(false);
    }
  };

  const promoteUser = async (targetId: string, promote: boolean) => {
    try {
      await fetch('/api/admin/users/promote', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-jellyfin-userid': user.userId
        },
        body: JSON.stringify({ targetUserId: targetId, promote })
      });
      fetchAdminData();
    } catch (err) {
      console.error('Promotion failed');
    }
  };

  return (
    <div className="space-y-12 mx-6 lg:mx-10 pb-32">
       <div className="space-y-2">
          <h2 className="text-3xl font-black italic tracking-tighter uppercase">Admin Panel</h2>
          <div className="h-1 w-12 bg-accent opacity-50" />
       </div>

       <div className="flex gap-4 border-b border-white/5 pb-1 overflow-x-auto no-scrollbar">
          {[
            { id: 'users', label: 'Users', icon: <Database size={16} /> },
            { id: 'logs', label: 'Audit Logs', icon: <History size={16} /> },
            { id: 'config', label: 'API Configuration', icon: <Settings size={16} /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveAdminSubTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all relative ${
                activeAdminSubTab === tab.id ? 'text-accent' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
              {activeAdminSubTab === tab.id && (
                <motion.div layoutId="adminSub" className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent" />
              )}
            </button>
          ))}
       </div>

       {loading ? (
         <div className="py-20 flex justify-center">
            <Loader2 className="animate-spin text-accent" size={32} />
         </div>
       ) : (
         <div className="space-y-6">
            {activeAdminSubTab === 'users' && (
              <div className="grid grid-cols-1 gap-4">
                 {users.map(u => (
                   <div key={u.id} className="bg-gray-900 border border-white/5 p-6 rounded-2xl flex justify-between items-center bg-gray-900/40">
                      <div className="space-y-1">
                         <div className="flex items-center gap-3">
                            <span className="font-bold text-lg">{u.username}</span>
                            {u.is_admin === 1 && <span className="text-[8px] bg-accent/20 text-accent px-2 py-0.5 rounded-full font-black uppercase">Admin</span>}
                         </div>
                         <div className="text-[10px] text-gray-500 font-medium">ID: {u.id} | Last Sync: {u.last_history_sync || 'Never'}</div>
                      </div>
                      <div className="flex gap-2">
                         <button 
                          onClick={() => promoteUser(u.id, u.is_admin !== 1)}
                          className="px-4 py-2 rounded-lg bg-gray-800 text-[10px] font-black uppercase tracking-widest hover:bg-gray-700 transition-all"
                         >
                            {u.is_admin === 1 ? 'Demote' : 'Promote'}
                         </button>
                      </div>
                   </div>
                 ))}
              </div>
            )}

            {activeAdminSubTab === 'logs' && (
              <div className="space-y-4">
                 {logs.map(l => (
                   <div key={l.id} className="bg-gray-950/50 border border-white/5 p-4 rounded-xl text-sm flex gap-4">
                      <div className="text-gray-600 font-mono text-[10px] whitespace-nowrap pt-0.5">
                         {new Date(l.timestamp).toLocaleTimeString()}
                      </div>
                      <div className="space-y-1 min-w-0">
                         <div className="font-black uppercase text-[10px] tracking-widest text-accent/80">{l.action}</div>
                         <div className="text-gray-300 italic text-xs truncate">By {l.username} - {l.details}</div>
                      </div>
                   </div>
                 ))}
              </div>
            )}

            {activeAdminSubTab === 'config' && (
              <div className="space-y-6">
                 <div className="bg-gray-950/30 p-6 rounded-3xl border border-dashed border-white/10 space-y-4">
                    <p className="text-xs text-gray-500 italic">Editing these keys will instantly affect the platform's ability to communicate with external services.</p>
                 </div>
                 <div className="grid grid-cols-1 gap-6">
                    {configs.map(c => (
                      <div key={c.key} className="space-y-3">
                         <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">{c.key}</label>
                         <div className="flex gap-3">
                            <input 
                              defaultValue={c.value}
                              onBlur={async (e) => {
                                if (e.target.value === c.value) return;
                                await fetch('/api/admin/config', {
                                  method: 'POST',
                                  headers: { 
                                    'Content-Type': 'application/json',
                                    'x-jellyfin-userid': user.userId
                                  },
                                  body: JSON.stringify({ key: c.key, value: e.target.value, isSecret: c.isSecret })
                                });
                              }}
                              className="flex-grow bg-gray-900 border border-white/5 rounded-xl px-5 py-3 text-sm focus:border-accent/50 outline-none transition-all"
                              type={c.isSecret ? "password" : "text"}
                            />
                         </div>
                      </div>
                    ))}
                 </div>
              </div>
            )}
         </div>
       )}
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('cinema_sense_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loggingIn, setLoggingIn] = useState(false);
  const [history, setHistory] = useState<JellyfinItem[]>([]);
  const [stats, setStats] = useState<WatchStats | null>(null);
  const [recommendations, setRecommendations] = useState<CategorizedRecommendations>({ 
    movies: [], 
    shows: [],
    trendingMovies: [],
    trendingShows: []
  });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [requestedTitles, setRequestedTitles] = useState<Set<string>>(new Set());
  const [seerrRequests, setSeerrRequests] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [syncSettings, setSyncSettings] = useState({ history_sync_interval: '12', requests_sync_interval: '1' });
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [tvDetails, setTvDetails] = useState<any>(null);
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([]);
  const [loadingTvDetails, setLoadingTvDetails] = useState(false);
  const [activeRec, setActiveRec] = useState<Recommendation | null>(null);
  const [activeSeerrMatch, setActiveSeerrMatch] = useState<any>(null);
  const [lastSync, setLastSync] = useState<number>(() => {
    const saved = localStorage.getItem('cinema_sense_last_sync');
    return saved ? parseInt(saved) : 0;
  });

  const [appStatus, setAppStatus] = useState<{ isConfigured: boolean; hasAdmin: boolean; hasJellyfin: boolean } | null>(null);
  const [recsCooldown, setRecsCooldown] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'discover' | 'history' | 'admin'>('discover');

  useEffect(() => {
    checkAppStatus();
  }, []);

  useEffect(() => {
    if (user) {
      fetchHistory();
      fetchTrending();
      fetchCachedRecommendations();
    }
  }, [user]);

  // Handle cooldown timer
  useEffect(() => {
    if (recsCooldown > 0) {
      const timer = setInterval(() => {
        setRecsCooldown(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [recsCooldown]);

  const checkAppStatus = async () => {
    try {
      const res = await fetch('/api/setup/status');
      const data = await res.json();
      setAppStatus(data);
    } catch (err) {
      console.error('Failed to check app status');
    }
  };

  const fetchCachedRecommendations = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/recommendations', {
        headers: { 'x-jellyfin-userid': user.userId }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.recs && (data.recs.movies.length > 0 || data.recs.shows.length > 0)) {
          setRecommendations(prev => ({
            ...prev,
            movies: data.recs.movies,
            shows: data.recs.shows
          }));
          if (data.updatedAt) {
            const time = new Date(data.updatedAt).getTime();
            setLastSync(time);
            localStorage.setItem('cinema_sense_last_sync', time.toString());
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch cached recommendations:', err);
    }
  };

  const manualSync = async () => {
    setSyncing(true);
    try {
      await Promise.all([
        fetch('/api/admin/sync-history', { method: 'POST' }),
        fetch('/api/admin/sync-seerr', { method: 'POST' })
      ]);
      await fetchHistory();
    } catch (err: any) {
      setError('Sync failed: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const updateSyncSettings = async (settings: any) => {
    try {
      await fetch('/api/admin/sync-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      setSyncSettings(prev => ({ ...prev, ...settings }));
    } catch (err: any) {
      setError('Failed to update settings');
    }
  };

  useEffect(() => {
    if (user) {
      fetch('/api/admin/sync-settings')
        .then(res => res.json())
        .then(data => {
          const settings: any = {};
          data.forEach((s: any) => settings[s.key] = s.value);
          setSyncSettings(settings);
        });
    }
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setError(null);
    try {
      const res = await fetch('/api/jellyfin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      if (!res.ok) throw new Error('Invalid credentials');
      const userData = await res.json();
      setUser(userData);
      localStorage.setItem('cinema_sense_user', JSON.stringify(userData));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('cinema_sense_user');
    setHistory([]);
    setRecommendations({ movies: [], shows: [], trendingMovies: [], trendingShows: [] });
  };

  const fetchHistory = async () => {
    if (!user) return null;
    setLoadingHistory(true);
    setError(null);
    try {
      const response = await fetch('/api/jellyfin/history', {
        headers: {
          'x-jellyfin-userid': user.userId,
          'x-jellyfin-token': user.token,
          'x-jellyfin-username': user.username
        }
      });
      if (!response.ok) {
        if (response.status === 401) handleLogout();
        throw new Error('Failed to fetch history');
      }
      const data = await response.json();
      setHistory(data.history || []);
      setStats(data.stats || null);
      setSeerrRequests(data.seerrRequests || []);
      return data.history || [];
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchTrending = async () => {
    try {
      const [moviesRes, showsRes] = await Promise.all([
        fetch('/api/tmdb/trending?type=movie'),
        fetch('/api/tmdb/trending?type=tv')
      ]);
      
      if (!moviesRes.ok || !showsRes.ok) {
        throw new Error(`Trending fetch failed: ${moviesRes.status} / ${showsRes.status}`);
      }

      const moviesData = await moviesRes.json();
      const showsData = await showsRes.json();

      // We'll store the raw trending data to use for curation later
      // For now, show the top 10 as a fallback
      const trendingMovies = moviesData.results.slice(0, 20).map((m: any) => ({
        title: m.title,
        type: 'movie',
        reason: 'Trending this week',
        posterPath: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null
      }));

      const trendingShows = showsData.results.slice(0, 20).map((s: any) => ({
        title: s.name,
        type: 'tv',
        reason: 'Trending this week',
        posterPath: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null
      }));

      setRecommendations(prev => ({
        ...prev,
        trendingMovies,
        trendingShows
      }));

      return {
        movies: moviesData.results.slice(0, 40),
        shows: showsData.results.slice(0, 40)
      };
    } catch (err) {
      console.error('Trending fetch error:', err);
      return null;
    }
  };

  const fetchPoster = async (title: string, type: 'movie' | 'tv') => {
    try {
      const res = await fetch(`/api/tmdb/search?query=${encodeURIComponent(title)}&type=${type}`);
      if (!res.ok) return null;
      const data = await res.json();
      const poster = data.results?.[0]?.poster_path;
      return poster ? `https://image.tmdb.org/t/p/w500${poster}` : null;
    } catch (err) {
      return null;
    }
  };

  const generateRecommendations = async (historyData: JellyfinItem[]) => {
    if (historyData.length === 0 || !user) return;
    setLoadingRecs(true);
    try {
      const trendingData = await fetchTrending();
      
      const lastMovies = historyData.filter(i => i.Type === 'Movie').slice(0, 50);
      const lastShows = historyData.filter(i => i.Type === 'Episode').slice(0, 50);

      const historySummary = [...lastMovies, ...lastShows]
        .map(item => {
          if (item.Type === 'Movie') return `${item.Name} (Movie) - Genres: ${item.Genres?.join(', ')}`;
          return `${item.SeriesName || item.Name} (TV Show) - S${item.SeasonNumber}E${item.EpisodeNumber} - Genres: ${item.Genres?.join(', ')}`;
        })
        .join('\n');

      const trendingSummary = trendingData ? `
        Trending Movies (New/Popular): ${trendingData.movies.map((m: any) => m.title).join(', ')}
        Trending Shows (New/Popular): ${trendingData.shows.map((s: any) => s.name).join(', ')}
      ` : '';

      const res = await fetch('/api/recommendations/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-jellyfin-userid': user.userId,
          'x-jellyfin-username': user.username
        },
        body: JSON.stringify({ 
          historyData: historySummary,
          trendingSummary
        })
      });

      if (!res.ok) {
        if (res.status === 429) {
          const data = await res.json();
          setRecsCooldown(data.retryAfter * 60);
          throw new Error(`Rate limited. Try again in ${data.retryAfter} minutes.`);
        }
        throw new Error('Failed to generate recommendations');
      }

      const data = await res.json();
      
      // Fetch posters for all recommendations (keep this client-side or move to server? client is fine for posters)
      const fetchAllPosters = async (items: any[]) => {
        return Promise.all(items.map(async (item: any) => ({
          ...item,
          posterPath: await fetchPoster(item.title, item.type)
        })));
      };

      const [movies, shows, trendingMovies, trendingShows] = await Promise.all([
        fetchAllPosters(data.movies || []),
        fetchAllPosters(data.shows || []),
        fetchAllPosters(data.curatedTrendingMovies || []),
        fetchAllPosters(data.curatedTrendingShows || [])
      ]);

      const finalRecs = {
        movies,
        shows,
        trendingMovies,
        trendingShows
      };

      setRecommendations(finalRecs);

      // Save to backend
      await fetch('/api/recommendations/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, recs: finalRecs })
      });
      const now = Date.now();
      setLastSync(now);
      localStorage.setItem('cinema_sense_last_sync', now.toString());
    } catch (err: any) {
      console.error('Recommendation error:', err);
      setError(err.message);
    } finally {
      setLoadingRecs(false);
    }
  };

  const handleRequest = React.useCallback(async (rec: Recommendation) => {
    if (!user) return;
    setRequestingId(rec.title);
    try {
      // Use TMDB search instead of Seerr search for more reliable ID matching
      const searchRes = await fetch(`/api/tmdb/search?query=${encodeURIComponent(rec.title)}&type=${rec.type}`);
      if (!searchRes.ok) {
        const errData = await searchRes.json();
        console.error('TMDB search failed:', errData);
        throw new Error('Could not find media on TMDB');
      }
      const searchData = await searchRes.json();
      
      if (!searchData.results || searchData.results.length === 0) {
        throw new Error('Could not find media on TMDB');
      }

      // Find the best match or take the first result
      const match = searchData.results.find((r: any) => 
        (r.title || r.name)?.toLowerCase() === rec.title.toLowerCase()
      ) || searchData.results[0];

      const tmdbId = match.id;

      if (rec.type === 'tv') {
        setActiveRec(rec);
        setActiveSeerrMatch({ id: tmdbId });
        setLoadingTvDetails(true);
        setShowSeasonModal(true);
        
        try {
          const detailsRes = await fetch(`/api/seerr/tv/${tmdbId}`);
          if (!detailsRes.ok) {
            const errData = await detailsRes.json();
            throw new Error(errData.error || 'Failed to fetch series details from Seerr');
          }
          const details = await detailsRes.json();
          setTvDetails(details);
          // Default to selecting NO seasons (user must pick)
          setSelectedSeasons([]);
        } catch (detailsErr: any) {
          console.error('Seerr TV details fetch failed:', detailsErr);
          // Fallback: if we can't get details, we can't show seasons. 
          // But we can try to default to season 1 if we really have to, 
          // though it's better to show an error in the modal.
          setError(`Could not fetch seasons for ${rec.title}. Please try again.`);
          setShowSeasonModal(false);
        } finally {
          setLoadingTvDetails(false);
          setRequestingId(null);
        }
        return;
      }

      const requestRes = await fetch('/api/seerr/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: tmdbId,
          mediaType: 'movie',
          jellyfinUserId: user.userId
        })
      });

      if (!requestRes.ok) {
        const errData = await requestRes.json();
        throw new Error(errData.error || 'Failed to send request to Seerr');
      }

      setRequestedTitles(prev => new Set(prev).add(rec.title));
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(null), 5000);
    } finally {
      if (rec.type !== 'tv') setRequestingId(null);
    }
  }, [user]);

  const submitTvRequest = async () => {
    if (!user || !activeRec || !activeSeerrMatch) return;
    setRequestingId(activeRec.title);
    try {
      const requestRes = await fetch('/api/seerr/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: activeSeerrMatch.id,
          mediaType: 'tv',
          jellyfinUserId: user.userId,
          seasons: selectedSeasons
        })
      });

      if (!requestRes.ok) {
        const errData = await requestRes.json();
        throw new Error(errData.error || 'Failed to send request');
      }

      setRequestedTitles(prev => new Set(prev).add(activeRec.title));
      setShowSeasonModal(false);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setRequestingId(null);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md glass-panel p-10 rounded-[32px] space-y-8"
        >
          <div className="text-center space-y-2">
            <h1 className="logo accent-text text-4xl tracking-tighter">StreamSense</h1>
            <p className="text-text-dim text-sm">Login with your Jellyfin account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-text-dim ml-1">Username</label>
                <input 
                  type="text"
                  required
                  value={loginForm.username}
                  onChange={e => setLoginForm(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full bg-white/5 border border-glass-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent transition-all"
                  placeholder="Your Jellyfin username"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-text-dim ml-1">Password</label>
                <input 
                  type="password"
                  required
                  value={loginForm.password}
                  onChange={e => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full bg-white/5 border border-glass-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="text-red-400 text-xs flex items-center gap-2 bg-red-400/10 p-3 rounded-lg border border-red-400/20">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={loggingIn}
              className="w-full bg-text-main text-bg-deep py-4 rounded-xl font-bold text-sm hover:bg-accent hover:shadow-[0_0_20px_rgba(0,210,255,0.4)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loggingIn ? <Loader2 className="animate-spin" size={18} /> : 'Enter StreamSense'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-950 font-sans tracking-tight text-gray-100">
      <AnimatePresence>
        {/* Setup Wizard */}
        {appStatus?.isConfigured === false && (
          <SetupWizard onComplete={() => checkAppStatus()} />
        )}

        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md glass-panel bg-bg-deep/95 rounded-3xl p-8 space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-accent">Sync Settings</h2>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/5 rounded-full text-text-dim">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-text-dim uppercase tracking-widest flex items-center gap-2">
                    <Clock size={12} /> History Sync Interval (Hours)
                  </label>
                  <input 
                    type="number"
                    value={syncSettings.history_sync_interval}
                    onChange={(e) => updateSyncSettings({ history_sync_interval: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-accent outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-text-dim uppercase tracking-widest flex items-center gap-2">
                    <Clock size={12} /> Seerr Requests Sync Interval (Hours)
                  </label>
                  <input 
                    type="number"
                    value={syncSettings.requests_sync_interval}
                    onChange={(e) => updateSyncSettings({ requests_sync_interval: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-accent outline-none"
                  />
                </div>
              </div>

              <button 
                onClick={() => setShowSettings(false)}
                className="w-full py-4 rounded-xl bg-accent text-bg-deep font-bold text-sm hover:bg-accent/90 transition-all"
              >
                Save & Close
              </button>
            </motion.div>
          </div>
        )}

        {showSeasonModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-lg glass-panel bg-bg-deep/95 rounded-3xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-white/5">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h2 className="text-xl font-bold text-accent">Request Series</h2>
                    <p className="text-sm text-text-dim">{activeRec?.title}</p>
                  </div>
                  <button 
                    onClick={() => setShowSeasonModal(false)}
                    className="p-2 hover:bg-white/5 rounded-full text-text-dim transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 flex items-center gap-3 text-[11px] text-accent">
                  <Info size={14} />
                  <span>This request will be processed by Seerr.</span>
                </div>
              </div>

              <div className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {loadingTvDetails ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <Loader2 className="animate-spin text-accent" size={32} />
                    <p className="text-xs text-text-dim uppercase tracking-widest">Fetching Seasons...</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-text-dim border-b border-white/5 mb-2">
                        <div className="w-10"></div>
                        <span>Season</span>
                        <span className="text-center"># of Episodes</span>
                        <span className="text-right">Status</span>
                      </div>
                      {tvDetails?.seasons?.filter((s: any) => s.seasonNumber > 0).map((season: any) => {
                        // Check Seerr's own status first
                        let status = season.status;
                        
                        // Cross-reference with synced requests if status is not available/pending in Seerr details
                        if (status === 1) {
                          const request = seerrRequests.find(r => r.tmdb_id === activeSeerrMatch.id && r.type === 'tv');
                          if (request) {
                            // Status codes from Seerr: 1=PENDING, 2=APPROVED, 3=DECLINED
                            // But the user provided an example where status is 0, 1, etc.
                            // Let's assume if a request exists, it's at least pending
                            status = 2; // Pending
                          }
                        }

                        // Check mediaInfo for more accurate availability
                        if (tvDetails.mediaInfo) {
                          const seasonInfo = tvDetails.mediaInfo.seasons?.find((s: any) => s.seasonNumber === season.seasonNumber);
                          if (seasonInfo) {
                            status = seasonInfo.status;
                          } else if (tvDetails.mediaInfo.status === 5) {
                            status = 5; // Whole show available
                          }
                        }

                        const isAvailable = status === 5 || status === 4;
                        const isPending = status === 2 || status === 3;
                        const canRequest = !isAvailable && !isPending;
                        
                        let statusText = 'Not Requested';
                        let statusColor = 'text-text-dim';
                        
                        if (status === 5) {
                          statusText = 'Available';
                          statusColor = 'text-success';
                        } else if (status === 4) {
                          statusText = 'Partially Available';
                          statusColor = 'text-success/70';
                        } else if (status === 3) {
                          statusText = 'Processing';
                          statusColor = 'text-accent';
                        } else if (status === 2) {
                          statusText = 'Pending';
                          statusColor = 'text-accent/70';
                        }

                        return (
                          <div 
                            key={season.id}
                            className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-4 py-3 rounded-xl transition-all border border-transparent ${
                              selectedSeasons.includes(season.seasonNumber) 
                                ? 'bg-white/5 border-white/5' 
                                : 'opacity-40 grayscale'
                            } ${!canRequest ? 'opacity-80' : ''}`}
                          >
                            <button 
                              disabled={!canRequest}
                              onClick={() => {
                                setSelectedSeasons(prev => 
                                  prev.includes(season.seasonNumber) 
                                    ? prev.filter(s => s !== season.seasonNumber)
                                    : [...prev, season.seasonNumber]
                                );
                              }}
                              className={`w-10 h-5 rounded-full relative transition-colors shrink-0 ${
                                selectedSeasons.includes(season.seasonNumber) ? 'bg-accent' : 'bg-white/10'
                              } ${!canRequest ? 'cursor-not-allowed opacity-50' : ''}`}
                            >
                              <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${
                                selectedSeasons.includes(season.seasonNumber) ? 'left-6' : 'left-1'
                              }`} />
                            </button>
                            <span className="text-sm font-medium">Season {season.seasonNumber}</span>
                            <span className="text-xs text-text-dim text-center">{season.episodeCount}</span>
                            <div className="text-right">
                              <span className={`text-[9px] uppercase tracking-wider px-2 py-1 rounded-md bg-white/5 border border-white/5 ${statusColor}`}>
                                {statusText}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="space-y-4 pt-4 border-t border-white/5">
                      <h3 className="text-[10px] uppercase tracking-[0.2em] text-text-dim font-bold">Advanced</h3>
                      
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-widest text-text-dim ml-1">Quality Profile</label>
                          <div className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-text-dim flex justify-between items-center cursor-not-allowed">
                            <span>Default Profile</span>
                            <div className="w-2 h-2 rounded-full bg-accent/50" />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-widest text-text-dim ml-1">Request As</label>
                          <div className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-accent text-[10px] font-bold">
                              {user?.username?.[0]?.toUpperCase()}
                            </div>
                            <span className="font-medium">{user?.username}</span>
                            <span className="text-text-dim ml-auto text-[10px]">Jellyfin User</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="p-6 border-t border-white/5 bg-white/5 flex gap-3">
                <button 
                  onClick={() => setShowSeasonModal(false)}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-xs uppercase tracking-widest font-bold hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={submitTvRequest}
                  disabled={selectedSeasons.length === 0 || requestingId !== null}
                  className="flex-[2] py-3 rounded-xl bg-accent text-bg-deep text-xs uppercase tracking-widest font-bold hover:bg-accent/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {requestingId ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Select Season(s)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex w-64 bg-gray-950 border-r border-white/5 fixed inset-y-0 left-0 z-50 flex-col p-6">
        <div className="flex items-center gap-3 mb-10 px-2 italic uppercase font-black tracking-tighter text-xl">
          <div className="w-8 h-8 rounded bg-accent flex items-center justify-center text-gray-950 not-italic">
            <Sparkles size={18} fill="currentColor" />
          </div>
          <span className="text-white">StreamSense</span>
        </div>
        
        <nav className="flex-grow space-y-1">
          <div 
            className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all font-bold text-sm ${activeTab === 'discover' ? 'bg-accent text-gray-950 shadow-lg shadow-accent/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            onClick={() => setActiveTab('discover')}
          >
            <Sparkles size={18} />
            <span>Discover</span>
          </div>
          <div 
            className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all font-bold text-sm ${activeTab === 'history' ? 'bg-accent text-gray-950 shadow-lg shadow-accent/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={18} />
            <span>Watch History</span>
          </div>

          {user?.isAdmin && (
            <div 
              className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all font-bold text-sm ${activeTab === 'admin' ? 'bg-accent text-gray-950 shadow-lg shadow-accent/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              onClick={() => setActiveTab('admin')}
            >
              <Database size={18} />
              <span>Admin Panel</span>
            </div>
          )}

          <div className="pt-8 pb-4 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">Operations</div>

          <div 
            className="flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer text-gray-400 hover:text-white hover:bg-white/5 transition-all font-bold text-sm"
            onClick={() => setShowSettings(true)}
          >
            <Settings size={18} />
            <span>Settings</span>
          </div>
          <div 
            className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer text-gray-400 hover:text-white hover:bg-white/5 transition-all font-bold text-sm ${syncing ? 'opacity-50' : ''}`}
            onClick={syncing ? undefined : manualSync}
          >
            <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
            <span>{syncing ? 'Syncing...' : 'Sync History'}</span>
          </div>
          <div 
            className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer text-gray-400 hover:text-white hover:bg-white/5 transition-all font-bold text-sm ${loadingRecs || recsCooldown > 0 ? 'opacity-50' : ''}`}
            onClick={loadingRecs || recsCooldown > 0 ? undefined : () => generateRecommendations(history)}
          >
            {recsCooldown > 0 ? <span className="text-red-500 text-xs w-[18px] text-center font-black">{Math.ceil(recsCooldown / 60)}m</span> : <Wand2 size={18} className={loadingRecs ? 'animate-spin' : ''} />}
            <span>{recsCooldown > 0 ? 'Rate Limited' : 'Generate Recs'}</span>
          </div>
        </nav>

        <div className="pt-6 border-t border-white/5 space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-gray-800 border border-white/5 flex items-center justify-center text-[10px] font-bold text-accent">
              {user.username.substring(0, 2).toUpperCase()}
            </div>
            <div className="flex-grow min-w-0">
              <div className="text-sm font-bold text-white truncate">{user.username}</div>
              <div className="text-[10px] text-gray-500 truncate uppercase tracking-widest flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> Linked
              </div>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full py-3 rounded-xl bg-gray-900 text-gray-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-white/5"
          >
            <LogOut size={14} /> Log Out
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-3rem)] max-w-sm bg-gray-950/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl flex justify-around py-4 px-6">
        <button 
          onClick={() => setActiveTab('discover')}
          className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'discover' ? 'text-accent scale-110' : 'text-gray-500'}`}
        >
          <Sparkles size={20} />
          <span className="text-[10px] font-black tracking-widest uppercase">Discover</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'history' ? 'text-accent scale-110' : 'text-gray-500'}`}
        >
          <History size={20} />
          <span className="text-[10px] font-black tracking-widest uppercase">History</span>
        </button>
        {user?.isAdmin && (
          <button 
            onClick={() => setActiveTab('admin')}
            className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'admin' ? 'text-accent scale-110' : 'text-gray-500'}`}
          >
            <Database size={20} />
            <span className="text-[10px] font-black tracking-widest uppercase">Admin</span>
          </button>
        )}
        <button 
          onClick={() => setShowSettings(true)}
          className={`flex flex-col items-center gap-1.5 transition-all ${showSettings ? 'text-accent scale-110' : 'text-gray-500'}`}
        >
          <Plus size={20} />
          <span className="text-[10px] font-black tracking-widest uppercase">Settings</span>
        </button>
        <button 
          onClick={manualSync}
          disabled={syncing}
          className="flex flex-col items-center gap-1.5 text-gray-500 active:text-accent transition-all disabled:opacity-30"
        >
          <RefreshCw size={20} className={syncing ? 'animate-spin' : ''} />
          <span className="text-[10px] font-black tracking-widest uppercase">Sync</span>
        </button>
      </nav>

      {/* Header */}
      <header className="h-16 px-6 lg:px-10 flex items-center justify-between bg-gray-950/80 backdrop-blur-md sticky top-0 z-40 lg:hidden border-b border-gray-900">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-accent flex items-center justify-center text-gray-950">
            <Sparkles size={14} fill="currentColor" />
          </div>
          <span className="text-sm font-black tracking-tighter uppercase italic">StreamSense</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={manualSync}
            disabled={syncing}
            className="p-2 rounded-lg text-gray-400 active:bg-accent/20 active:text-accent transition-all"
          >
            <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={() => generateRecommendations(history)}
            disabled={loadingRecs || recsCooldown > 0}
            className={`p-2 rounded-lg text-gray-400 transition-all ${recsCooldown > 0 ? 'bg-red-500/10 text-red-500 cursor-not-allowed' : 'active:bg-accent/20 active:text-accent font-black'}`}
          >
            {loadingRecs ? <Loader2 size={18} className="animate-spin" /> : recsCooldown > 0 ? <span className="text-[10px]">{Math.ceil(recsCooldown / 60)}m</span> : <Wand2 size={18} />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-grow lg:ml-64 flex flex-col min-w-0">
        {/* Desktop Top Bar (Minimal) */}
        <div className="hidden lg:flex h-16 px-10 items-center justify-end bg-gray-950/50">
           <div className="flex items-center gap-4 text-xs font-bold text-gray-400">
              {lastSync > 0 && <span>Last Sync: {new Date(lastSync).toLocaleTimeString()}</span>}
              <div className="h-4 w-[1px] bg-gray-800" />
              <div className="flex items-center gap-2">
                <span>{user.username}</span>
                <div className="w-6 h-6 rounded-full bg-gray-800 border border-white/10" />
              </div>
           </div>
        </div>

        <main className="space-y-12 pb-24 lg:pb-12">
          {error && (
            <div className="mx-6 lg:mx-10 glass-panel bg-red-500/10 border-red-500/20 text-red-200 px-6 py-4 rounded-2xl flex items-center gap-3">
              <AlertCircle size={20} />
              <p>{error}</p>
            </div>
          )}

          {activeTab === 'discover' && (
            loadingRecs ? (
                <div className="space-y-12">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="space-y-6 px-0">
                      <div className="h-4 w-32 bg-gray-900 rounded animate-pulse mx-6" />
                      <div className="flex flex-row flex-nowrap overflow-x-auto gap-4 no-scrollbar px-6">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <div key={j} className="rounded-xl h-[220px] sm:h-[260px] w-[150px] sm:w-[180px] flex-shrink-0 animate-pulse bg-gray-900 border border-white/5 shadow-lg" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
            ) : (
              <>
                {/* Featured Hero (If we have recommendations) */}
                {recommendations.movies.length > 0 && (
                  <div className="px-6 lg:px-10 mb-14">
                    <div className="relative w-full aspect-[21/9] rounded-3xl overflow-hidden group shadow-2xl">
                      <img 
                        src={recommendations.movies[0].posterPath} 
                        alt="Featured" 
                        className="w-full h-full object-cover opacity-60 pointer-events-none"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/40 to-transparent flex flex-col justify-end p-8 lg:p-12">
                        <div className="space-y-4 max-w-2xl">
                          <div className="inline-block px-3 py-1 rounded-full bg-accent/20 border border-accent/30 text-accent text-[10px] font-black uppercase tracking-widest">Featured Pick</div>
                          <h1 className="text-3xl lg:text-5xl font-black italic uppercase tracking-tighter">{recommendations.movies[0].title}</h1>
                          <p className="text-sm lg:text-lg text-gray-300 font-medium italic line-clamp-2">"{recommendations.movies[0].reason}"</p>
                          <div className="pt-2">
                             <button 
                               onClick={() => handleRequest(recommendations.movies[0])}
                               disabled={requestingId === recommendations.movies[0].title || requestedTitles.has(recommendations.movies[0].title)}
                               className="px-8 py-3 rounded-xl bg-accent text-gray-950 font-black text-xs uppercase tracking-widest shadow-xl shadow-accent/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                             >
                               {requestingId === recommendations.movies[0].title ? 'Requesting...' : requestedTitles.has(recommendations.movies[0].title) ? 'Requested' : 'Request Now'}
                             </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {recommendations.movies.length > 0 && (
                  <MediaRow 
                    items={recommendations.movies.slice(1)} 
                    title="Suggested Movies" 
                    handleRequest={handleRequest}
                    requestingId={requestingId}
                    requestedTitles={requestedTitles}
                  />
                )}
                {recommendations.shows.length > 0 && (
                  <MediaRow 
                    items={recommendations.shows} 
                    title="TV Series for You" 
                    handleRequest={handleRequest}
                    requestingId={requestingId}
                    requestedTitles={requestedTitles}
                  />
                )}
                {recommendations.trendingMovies.length > 0 && (
                  <MediaRow 
                    items={recommendations.trendingMovies} 
                    title="Popular Movies" 
                    handleRequest={handleRequest}
                    requestingId={requestingId}
                    requestedTitles={requestedTitles}
                  />
                )}
                {recommendations.trendingShows.length > 0 && (
                  <MediaRow 
                    items={recommendations.trendingShows} 
                    title="Popular TV Series" 
                    handleRequest={handleRequest}
                    requestingId={requestingId}
                    requestedTitles={requestedTitles}
                  />
                )}
                {recommendations.movies.length === 0 && !loadingRecs && (
                  <div className="mx-6 lg:mx-10 py-20 text-center glass-panel rounded-[20px] border-accent/20 border-dashed">
                    <p className="text-text-dim italic text-sm">Waiting for history analysis...</p>
                  </div>
                )}
              </>
            )
          )}

          {activeTab === 'history' && (
            <div className="space-y-12 mx-6 lg:mx-10 pb-32">
              <div className="flex justify-between items-end">
                <div className="space-y-2">
                  <h2 className="text-3xl font-black italic tracking-tighter uppercase">Activity</h2>
                  <div className="h-1 w-12 bg-accent opacity-50" />
                </div>
                <button 
                  onClick={fetchHistory} 
                  disabled={loadingHistory}
                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-accent transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={14} className={loadingHistory ? 'animate-spin' : ''} />
                  Refresh History
                </button>
              </div>

              {stats && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-gray-900 border border-white/5 p-6 rounded-2xl">
                    <div className="text-3xl font-black text-white">{stats.totalMovies}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-1">Movies Polled</div>
                  </div>
                  <div className="bg-gray-900 border border-white/5 p-6 rounded-2xl">
                    <div className="text-3xl font-black text-white">{stats.totalSeries}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-1">Series Tracked</div>
                  </div>
                  <div className="bg-gray-900 border border-white/5 p-6 rounded-2xl">
                    <div className="text-3xl font-black text-white">{stats.totalEpisodes}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-1">Episodes Logged</div>
                  </div>
                  <div className="bg-gray-900 border border-white/5 p-6 rounded-2xl">
                    <div className="text-3xl font-black text-white">{Math.round((stats.movieWatchTime + stats.seriesWatchTime) / 60)}h</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-1">Total Runtime</div>
                  </div>
                </div>
              )}
              
              <div className="space-y-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-600 flex items-center gap-4">
                   Recent Plays
                   <div className="h-[1px] flex-grow bg-white/5" />
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {history.map((item) => (
                    <div key={item.Id} className="bg-gray-900 p-6 rounded-2xl border border-white/5 flex justify-between items-center group hover:bg-gray-800 transition-all cursor-default">
                      <div className="space-y-2 flex-grow min-w-0 pr-4">
                        <div className="font-bold text-lg leading-tight text-white group-hover:text-accent transition-colors truncate">{item.Name}</div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-black uppercase tracking-widest text-gray-500">
                          <span className="text-accent/60">{item.Type}</span>
                          {item.SeriesName && <span className="opacity-50">{item.SeriesName}</span>}
                          {item.SeasonNumber !== undefined && <span>S{item.SeasonNumber}</span>}
                          {item.PlayDuration !== undefined && item.PlayDuration > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock size={10} />
                              {Math.round(item.PlayDuration / 60)}m
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-gray-800 scale-75 lg:scale-100">
                        <Play size={32} fill="currentColor" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'admin' && user?.isAdmin && (
            <AdminPanel user={user} />
          )}

          {/* Bottom Section: Stats (Only on Discover) */}
          {activeTab === 'discover' && stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mx-6 lg:mx-10 overflow-hidden">
              <div className="glass-panel bg-black/20 rounded-[20px] p-6 flex flex-col justify-center text-center">
                <div className="text-2xl font-extrabold text-accent">{stats.totalMovies}</div>
                <div className="text-[10px] uppercase tracking-wider text-text-dim">Movies</div>
              </div>
              <div className="glass-panel bg-black/20 rounded-[20px] p-6 flex flex-col justify-center text-center">
                <div className="text-2xl font-extrabold text-accent">{stats.totalSeries}</div>
                <div className="text-[10px] uppercase tracking-wider text-text-dim">Series</div>
              </div>
              <div className="glass-panel bg-black/20 rounded-[20px] p-6 flex flex-col justify-center text-center">
                <div className="text-2xl font-extrabold text-accent">{stats.totalEpisodes}</div>
                <div className="text-[10px] uppercase tracking-wider text-text-dim">Episodes</div>
              </div>
              <div className="glass-panel bg-black/20 rounded-[20px] p-6 flex flex-col justify-center text-center">
                <div className="text-2xl font-extrabold text-accent">{Math.round((stats.movieWatchTime + stats.seriesWatchTime) / 60)}h</div>
                <div className="text-[10px] uppercase tracking-wider text-text-dim">Watch Time</div>
              </div>
            </div>
          )}
        </main>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          height: 6px;
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
