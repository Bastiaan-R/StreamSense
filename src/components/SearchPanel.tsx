import React, { useState, useEffect } from 'react';
import { Search, Filter, Loader2, ChevronDown } from 'lucide-react';

export default function SearchPanel({ 
  handleRequest, 
  handleViewDetails, 
  requestingId, 
  requestedTitles,
  MediaCard
}: { 
  handleRequest: any; 
  handleViewDetails: any; 
  requestingId: string|null; 
  requestedTitles: Set<string>;
  MediaCard: any;
}) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('movie');
  const [year, setYear] = useState('');
  const [genre, setGenre] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const performSearch = async () => {
    if (!query.trim() && !year && !genre) return;
    setLoading(true);
    setSearched(true);
    
    try {
      const qs = new URLSearchParams();
      if (query.trim()) qs.set('query', query.trim());
      if (type) qs.set('type', type);
      if (year) qs.set('year', year);
      if (genre) qs.set('genre', genre);

      const res = await fetch(`/api/tmdb/advanced_search?${qs.toString()}`);
      if (res.ok) {
        const data = await res.json();
        // Map to Recommendation
        const mapped = data.results.map((item: any) => ({
          title: item.title || item.name,
          type: type === 'multi' ? (item.media_type || 'movie') : type,
          reason: query ? 'Search Result' : 'Discover Result',
          posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined,
          overview: item.overview,
          year: ((item.release_date || item.first_air_date) || '').split('-')[0]
        }));
        setResults(mapped);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) performSearch();
    }, 800);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="space-y-8 mx-6 lg:mx-10 pb-32">
      <div className="space-y-4">
        <h2 className="text-3xl font-black italic tracking-tighter uppercase">Search</h2>
        <div className="h-1 w-12 bg-accent opacity-50" />
      </div>

      <div className="glass-panel bg-white/5 border border-white/10 rounded-3xl p-6 lg:p-8 space-y-6">
        <div className="flex bg-gray-900 border border-white/10 rounded-2xl overflow-hidden focus-within:border-accent/50 focus-within:shadow-[0_0_20px_rgba(255,184,0,0.2)] transition-all">
          <div className="pl-6 flex items-center justify-center text-gray-500">
            <Search size={24} />
          </div>
          <input 
            type="text" 
            placeholder="Search for movies or TV series..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && performSearch()}
            className="flex-1 bg-transparent px-6 py-5 text-lg font-bold text-white placeholder-gray-600 outline-none w-full"
          />
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`px-6 flex items-center gap-2 font-bold uppercase tracking-widest text-[10px] transition-colors border-l border-white/10 ${showFilters ? 'bg-white/10 text-accent' : 'hover:bg-white/5 text-gray-500'}`}
          >
            <Filter size={16} /> Filters
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-white/5 animate-in slide-in-from-top-4 fade-in duration-300">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Type</label>
              <div className="relative">
                <select 
                  value={type} 
                  onChange={(e) => setType(e.target.value)}
                  className="w-full appearance-none bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-accent transition-colors"
                >
                  <option value="movie">Movies</option>
                  <option value="tv">TV Series</option>
                  <option value="multi">Both</option>
                </select>
                <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Year</label>
              <input 
                type="number" 
                placeholder="Ex. 2024"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder-gray-700 outline-none focus:border-accent transition-colors"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Genre</label>
              <input 
                type="text" 
                placeholder="Ex. Action"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full bg-gray-900 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder-gray-700 outline-none focus:border-accent transition-colors"
              />
            </div>
            <div className="md:col-span-3 flex justify-end">
               <button 
                 onClick={performSearch}
                 className="px-8 py-3 rounded-xl bg-accent text-bg-deep font-black text-[10px] uppercase tracking-widest hover:bg-accent/90 transition-all hover:scale-105 active:scale-95"
               >
                 Apply Filters
               </button>
            </div>
          </div>
        )}
      </div>

      <div className="pt-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-accent gap-4">
            <Loader2 size={40} className="animate-spin" />
            <span className="text-xs font-black uppercase tracking-widest">Searching...</span>
          </div>
        ) : searched && results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Search size={48} className="mb-4 opacity-20" />
            <span className="text-lg font-bold">No results found.</span>
            <span className="text-sm font-medium mt-2">Try adjusting your syntax or filters.</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {results.map((item: any, i) => (
              <div className="flex items-center justify-center" key={`${item.title}-${i}`}>
                <MediaCard 
                  item={item} 
                  handleRequest={handleRequest} 
                  onViewDetails={handleViewDetails}
                  requestingId={requestingId} 
                  requestedTitles={requestedTitles} 
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
