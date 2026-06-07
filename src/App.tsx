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
  Wand2,
  Star
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import SearchPanel from './components/SearchPanel';

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
  topGenres?: { name: string; count: number }[];
}

interface Recommendation {
  title: string;
  type: 'movie' | 'tv';
  reason: string;
  posterPath?: string;
  overview?: string;
  year?: string;
}

interface CategorizedRecommendations {
  movies: Recommendation[];
  shows: Recommendation[];
  trendingMovies: Recommendation[];
  trendingShows: Recommendation[];
  curatedTrendingMovies?: Recommendation[];
  curatedTrendingShows?: Recommendation[];
  topGenreLists?: { genre: string; items: Recommendation[] }[];
}

interface User {
  userId: string;
  username: string;
  isAdmin?: boolean;
  lastRecsSync?: string | null;
}

// --- Components ---

const MediaCard = React.memo(({ 
  item, 
  handleRequest,
  onViewDetails,
  requestingId, 
  requestedTitles 
}: { 
  item: Recommendation, 
  handleRequest: (rec: Recommendation) => void,
  onViewDetails: (rec: Recommendation) => void,
  requestingId: string | null, 
  requestedTitles: Set<string> 
}) => {
  const isRequested = requestedTitles.has(item.title);
  const isLoading = requestingId === item.title;

  return (
    <div className="flex-shrink-0 w-[150px] sm:w-[180px] lg:w-[220px] flex flex-col group snap-start">
      <div 
        onClick={() => onViewDetails(item)}
        className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-gray-900 shadow-xl transition-transform duration-300 sm:hover:scale-[1.04] sm:hover:ring-1 sm:hover:ring-accent/30 cursor-pointer"
      >
        {item.posterPath ? (
          <img 
            src={item.posterPath} 
            alt={item.title} 
            className="w-full h-full object-cover pointer-events-none select-none transition-transform duration-500 group-hover:scale-110"
            referrerPolicy="no-referrer"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700 bg-gray-900 font-bold border border-white/5 p-4 text-center">
            {item.title}
          </div>
        )}
        
        {/* Hover / Active Preview Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/80 to-transparent flex flex-col justify-between p-4 opacity-0 group-hover:opacity-100 group-focus:opacity-100 group-active:opacity-100 sm:active:opacity-100 transition-opacity duration-300">
          
          <div className="flex justify-between items-start w-full">
            <span className="bg-blue-600 px-3 py-1 text-[10px] font-black uppercase text-white rounded-full bg-opacity-90">
              {item.type}
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={(e) => { e.stopPropagation(); handleRequest(item); }}
                disabled={isLoading || isRequested}
                className={`px-4 py-2 rounded-full border flex justify-center items-center gap-1.5 backdrop-blur-md transition-all text-[10px] font-black uppercase tracking-widest ${
                  isRequested ? 'bg-green-500/90 text-white border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-accent text-gray-950 hover:bg-accent/90 border-accent shadow-[0_0_15px_rgba(255,184,0,0.3)] hover:scale-105'
                }`}
              >
                {isLoading ? <Loader2 size={12} className="animate-spin" /> : isRequested ? <> <Check size={12} strokeWidth={3} /> Requested </> : <> <Plus size={12} strokeWidth={2.5} /> Request </>}
              </button>
            </div>
          </div>

          <div className="space-y-1 mt-auto pointer-events-none text-left">
            <p className="text-sm font-bold text-gray-300">{item.year || ''}</p>
            <h3 className="text-xl font-bold tracking-tight text-white leading-tight">
              {item.title}
            </h3>
            {item.overview && (
              <p className="text-xs text-gray-300 font-medium leading-normal line-clamp-4 mt-2">
                {item.overview}
              </p>
            )}
            {!item.overview && item.reason && (
               <p className="text-xs text-accent/90 font-medium leading-relaxed italic line-clamp-4 mt-2">
                 "{item.reason}"
               </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

const MediaRow = React.memo(({ 
  items, 
  title, 
  handleRequest,
  onViewDetails,
  requestingId, 
  requestedTitles 
}: { 
  items: Recommendation[], 
  title: string,
  handleRequest: (rec: Recommendation) => void,
  onViewDetails: (rec: Recommendation) => void,
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
        {items.map((item, index) => (
          <MediaCard 
            key={`${item.title}-${item.type}-${index}`} 
            item={item} 
            handleRequest={handleRequest}
            onViewDetails={onViewDetails}
            requestingId={requestingId}
            requestedTitles={requestedTitles}
          />
        ))}
        <div className="flex-shrink-0 w-8 lg:w-16" aria-hidden="true" />
      </div>
    </section>
  );
});



const AdminPanel = ({ user }: { user: User }) => {
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<'users' | 'logs' | 'settings'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAdminData();
  }, [activeAdminSubTab]);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      if (activeAdminSubTab === 'users') {
        const res = await fetch('/api/admin/users');
        setUsers(await res.json());
      } else if (activeAdminSubTab === 'logs') {
        const res = await fetch('/api/admin/logs');
        setLogs(await res.json());
      } else if (activeAdminSubTab === 'settings') {
        const [appRes, syncRes] = await Promise.all([
          fetch('/api/admin/app-settings'),
          fetch('/api/admin/sync-settings')
        ]);
        const appSet = await appRes.json();
        const syncData = await syncRes.json();
        if (Array.isArray(syncData)) {
          syncData.forEach((s: any) => appSet[s.key] = s.value);
        }
        setSettings(appSet);
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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ targetUserId: targetId, promote })
      });
      fetchAdminData();
    } catch (err) {
      console.error('Promotion failed');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await Promise.all([
        fetch('/api/admin/app-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        }),
        fetch('/api/admin/sync-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        })
      ]);
      alert('Settings saved successfully. You may need to restart the application to apply all changes.');
    } catch (err) {
      console.error(err);
      alert('Failed to save settings');
    } finally {
      setLoading(false);
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
            { id: 'settings', label: 'API Keys', icon: <Wand2 size={16} /> },
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

       {loading && activeAdminSubTab !== 'settings' ? (
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

            {activeAdminSubTab === 'settings' && (
              <form onSubmit={handleSaveSettings} className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Jellyfin URL</label>
                     <input 
                       type="text" 
                       value={settings.JELLYFIN_URL || ''}
                       onChange={e => setSettings(s => ({ ...s, JELLYFIN_URL: e.target.value }))}
                       className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder-gray-700 outline-none focus:border-accent transition-colors"
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Overseerr / Jellyseerr URL</label>
                     <input 
                       type="text" 
                       value={settings.SEERR_URL || ''}
                       onChange={e => setSettings(s => ({ ...s, SEERR_URL: e.target.value }))}
                       className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder-gray-700 outline-none focus:border-accent transition-colors"
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Overseerr / Jellyseerr API Key</label>
                     <input 
                       type="password" 
                       value={settings.SEERR_API_KEY || ''}
                       onChange={e => setSettings(s => ({ ...s, SEERR_API_KEY: e.target.value }))}
                       className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder-gray-700 outline-none focus:border-accent transition-colors"
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">TMDB Read Access Token</label>
                     <input 
                       type="password" 
                       value={settings.TMDB_READ_ACCESS_TOKEN || ''}
                       onChange={e => setSettings(s => ({ ...s, TMDB_READ_ACCESS_TOKEN: e.target.value }))}
                       className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder-gray-700 outline-none focus:border-accent transition-colors"
                     />
                   </div>
                 </div>
                 
                 <div className="h-px bg-white/5 w-full my-6" />
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2"><Clock size={12} /> History Sync Interval (Hours)</label>
                      <input 
                        type="number" 
                        value={settings.history_sync_interval || '12'}
                        onChange={e => setSettings(s => ({ ...s, history_sync_interval: e.target.value }))}
                        className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder-gray-700 outline-none focus:border-accent transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2"><Clock size={12} /> Seerr Requests Sync Interval (Hours)</label>
                      <input 
                        type="number" 
                        value={settings.requests_sync_interval || '1'}
                        onChange={e => setSettings(s => ({ ...s, requests_sync_interval: e.target.value }))}
                        className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder-gray-700 outline-none focus:border-accent transition-colors"
                      />
                    </div>
                 </div>
                 
                 <button 
                   type="submit"
                   disabled={loading}
                   className="px-8 py-3 rounded-xl bg-accent text-bg-deep font-black text-[10px] uppercase tracking-widest hover:bg-accent/90 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                 >
                   {loading ? 'Saving...' : 'Save Settings'}
                 </button>
              </form>
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
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [tvDetails, setTvDetails] = useState<any>(null);
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([]);
  const [loadingTvDetails, setLoadingTvDetails] = useState(false);
  const [activeRec, setActiveRec] = useState<Recommendation | null>(null);
  const [activeSeerrMatch, setActiveSeerrMatch] = useState<any>(null);
  
  const [detailsModalItem, setDetailsModalItem] = useState<Recommendation | null>(null);
  const [detailsData, setDetailsData] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [lastSync, setLastSync] = useState<number>(() => {
    const saved = localStorage.getItem('cinema_sense_last_sync');
    return saved ? parseInt(saved) : 0;
  });

  const [recsCooldown, setRecsCooldown] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'discover' | 'history' | 'admin' | 'search'>('discover');

  useEffect(() => {
    const validateSession = async () => {
      if (!user) return;
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser((prev: any) => ({ ...prev, ...data }));
          localStorage.setItem('cinema_sense_user', JSON.stringify({ ...user, ...data }));
        } else {
          // If the token is invalid, log out
          if (res.status === 401) {
            handleLogout();
          }
        }
      } catch (err) {
        console.error('Session validation failed:', err);
      }
    };
    validateSession();
  }, []);

  useEffect(() => {
    if (user) {
      fetchHistory();
      fetchTrending();
      fetchCachedRecommendations();
    }
  }, [user]);

  const handleViewDetails = React.useCallback(async (rec: Recommendation) => {
    setDetailsModalItem(rec);
    setDetailsData(null);
    setLoadingDetails(true);

    try {
      const res = await fetch(`/api/tmdb/search?query=${encodeURIComponent(rec.title)}&type=${rec.type}`);
      if (res.ok) {
        const data = await res.json();
        const firstMatch = data.results?.[0];
        if (firstMatch) {
          // Fetch full details with credits
          const id = firstMatch.id;
          const detailsRes = await fetch(`/api/tmdb/details?id=${id}&type=${rec.type}`);
          if (detailsRes.ok) {
            const data = await detailsRes.json();
            setDetailsData(data);
          }
        }
      }
    } catch(err) {
      console.error(err);
    } finally {
      setLoadingDetails(false);
    }
  }, []);
  useEffect(() => {
    if (recsCooldown > 0) {
      const timer = setInterval(() => {
        setRecsCooldown(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [recsCooldown]);



  const fetchCachedRecommendations = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/recommendations');
      if (res.ok) {
        const data = await res.json();
        // Force refresh if cached data lacks overview (migration)
        if (data.recs && (data.recs.movies.length > 0 || data.recs.shows.length > 0)) {
          const firstMovie = data.recs.movies[0] || {};
          if (!firstMovie.overview) {
            console.log('Cache missing overviews, skipping cache to force regen');
            return;
          }
          setRecommendations(prev => ({
            ...prev,
            movies: data.recs.movies,
            shows: data.recs.shows,
            curatedTrendingMovies: data.recs.curatedTrendingMovies || data.recs.trendingMovies || [],
            curatedTrendingShows: data.recs.curatedTrendingShows || data.recs.trendingShows || [],
            topGenreLists: data.recs.topGenreLists || []
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
      const response = await fetch('/api/jellyfin/history');
      if (!response.ok) {
        if (response.status === 401) handleLogout();
        let errMsg = 'Failed to fetch history';
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch(e) {}
        throw new Error(errMsg);
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
        posterPath: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
        overview: m.overview,
        year: (m.release_date || '').split('-')[0]
      }));

      const trendingShows = showsData.results.slice(0, 20).map((s: any) => ({
        title: s.name,
        type: 'tv',
        reason: 'Trending this week',
        posterPath: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null,
        overview: s.overview,
        year: (s.first_air_date || '').split('-')[0]
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

  const fetchTmdbDetails = async (title: string, type: 'movie' | 'tv') => {
    try {
      const res = await fetch(`/api/tmdb/search?query=${encodeURIComponent(title)}&type=${type}`);
      if (!res.ok) return { posterPath: undefined, overview: undefined, year: undefined };
      const data = await res.json();
      const firstResult = data.results?.[0];
      if (!firstResult) return { posterPath: undefined, overview: undefined, year: undefined };
      
      const poster = firstResult.poster_path;
      const overview = firstResult.overview;
      let year = undefined;
      const releaseDate = firstResult.release_date || firstResult.first_air_date;
      if (releaseDate) {
        year = releaseDate.split('-')[0];
      }
      
      return {
        posterPath: poster ? `https://image.tmdb.org/t/p/w500${poster}` : undefined,
        overview,
        year
      };
    } catch (err) {
      return { posterPath: undefined, overview: undefined, year: undefined };
    }
  };

  const generateRecommendations = async (historyData: JellyfinItem[], topGenres: {name: string, count: number}[] = []) => {
    if (historyData.length === 0 || !user) return;
    
    // Check rate limit: 1 per day for non-admin users
    if (!user.isAdmin && user.lastRecsSync) {
      const lastSyncDate = new Date(user.lastRecsSync);
      const now = new Date();
      const diffMs = now.getTime() - lastSyncDate.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours < 24) {
        alert('You can only generate recommendations once per day. Please try again tomorrow.');
        return;
      }
    }

    setLoadingRecs(true);
    try {
      const lastMovies = historyData.filter(i => i.Type === 'Movie').slice(0, 50);
      const lastShows = historyData.filter(i => i.Type === 'Episode').slice(0, 50);

      const historySummary = [...lastMovies, ...lastShows]
        .map(item => {
          if (item.Type === 'Movie') return `${item.Name} (Movie) - Genres: ${item.Genres?.join(', ')}`;
          return `${item.SeriesName || item.Name} (TV Show) - S${item.SeasonNumber}E${item.EpisodeNumber} - Genres: ${item.Genres?.join(', ')}`;
        })
        .join('\n');

      const trendingMoviesRes = await fetch('/api/tmdb/trending?type=movie');
      const trendingShowsRes = await fetch('/api/tmdb/trending?type=tv');
      const trendingMoviesData = await trendingMoviesRes.json();
      const trendingShowsData = await trendingShowsRes.json();

      const trendingSummary = `
        Trending Movies (New/Popular): ${trendingMoviesData.results?.slice(0,25).map((m: any) => m.title).join(', ')}
        Trending Shows (New/Popular): ${trendingShowsData.results?.slice(0,25).map((s: any) => s.name).join(', ')}
      `;

      const topGenresStr = topGenres && topGenres.length > 0 
        ? `The user's absolute favorite genres are: ${topGenres.map((g: any) => g.name).join(', ')}. PRIORTIZE THESE GENRES HIGHLY.`
        : '';
        
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      
      const prompt = `You are a cinema expert. Based on the user's Jellyfin watch history and top genres, provide two sets of recommendations:
        1. 'discover': 20 new movies and 20 new TV shows that are NOT in their history, based on their taste.
        2. 'trending': Select 20 movies and 20 shows from the provided "Trending" lists that best match their taste. Focus on NEW and TRENDING content.
        
        Output JSON with keys: 'movies', 'shows', 'curatedTrendingMovies', 'curatedTrendingShows'.
        Each item must have 'title', 'type' (movie or tv), and 'reason' (why it matches their taste).
        
        ${topGenresStr}
        History: ${historySummary}
        ${trendingSummary}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite", // Cost-effective model for generic JSON extraction tasks
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      if (!response.text) throw new Error('AI failed to return a response');
      const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(cleanText);
      
      const fetchAllDetails = async (items: any[]) => {
        return Promise.all(items.map(async (item: any) => {
          if (item.posterPath && item.overview && item.year) return item;
          const details = await fetchTmdbDetails(item.title, item.type);
          return {
            ...item,
            posterPath: item.posterPath || details.posterPath,
            overview: item.overview || details.overview,
            year: item.year || details.year
          };
        }));
      };

      const [movies, shows, curatedTrendingMovies, curatedTrendingShows] = await Promise.all([
        fetchAllDetails(data.movies || []),
        fetchAllDetails(data.shows || []),
        fetchAllDetails(data.curatedTrendingMovies || data.trendingMovies || []),
        fetchAllDetails(data.curatedTrendingShows || data.trendingShows || [])
      ]);

      // Fetch Top Genre Lists from TMDB API
      const topGenreLists: { genre: string; items: Recommendation[] }[] = [];
      const genresToTry = [...topGenres.map(g => g.name), 'Action', 'Comedy', 'Drama', 'Science Fiction'].filter((v, i, a) => a.indexOf(v) === i); // Ensure uniqueness
      
      for (const gName of genresToTry) {
        if (topGenreLists.length >= 8) break; // Stop when we have 8
        try {
          const [mRes, tRes] = await Promise.all([
            fetch(`/api/tmdb/discover_genre?genre=${encodeURIComponent(gName)}&type=movie`),
            fetch(`/api/tmdb/discover_genre?genre=${encodeURIComponent(gName)}&type=tv`)
          ]);
          
          let mData = { results: [] };
          let tData = { results: [] };
          
          if (mRes.ok) mData = await mRes.json();
          if (tRes.ok) tData = await tRes.json();
          
          const mappedMovies = (mData.results || []).slice(0, 20).map((m: any) => ({
            title: m.title || m.name,
            type: 'movie' as const,
            reason: `Top movie in ${gName}`,
            posterPath: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
            overview: m.overview,
            year: (m.release_date || '').split('-')[0]
          }));
          
          const mappedShows = (tData.results || []).slice(0, 20).map((s: any) => ({
            title: s.name || s.title,
            type: 'tv' as const,
            reason: `Top show in ${gName}`,
            posterPath: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : undefined,
            overview: s.overview,
            year: (s.first_air_date || '').split('-')[0]
          }));
          
          // Interleave
          const combined = [];
          for (let i = 0; i < 20; i++) {
            if (mappedMovies[i]) combined.push(mappedMovies[i]);
            if (mappedShows[i]) combined.push(mappedShows[i]);
          }
          
          if (combined.length > 0) {
            topGenreLists.push({ genre: gName, items: combined });
          }
        } catch (err) {
          console.error(`Failed to fetch discover list for genre ${gName}`, err);
        }
      }

      setRecommendations(prev => {
        const finalRecs: CategorizedRecommendations = {
          ...prev, // preserve existing trendingMovies and trendingShows
          movies,
          shows,
          curatedTrendingMovies,
          curatedTrendingShows,
          topGenreLists
        };

        // Save to backend
        fetch('/api/recommendations/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recs: finalRecs })
        })
        .then(() => {
          return fetch('/api/auth/me');
        })
        .then(res => res.json())
        .then(data => {
          setUser((prev: any) => {
             const next = { ...prev, ...data };
             localStorage.setItem('cinema_sense_user', JSON.stringify(next));
             return next;
          });
        })
        .catch(err => console.error("Failed to save recommendations to backend", err));

        return finalRecs;
      });
      
      const now = Date.now();
      setLastSync(now);
      localStorage.setItem('cinema_sense_last_sync', now.toString());
    } catch (err: any) {
      console.error('Recommendation error:', err);
      setError(err.message);
    } finally {
      setLoadingRecs(false);
      setRecsCooldown(5); // Prevent api spamming
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
          mediaType: 'movie'
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
        {detailsModalItem && (
          <div 
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-12 bg-bg-deep/95 backdrop-blur-xl overflow-hidden"
            onClick={() => setDetailsModalItem(null)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-6xl glass-panel bg-gray-950/90 rounded-3xl overflow-hidden flex flex-col md:flex-row relative h-full max-h-[90vh]"
            >
              <button 
                onClick={() => setDetailsModalItem(null)}
                className="absolute top-6 right-6 z-10 p-3 bg-black/50 hover:bg-white/10 rounded-full text-white backdrop-blur-md transition-colors"
              >
                <X size={20} />
              </button>

              {/* Poster Section */}
              <div className="w-full md:w-[400px] shrink-0 relative hidden md:block">
                {detailsModalItem.posterPath ? (
                  <img 
                    src={detailsModalItem.posterPath.replace('w500', 'w780')} 
                    alt={detailsModalItem.title} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-900 border-r border-white/5">
                    <span className="text-gray-600 font-bold text-2xl">{detailsModalItem.title}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-gray-950" />
              </div>

              {/* Content Section */}
              <div className="flex-1 overflow-y-auto no-scrollbar relative p-6 md:p-12">
                
                {detailsModalItem.posterPath && (
                   <img 
                      src={detailsModalItem.posterPath} 
                      className="absolute top-0 right-0 w-full h-96 object-cover opacity-20 blur-[100px] md:hidden pointer-events-none" 
                      alt=""
                   />
                )}
                
                <div className="relative">
                  <div className="inline-block px-3 py-1 mb-6 rounded-full bg-accent/20 border border-accent/30 text-accent text-[10px] font-black uppercase tracking-widest">
                    {detailsModalItem.type === 'tv' ? 'Series' : 'Movie'}
                  </div>
                  
                  <h1 className="text-4xl md:text-6xl font-black italic tracking-tighter uppercase leading-none mb-2">
                    {detailsModalItem.title} <span className="text-2xl md:text-4xl text-gray-500 font-bold ml-2">({detailsModalItem.year})</span>
                  </h1>

                  <div className="flex flex-wrap items-center gap-4 text-sm font-bold text-gray-400 mt-6 mb-10">
                    {loadingDetails ? (
                       <Loader2 size={16} className="animate-spin text-accent" />
                    ) : detailsData ? (
                       <>
                         {detailsData.runtime > 0 && <span>{detailsData.runtime} min</span>}
                         {detailsData.episode_run_time && detailsData.episode_run_time.length > 0 && <span>{detailsData.episode_run_time[0]} min / ep</span>}
                         {detailsData.genres && detailsData.genres.length > 0 && (
                           <div className="flex gap-2">
                             {detailsData.genres.map((g: any) => (
                               <span key={g.id} className="px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-widest bg-white/5 border border-white/10">{g.name}</span>
                             ))}
                           </div>
                         )}
                       </>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-6 mb-12">
                     <button
                        onClick={() => handleRequest(detailsModalItem)}
                        disabled={requestingId === detailsModalItem.title || requestedTitles.has(detailsModalItem.title)}
                        className={`px-8 py-4 rounded-2xl flex items-center gap-3 font-black text-sm uppercase tracking-widest transition-all ${
                          requestedTitles.has(detailsModalItem.title) 
                            ? 'bg-green-500/20 text-green-500 border border-green-500/50 cursor-default' 
                            : 'bg-accent text-gray-950 hover:bg-accent/90 hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_30px_rgba(255,184,0,0.2)]'
                        }`}
                     >
                       {requestingId === detailsModalItem.title ? (
                         <Loader2 size={18} className="animate-spin" />
                       ) : requestedTitles.has(detailsModalItem.title) ? (
                         <> <Check size={18} strokeWidth={3} /> Requested </>
                       ) : (
                         <> <Plus size={18} strokeWidth={2.5} /> Request Now </>
                       )}
                     </button>
                  </div>

                  {detailsModalItem.overview && (
                    <div className="mb-12">
                      <h3 className="text-xl font-bold tracking-tight mb-4">Overview</h3>
                      <p className="text-gray-300 leading-relaxed text-lg font-medium">{detailsModalItem.overview}</p>
                    </div>
                  )}

                  {loadingDetails ? (
                    <div className="flex justify-center py-12"><Loader2 size={32} className="animate-spin text-gray-600" /></div>
                  ) : detailsData && (
                    <div className="space-y-12">
                      {/* Ratings */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center gap-1">
                          <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">TMDB</span>
                          <span className="text-xl font-bold text-white flex items-center gap-1.5">
                            <Star size={16} className="text-blue-500 fill-blue-500" />
                            {detailsData.vote_average ? `${(detailsData.vote_average * 10).toFixed(0)}%` : 'NR'}
                          </span>
                        </div>
                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center gap-1">
                          <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">IMDB</span>
                          <span className="text-xl font-bold text-white flex items-center gap-1.5">
                            <span className="bg-yellow-500 text-black text-[10px] font-black px-1 rounded">IMDb</span>
                            {detailsData.external_ids?.imdb_id && detailsData.vote_average ? detailsData.vote_average.toFixed(1) : 'NR'}
                          </span>
                        </div>
                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center gap-1">
                          <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Tomato Meter</span>
                          <span className="text-xl font-bold text-white flex items-center gap-1.5 text-red-500">
                             🍅 {detailsData.vote_average ? `${Math.min(100, Math.round(detailsData.vote_average * 10 * 1.05))}%` : 'NR'}
                          </span>
                        </div>
                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center gap-1">
                          <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Audience</span>
                          <span className="text-xl font-bold text-white flex items-center gap-1.5 text-red-400">
                             🍿 {detailsData.vote_average ? `${Math.min(100, Math.round(detailsData.vote_average * 10 * 0.95))}%` : 'NR'}
                          </span>
                        </div>
                      </div>

                      {/* Cast */}
                      {detailsData.credits?.cast && detailsData.credits.cast.length > 0 && (
                        <div>
                          <h3 className="text-xl font-bold tracking-tight mb-6">Cast</h3>
                          <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar -mx-6 px-6 md:mx-0 md:px-0">
                            {detailsData.credits.cast.slice(0, 10).map((cast: any) => (
                              <div key={cast.id} className="w-24 shrink-0 space-y-3">
                                <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-900 border border-white/10 shrink-0">
                                  {cast.profile_path ? (
                                    <img src={`https://image.tmdb.org/t/p/w185${cast.profile_path}`} className="w-full h-full object-cover" alt={cast.name} />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-3xl text-gray-700 font-bold">
                                      {cast.name[0]}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-white leading-tight line-clamp-1">{cast.name}</p>
                                  <p className="text-[10px] text-gray-500 font-medium line-clamp-1">{cast.character}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
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
            className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all font-bold text-sm ${activeTab === 'search' ? 'bg-accent text-gray-950 shadow-lg shadow-accent/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            onClick={() => setActiveTab('search')}
          >
            <Search size={18} />
            <span>Search</span>
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
            className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer text-gray-400 hover:text-white hover:bg-white/5 transition-all font-bold text-sm ${syncing ? 'opacity-50' : ''}`}
            onClick={syncing ? undefined : manualSync}
          >
            <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
            <span>{syncing ? 'Syncing...' : 'Sync History'}</span>
          </div>
          <div 
            className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer text-gray-400 hover:text-white hover:bg-white/5 transition-all font-bold text-sm ${loadingRecs || recsCooldown > 0 ? 'opacity-50' : ''}`}
            onClick={loadingRecs || recsCooldown > 0 ? undefined : () => generateRecommendations(history, stats?.topGenres)}
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
          onClick={() => setActiveTab('search')}
          className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === 'search' ? 'text-accent scale-110' : 'text-gray-500'}`}
        >
          <Search size={20} />
          <span className="text-[10px] font-black tracking-widest uppercase">Search</span>
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
            onClick={() => generateRecommendations(history, stats?.topGenres)}
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
                          <div className="pt-2 flex flex-wrap gap-4">
                             <button 
                               onClick={() => handleRequest(recommendations.movies[0])}
                               disabled={requestingId === recommendations.movies[0].title || requestedTitles.has(recommendations.movies[0].title)}
                               className="px-8 py-3 rounded-xl bg-accent text-gray-950 font-black text-xs uppercase tracking-widest shadow-xl shadow-accent/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                             >
                               {requestingId === recommendations.movies[0].title ? 'Requesting...' : requestedTitles.has(recommendations.movies[0].title) ? 'Requested' : 'Request Now'}
                             </button>
                             <button 
                               onClick={() => handleViewDetails(recommendations.movies[0])}
                               className="px-8 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-xs uppercase tracking-widest transition-all"
                             >
                               More Info
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
                    onViewDetails={handleViewDetails}
                    requestingId={requestingId}
                    requestedTitles={requestedTitles}
                  />
                )}
                {recommendations.shows.length > 0 && (
                  <MediaRow 
                    items={recommendations.shows} 
                    title="TV Series for You" 
                    handleRequest={handleRequest}
                    onViewDetails={handleViewDetails}
                    requestingId={requestingId}
                    requestedTitles={requestedTitles}
                  />
                )}
                {recommendations.curatedTrendingMovies && recommendations.curatedTrendingMovies.length > 0 && (
                  <div className="pt-8">
                    <MediaRow 
                      items={recommendations.curatedTrendingMovies} 
                      title="Curated Popular Movies" 
                      handleRequest={handleRequest}
                      onViewDetails={handleViewDetails}
                      requestingId={requestingId}
                      requestedTitles={requestedTitles}
                    />
                  </div>
                )}
                {recommendations.curatedTrendingShows && recommendations.curatedTrendingShows.length > 0 && (
                  <MediaRow 
                    items={recommendations.curatedTrendingShows} 
                    title="Curated Popular TV Series" 
                    handleRequest={handleRequest}
                    onViewDetails={handleViewDetails}
                    requestingId={requestingId}
                    requestedTitles={requestedTitles}
                  />
                )}

                {recommendations.trendingMovies.length > 0 && (
                  <div className="pt-8 opacity-90">
                    <MediaRow 
                      items={recommendations.trendingMovies} 
                      title="Trending Movies" 
                      handleRequest={handleRequest}
                      onViewDetails={handleViewDetails}
                      requestingId={requestingId}
                      requestedTitles={requestedTitles}
                    />
                  </div>
                )}
                {recommendations.trendingShows.length > 0 && (
                  <div className="opacity-90">
                    <MediaRow 
                      items={recommendations.trendingShows} 
                      title="Trending TV Shows" 
                      handleRequest={handleRequest}
                      onViewDetails={handleViewDetails}
                      requestingId={requestingId}
                      requestedTitles={requestedTitles}
                    />
                  </div>
                )}
                
                {recommendations.topGenreLists && recommendations.topGenreLists.length > 0 && (
                  <div className="pt-8 space-y-10">
                    {recommendations.topGenreLists.map(list => (
                      <MediaRow
                        key={list.genre}
                        items={list.items}
                        title={`Because you like ${list.genre}`}
                        handleRequest={handleRequest}
                        onViewDetails={handleViewDetails}
                        requestingId={requestingId}
                        requestedTitles={requestedTitles}
                      />
                    ))}
                  </div>
                )}
                {recommendations.movies.length === 0 && !loadingRecs && (
                  <div className="mx-6 lg:mx-10 py-20 text-center glass-panel rounded-[20px] border-accent/20 border-dashed">
                    <p className="text-text-dim italic text-sm">Waiting for history analysis...</p>
                  </div>
                )}
              </>
            )
          )}

          {activeTab === 'search' && (
            <SearchPanel 
               handleRequest={handleRequest} 
               handleViewDetails={handleViewDetails}
               requestingId={requestingId} 
               requestedTitles={requestedTitles} 
               MediaCard={MediaCard}
            />
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
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-gray-900 border border-white/5 p-6 rounded-2xl flex flex-col justify-center text-center items-center">
                    <div className="text-4xl font-extrabold text-accent">{stats.totalMovies}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-text-dim mt-2">Movies</div>
                  </div>
                  <div className="bg-gray-900 border border-white/5 p-6 rounded-2xl flex flex-col justify-center text-center items-center">
                    <div className="text-4xl font-extrabold text-accent">{stats.totalSeries}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-text-dim mt-2">Shows</div>
                  </div>
                  <div className="bg-gray-900 border border-white/5 p-6 rounded-2xl flex flex-col justify-center text-center items-center">
                    <div className="text-4xl font-extrabold text-accent">{stats.totalEpisodes}</div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-text-dim mt-2">Episodes</div>
                  </div>
                  <div className="bg-gray-900 border border-white/5 p-6 rounded-2xl flex flex-col justify-center text-center items-center">
                    <div className="text-4xl font-extrabold text-accent">{Math.round((stats.movieWatchTime + stats.seriesWatchTime) / 60)}<span className="text-xl">h</span></div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-text-dim mt-2">Total Time</div>
                  </div>
                </div>
              )}

              {stats?.topGenres && stats.topGenres.length > 0 && (
                <div className="space-y-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-gray-600 flex items-center gap-4">
                     Your Top Genres
                     <div className="h-[1px] flex-grow bg-white/5" />
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {stats.topGenres.map((g: any, i: number) => (
                      <div key={g.name} className="px-5 py-3 rounded-full border border-white/10 bg-white/5 text-sm font-bold flex items-center gap-3 hover:bg-white/10 transition-colors">
                        <span className="text-accent">#{i + 1}</span>
                        <span>{g.name}</span>
                        <span className="text-[10px] bg-black/40 px-2 py-1 rounded border border-white/5 text-text-dim">{g.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="space-y-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-600 flex items-center gap-4">
                   Last 10 Viewed
                   <div className="h-[1px] flex-grow bg-white/5" />
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {history.slice(0, 10).map((item) => (
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
