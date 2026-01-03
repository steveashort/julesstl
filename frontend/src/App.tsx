import React, { useState, useEffect, useMemo } from 'react';
import { getTrafficLights, getHistory, getMetrics, getIncidents, overrideColour, getTopOffenders, getSettings, updateSettings, TrafficLightState, MetricRecord, IncidentRecord, TopOffender, AppSettings } from './api';
import TrafficLightCard from './components/TrafficLightCard';
import MetricsChart from './components/MetricsChart';
import StateTimelineChart from './components/StateTimelineChart';
import Sidebar from './components/Sidebar';
import clsx from 'clsx';
import { Filter, AlertTriangle, Moon, Sun, Search, BarChartHorizontal, Settings as SettingsIcon, CheckCircle } from 'lucide-react';

const setDashboardFilters = (filters: object) => {
    sessionStorage.setItem('dashboardFilters', JSON.stringify(filters));
};

const getInitialFilters = () => {
    try {
        const stored = sessionStorage.getItem('dashboardFilters');
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        console.error("Failed to parse dashboard filters", e);
        return {};
    }
};

const Dashboard: React.FC = () => {
  const [tls, setTls] = useState<TrafficLightState[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [filters, setFilters] = useState(() => getInitialFilters());
  const {
    class: selectedClass = '',
    group: selectedGroup = '',
    colour: selectedColour = '',
    tags: selectedTags = [],
    searchTerm = '',
  } = filters;

  const updateFilters = (newFilters: object) => {
      setFilters((prev: object) => ({ ...prev, ...newFilters }));
  };
  
  useEffect(() => {
    sessionStorage.setItem('dashboardFilters', JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    getTrafficLights().then(data => {
      setTls(data || []);
      setLoading(false);
    }).catch(e => {
        console.error("Failed to fetch TLs:", e);
        setLoading(false);
    });
    const interval = setInterval(() => {
      getTrafficLights().then(setTls).catch(console.error);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const classes = useMemo(() => Array.from(new Set(tls.map(tl => tl.class))).sort(), [tls]);
  const groups = useMemo(() => Array.from(new Set(tls.map(tl => tl.group))).sort(), [tls]);
  const colours = useMemo(() => Array.from(new Set(tls.map(tl => tl.colour))).sort(), [tls]);
  const tags = useMemo(() => {
    const allTags = tls.flatMap(tl => tl.tags || []);
    return Array.from(new Set(allTags)).sort();
  }, [tls]);
  
  const searchOptions = useMemo(() => {
      const allTls = tls.map(tl => ({ type: 'TL', value: tl.tl, class: tl.class, group: tl.group }));
      const allGroups = groups.map(g => ({ type: 'Group', value: g }));
      const allClasses = classes.map(c => ({ type: 'Class', value: c }));
      return [...allClasses, ...allGroups, ...allTls];
  }, [tls, groups, classes]);

  const filteredTls = useMemo(() => {
    return tls.filter(tl => {
      if (selectedClass && tl.class !== selectedClass) return false;
      if (selectedGroup && tl.group !== selectedGroup) return false;
      if (selectedColour && tl.colour !== selectedColour) return false;
      if (selectedTags.length > 0 && !selectedTags.every(t => (tl.tags || []).includes(t))) return false;
      if (searchTerm && !`${tl.class} ${tl.group} ${tl.tl}`.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [tls, selectedClass, selectedGroup, selectedColour, selectedTags, searchTerm]);
  
  const grouped = useMemo(() => {
    return filteredTls.reduce((acc, tl) => {
      if (!acc[tl.class]) acc[tl.class] = {};
      if (!acc[tl.class][tl.group]) acc[tl.class][tl.group] = [];
      acc[tl.class][tl.group].push(tl);
      return acc;
    }, {} as Record<string, Record<string, TrafficLightState[]>>);
  }, [filteredTls]);

  const toggleTag = (tag: string) => {
      const newTags = selectedTags.includes(tag) ? selectedTags.filter((t: string) => t !== tag) : [...selectedTags, tag];
      updateFilters({ tags: newTags });
  };
  
  const clearFilters = () => {
      setFilters({});
  };

  if (loading) return <div className="p-4 dark:text-gray-200">Loading Dashboard...</div>;

  return (
    <div className="p-4">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex justify-between items-center">
             <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold dark:text-white">Traffic Light Dashboard</h1>
                <button 
                    onClick={() => window.location.hash = '#/incidents'} 
                    className="flex items-center text-red-600 border border-red-600 px-3 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Incidents
                </button>
                <button 
                    onClick={() => window.location.hash = '#/reports/top-offenders'} 
                    className="flex items-center text-blue-600 border border-blue-600 px-3 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                    <BarChartHorizontal className="w-4 h-4 mr-2" />
                    Top Offenders
                </button>
            </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border dark:border-gray-700">
           <div className="flex flex-wrap gap-2 items-center mb-2">
              <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400 mr-2" />
              <div className="relative flex-grow">
                  <input
                    type="text"
                    placeholder="Search Class, Group, or TL..."
                    value={searchTerm}
                    onChange={e => updateFilters({ searchTerm: e.target.value })}
                    className="border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 w-full"
                    list="search-options"
                  />
                   <datalist id="search-options">
                        {searchOptions
                            .filter(opt => opt.value.toLowerCase().includes(searchTerm.toLowerCase()))
                            .slice(0, 10)
                            .map(opt => (
                                <option key={`${opt.type}-${opt.value}`} value={opt.value}>
                                    {opt.type}: {opt.value}
                                </option>
                            ))
                        }
                    </datalist>
              </div>
              <select value={selectedClass} onChange={e => updateFilters({ class: e.target.value })} className="border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
                <option value="">All Classes</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={selectedGroup} onChange={e => updateFilters({ group: e.target.value })} className="border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
                <option value="">All Groups</option>
                {groups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <select value={selectedColour} onChange={e => updateFilters({ colour: e.target.value })} className="border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
                <option value="">All Colours</option>
                {colours.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {(selectedClass || selectedGroup || selectedColour || selectedTags.length > 0 || searchTerm) && (
                <button onClick={clearFilters} className="text-red-500 text-sm hover:underline ml-2">Clear All</button>
              )}
           </div>
           
           <div className="flex flex-wrap gap-1 items-center mt-2 border-t dark:border-gray-700 pt-2">
              <span className="text-xs text-gray-500 mr-2">Tags:</span>
              {tags.map(t => (
                  <button 
                    key={t} 
                    onClick={() => toggleTag(t)}
                    className={clsx("px-2 py-0.5 rounded text-xs border transition-colors", {
                        "bg-blue-600 text-white border-blue-600": selectedTags.includes(t),
                        "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600": !selectedTags.includes(t)
                    })}
                  >
                    {t}
                  </button>
              ))}
           </div>
        </div>
      </div>

      <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Showing {filteredTls.length} of {tls.length} traffic lights
      </div>

      {Object.entries(grouped).length === 0 ? (
        <div className="text-center text-gray-500 py-10 dark:text-gray-400">No traffic lights found.</div>
      ) : (
        Object.entries(grouped).map(([cls, classGroups]) => (
          <div key={cls} className="mb-8">
            <h2 className="text-xl font-semibold mb-2 dark:text-gray-200">{cls}</h2>
            {Object.entries(classGroups).map(([grp, items]) => (
                <div key={grp} className="mb-6 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium mb-3 dark:text-gray-300 flex items-center">
                        <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-sm">{grp}</span>
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {items.map(tl => (
                        <div key={`${tl.group}-${tl.tl}`} className="cursor-pointer" onClick={() => window.location.hash = `#/details/${tl.class}/${tl.group}/${tl.tl}`}>
                        <TrafficLightCard tl={tl} />
                        </div>
                    ))}
                    </div>
                </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
};

const TopOffendersReport: React.FC = () => {
    const [offenders, setOffenders] = useState<TopOffender[]>([]);
    const [histories, setHistories] = useState<Record<string, TrafficLightState[]>>({});
    const [hours, setHours] = useState(24);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        getTopOffenders(hours).then(data => {
            setOffenders(data || []);
            const offenderKeys = data.map(([cls, grp, tl]) => `${cls}-${grp}-${tl}`);
            const historyPromises = data.map(([cls, grp, tl]) => getHistory(cls, grp, tl));
            Promise.all(historyPromises).then(historiesData => {
                const newHistories: Record<string, TrafficLightState[]> = {};
                historiesData.forEach((h, i) => {
                    newHistories[offenderKeys[i]] = h;
                });
                setHistories(newHistories);
                setLoading(false);
            });
        }).catch(e => {
            console.error(e);
            setLoading(false);
        });
    }, [hours]);
    
    const formatDuration = (seconds: number) => {
      if (seconds <= 0 || isNaN(seconds)) return "00:00:00";
      const d = Math.floor(seconds / 86400);
      const h = Math.floor((seconds % 86400) / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ts = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
      return d > 0 ? `${d}d ${ts}` : ts;
    };

    return (
        <div className="p-4 pt-16">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold dark:text-white">Top 10 Red Offenders</h1>
                <div className="flex items-center gap-4">
                    <span className="mr-2 text-sm text-gray-600 dark:text-gray-400">Time range:</span>
                    {[24, 72, 720].map(h => {
                        const days = h / 24;
                        return (
                            <button key={h} onClick={() => setHours(h)} className={clsx("px-3 py-1 rounded", {
                                "bg-blue-600 text-white": hours === h,
                                "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600": hours !== h,
                            })}>
                                {days} {days === 1 ? 'Day' : 'Days'}
                            </button>
                        )
                    })}
                </div>
            </div>

            {loading ? <div className="text-center py-10 dark:text-gray-300">Loading report...</div> : (
                <div className="space-y-8">
                    {offenders.length === 0 ? <p className="text-center">No red states recorded in this period.</p> :
                    offenders.map(([cls, grp, tl, totalSeconds]) => {
                        const key = `${cls}-${grp}-${tl}`;
                        const history = histories[key] || [];
                        const domain: [number | 'dataMin', number | 'dataMax'] = history.length > 0 ? [new Date(history[history.length - 1].timestamp).getTime(), new Date(history[0].timestamp).getTime()] : ['dataMin', 'dataMax'];
                        return (
                            <div key={key} className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow border dark:border-gray-700">
                                <h3 className="font-bold text-lg dark:text-white mb-2">{cls} / {grp} / {tl}</h3>
                                <p className="text-sm text-red-500 mb-4">Total Red Time: <span className="font-mono">{formatDuration(totalSeconds)}</span></p>
                                {history.length > 0 ? <StateTimelineChart history={history} domain={domain} /> : <p>No history found for timeline.</p>}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    );
};

const SettingsPage: React.FC = () => {
    const [settings, setSettings] = useState<Partial<AppSettings>>({});
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        getSettings().then(data => {
            setSettings(data);
            setLoading(false);
        });
    }, []);

    const handleSave = () => {
        updateSettings(settings as AppSettings).then(() => {
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }).catch(err => {
            alert(`Failed to save settings: ${err.message}`);
        });
    };
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: Number(value) }));
    };

    if (loading) return <div className="p-4 pt-16">Loading settings...</div>;

    return (
        <div className="p-4 pt-16">
            <h1 className="text-2xl font-bold dark:text-white mb-6">Settings</h1>
            <div className="max-w-2xl space-y-8">
                <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow border dark:border-gray-700">
                    <h3 className="font-semibold text-lg mb-4">History Purging</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium dark:text-gray-300">Max Records per Traffic Light</label>
                            <input type="number" name="history_purge_max_records" value={settings.history_purge_max_records || ''} onChange={handleInputChange} className="mt-1 block w-full border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600"/>
                            <p className="text-xs text-gray-500 mt-1">Oldest records are deleted when this limit is exceeded.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium dark:text-gray-300">Max History Age (Days)</label>
                            <input type="number" name="history_purge_max_days" value={settings.history_purge_max_days || ''} onChange={handleInputChange} className="mt-1 block w-full border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600"/>
                            <p className="text-xs text-gray-500 mt-1">Records older than this will be deleted.</p>
                        </div>
                    </div>
                </div>
                
                <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow border dark:border-gray-700">
                    <h3 className="font-semibold text-lg mb-4">Expiration & Escalation</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium dark:text-gray-300">Default Expiration (Minutes)</label>
                            <input type="number" name="default_expiration_minutes" value={settings.default_expiration_minutes || ''} onChange={handleInputChange} className="mt-1 block w-full border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600"/>
                            <p className="text-xs text-gray-500 mt-1">Default expiry for payloads sent without one.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium dark:text-gray-300">Escalate Purple to Yellow (Minutes)</label>
                            <input type="number" name="purple_to_yellow_minutes" value={settings.purple_to_yellow_minutes || ''} onChange={handleInputChange} className="mt-1 block w-full border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600"/>
                             <p className="text-xs text-gray-500 mt-1">A 'purple' light will turn 'yellow' after this many minutes.</p>
                        </div>
                         <div>
                            <label className="block text-sm font-medium dark:text-gray-300">Escalate Purple to Red (Minutes)</label>
                            <input type="number" name="purple_to_red_minutes" value={settings.purple_to_red_minutes || ''} onChange={handleInputChange} className="mt-1 block w-full border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600"/>
                             <p className="text-xs text-gray-500 mt-1">A 'purple' light will turn 'red' after this many minutes.</p>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end items-center gap-4">
                    {saved && <span className="text-green-500 flex items-center gap-1"><CheckCircle size={16} /> Saved!</span>}
                    <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition font-medium">Save Settings</button>
                </div>
            </div>
        </div>
    );
};

const IncidentsReport: React.FC = () => {
    const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
    const [hours, setHours] = useState(24);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        getIncidents(hours).then(data => {
            setIncidents(data || []);
            setLoading(false);
        }).catch(e => {
            console.error(e);
            setLoading(false);
        });
    }, [hours]);

    return (
        <div className="p-4 pt-16">
            <button onClick={() => window.location.hash = '#/'} className="mb-4 text-blue-500 hover:underline">&larr; Back to Dashboard</button>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold dark:text-white">Incidents Report</h1>
                <div className="flex items-center">
                    <span className="mr-2 text-sm text-gray-600 dark:text-gray-400">Time range:</span>
                    <select value={hours} onChange={e => setHours(Number(e.target.value))} className="border rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
                        <option value={1}>Last 1 Hour</option>
                        <option value={6}>Last 6 Hours</option>
                        <option value={12}>Last 12 Hours</option>
                        <option value={24}>Last 24 Hours</option>
                        <option value={48}>Last 48 Hours</option>
                        <option value={168}>Last 7 Days</option>
                    </select>
                </div>
            </div>

            {loading ? <div className="text-center py-10 dark:text-gray-300">Loading incidents...</div> : (
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white dark:bg-gray-800 border dark:border-gray-700">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-700">
                                <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">Class</th>
                                <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">Group</th>
                                <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">TL Name</th>
                                <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">Colour</th>
                                <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">Start Time</th>
                                <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">Duration</th>
                                <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            {incidents.length === 0 ? (
                                <tr><td colSpan={7} className="py-8 text-center text-gray-500 dark:text-gray-400">No incidents found.</td></tr>
                            ) : (
                                incidents.map((incident, i) => (
                                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="py-2 px-4 border-b dark:border-gray-700 dark:text-gray-300">{incident.class}</td>
                                        <td className="py-2 px-4 border-b dark:border-gray-700 dark:text-gray-300">{incident.group}</td>
                                        <td className="py-2 px-4 border-b dark:border-gray-700 font-medium">
                                            <button onClick={() => window.location.hash = `#/details/${incident.class}/${incident.group}/${incident.tl}`} className="text-blue-600 hover:underline dark:text-blue-400">{incident.tl}</button>
                                        </td>
                                        <td className="py-2 px-4 border-b dark:border-gray-700">
                                            <span className={clsx("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", {
                                                "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300": incident.colour === 'yellow',
                                                "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300": incident.colour === 'red',
                                            })}>{incident.colour}</span>
                                        </td>
                                        <td className="py-2 px-4 border-b dark:border-gray-700 dark:text-gray-300">{new Date(incident.start_time).toLocaleString()}</td>
                                        <td className="py-2 px-4 border-b dark:border-gray-700 dark:text-gray-300">
                                            {incident.duration_seconds > 3600 ? `${(incident.duration_seconds/3600).toFixed(1)}h` : `${(incident.duration_seconds/60).toFixed(0)}m`}
                                        </td>
                                        <td className="py-2 px-4 border-b dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 truncate max-w-xs">{incident.description}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const Details: React.FC<{ cls: string, grp: string, tl: string }> = ({ cls, grp, tl }) => {
  const [history, setHistory] = useState<TrafficLightState[]>([]);
  const [metrics, setMetrics] = useState<MetricRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartDomain, setChartDomain] = useState<[number | 'dataMin', number | 'dataMax']>(['dataMin', 'dataMax']);
  const [remainingTime, setRemainingTime] = useState<string>('');

  const latestTL = useMemo(() => {
    if (history.length === 0) return null;
    return [...history].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  }, [history]);

  const uniqueMetricKeys = useMemo(() => {
      return Array.from(new Set(metrics.map(m => m.key))).sort();
  }, [metrics]);

  const effectiveDomain = useMemo(() => {
    if (chartDomain[0] !== 'dataMin' && chartDomain[1] !== 'dataMax') {
        return { start: chartDomain[0] as number, end: chartDomain[1] as number };
    }
    const sourceData = metrics.length > 0 ? metrics : history;
    if (sourceData.length === 0) return { start: new Date().getTime() - 86400000, end: new Date().getTime() };
    
    const timestamps = sourceData.map(d => new Date(d.timestamp).getTime()).filter(t => !isNaN(t));
    if (timestamps.length === 0) return { start: new Date().getTime() - 86400000, end: new Date().getTime() };

    const max = Math.max(...timestamps);
    const min = Math.min(...timestamps);
    
    return { start: min, end: max };
  }, [chartDomain, metrics, history]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (latestTL?.expires_at) {
        const expiryTime = new Date(latestTL.expires_at).getTime();
        const now = new Date().getTime();
        const remaining = Math.max(0, Math.floor((expiryTime - now) / 1000));
        setRemainingTime(formatDuration(remaining));
      } else {
        setRemainingTime('');
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [latestTL]);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const [h, m] = await Promise.all([getHistory(cls, grp, tl), getMetrics(cls, grp, tl)]);
        if (!isMounted) return;

        const hist = h || [];
        const mets = m || [];
        setHistory(hist);
        setMetrics(mets);

        if (loading) { 
            const sourceData = mets.length > 0 ? mets : hist;
            if (sourceData.length > 0) {
                const timestamps = sourceData.map(d => new Date(d.timestamp).getTime()).filter(t => !isNaN(t));
                if (timestamps.length > 0) {
                    const maxTime = Math.max(...timestamps);
                    const minTime = Math.min(...timestamps);
                    const dataSpan = maxTime - minTime;
                    const oneDay = 24 * 60 * 60 * 1000;

                    if (dataSpan < oneDay) {
                        setChartDomain(['dataMin', 'dataMax']);
                    } else {
                        setChartDomain([maxTime - oneDay, maxTime]);
                    }
                }
            }
        }
        setLoading(false);
      } catch (e) {
        console.error(e);
        if (isMounted) setLoading(false);
      }
    };

    fetchData(); 
    const interval = setInterval(fetchData, 5000); 

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cls, grp, tl, loading]);

  const handleZoom = (left: number, right: number) => setChartDomain([left, right]);

  const resetZoom = (range: '24h' | '3d' | 'all') => {
      const sourceData = metrics.length > 0 ? metrics : history;
      if (sourceData.length === 0) return;
      
      const timestamps = sourceData.map(d => new Date(d.timestamp).getTime()).filter(t => !isNaN(t));
      if (timestamps.length === 0) return;

      const maxTime = Math.max(...timestamps);
      const minTime = Math.min(...timestamps);
      const dataSpan = maxTime - minTime;

      if (range === 'all') {
          setChartDomain(['dataMin', 'dataMax']);
          return;
      }

      const rangeMillis = (range === '24h' ? 86400000 : 259200000);
      
      if (dataSpan < rangeMillis) {
          setChartDomain(['dataMin', 'dataMax']);
      } else {
          setChartDomain([maxTime - rangeMillis, maxTime]);
      }
  };

  const formatDuration = (seconds: number) => {
      if (seconds <= 0 || isNaN(seconds)) return "00:00:00";
      const d = Math.floor(seconds / 86400);
      const h = Math.floor((seconds % 86400) / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ts = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
      return d > 0 ? `${d}d ${ts}` : ts;
  };
  
  const handleClassClick = () => {
      setDashboardFilters({ class: cls });
      window.location.hash = '#/';
  };
  const handleGroupClick = () => {
      setDashboardFilters({ class: cls, group: grp });
      window.location.hash = '#/';
  };

  const handleOverride = async (colour: string) => {
    const message = window.prompt(`Enter reason for setting colour to ${colour}:`);
    if (message) {
        try {
            await overrideColour(cls, grp, tl, colour, message);
            setLoading(true);
            const [h, m] = await Promise.all([getHistory(cls, grp, tl), getMetrics(cls, grp, tl)]);
            setHistory(h || []);
            setMetrics(m || []);
            setLoading(false);
        } catch (error) {
            console.error("Failed to apply override:", error);
            alert("Failed to apply override. See console for details.");
            setLoading(false);
        }
    }
  };

  if (loading) return <div className="p-4 pt-16 dark:text-gray-200">Loading Details...</div>;

  return (
    <div className="p-4">
      <div className="sticky top-0 z-30 bg-gray-100 dark:bg-gray-900 shadow-sm">
          {latestTL && (
              <div className={clsx("w-full p-2 text-center text-white font-bold animate-pulse-bg rounded-b-lg", {
                  'bg-green-500 shadow-[0_5px_15px_-5px_rgba(34,197,94,0.7)]': latestTL.colour === 'green',
                  'bg-yellow-500 shadow-[0_5px_15px_-5px_rgba(234,179,8,0.7)]': latestTL.colour === 'yellow',
                  'bg-red-500 shadow-[0_5px_15px_-5px_rgba(239,68,68,0.7)]': latestTL.colour === 'red',
                  'bg-purple-500 shadow-[0_5px_15px_-5px_rgba(139,92,246,0.7)]': latestTL.colour === 'purple',
                  'bg-gray-500': !['green', 'yellow', 'red', 'purple'].includes(latestTL.colour),
              })}>
                  {latestTL.colour.toUpperCase()} {remainingTime && `- expires in ${remainingTime}`}
              </div>
          )}
          <div className="p-4 border-b dark:border-gray-800">
              <div className="flex justify-between items-center mb-4">
                  <button 
                    onClick={() => window.location.hash = '#/'} 
                    className="flex items-center px-3 py-1 bg-gray-200 dark:bg-gray-700 text-sm rounded hover:bg-gray-300 dark:hover:bg-gray-600 dark:text-gray-200 transition-colors"
                  >
                      &larr; Back
                  </button>
                  <div className="flex gap-2">
                      {['24h', '3d', 'all'].map(r => (
                          <button key={r} onClick={() => resetZoom(r as any)} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-sm rounded hover:bg-gray-300 dark:hover:bg-gray-600 dark:text-gray-200 capitalize">{r === '3d' ? '3 Days' : r}</button>
                      ))}
                      <div className="w-4"></div>
                      <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm font-medium">Download CSV</button>
                  </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-4">
                  <div>
                     <h1 className="text-2xl font-bold dark:text-white flex items-center gap-2">
                         <button onClick={handleClassClick} className="hover:underline">{cls}</button>
                         <span>/</span>
                         <button onClick={handleGroupClick} className="hover:underline">{grp}</button>
                         <span>/</span>
                         <span>{tl}</span>
                     </h1>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-white dark:bg-gray-800 px-2 py-1 rounded border dark:border-gray-700 whitespace-nowrap">
                      {new Date(effectiveDomain.start).toLocaleString()} - {new Date(effectiveDomain.end).toLocaleString()}
                  </div>
              </div>

              <div className="mt-4 pt-3 border-t dark:border-gray-700 flex items-center gap-2">
                    <span className="text-sm font-medium dark:text-gray-300">Manual Override:</span>
                    <button onClick={() => handleOverride('green')} className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600">Set Green</button>
                    <button onClick={() => handleOverride('yellow')} className="px-3 py-1 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600">Set Yellow</button>
                    <button onClick={() => handleOverride('red')} className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600">Set Red</button>
              </div>
          </div>
          {latestTL && (
            <div className="p-4 border-b dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <h3 className="text-sm font-semibold dark:text-gray-200 mb-2">Metadata</h3>
                {latestTL.description && <p className="text-sm text-gray-600 dark:text-gray-400 mb-2"><strong>Description:</strong> {latestTL.description}</p>}
                {latestTL.tags && latestTL.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                        <strong className="text-sm text-gray-600 dark:text-gray-400">Tags:</strong>
                        {latestTL.tags.map(tag => (
                            <span key={tag} className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 text-xs px-2 py-0.5 rounded border dark:border-blue-900/30">
                              {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>
          )}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-8">
        <div className="bg-white dark:bg-gray-800 p-2 rounded shadow-sm border dark:border-gray-700">
            <StateTimelineChart history={history} domain={[effectiveDomain.start, effectiveDomain.end]} />
        </div>
        <div>
           <h2 className="text-xl font-semibold mb-4 dark:text-gray-200">Metrics</h2>
           {uniqueMetricKeys.length > 0 ? uniqueMetricKeys.map(key => (
                <div key={key} className="mb-6 bg-white dark:bg-gray-800 p-2 rounded shadow-sm border dark:border-gray-700">
                    <MetricsChart data={metrics} metricKey={key} domain={chartDomain} onZoom={handleZoom} />
                </div>
           )) : <p className="dark:text-gray-400">No metrics available.</p>}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [route, setRoute] = useState(window.location.hash || '#/');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) return 'dark';
    return 'light';
  });
  
  const [allTls, setAllTls] = useState<TrafficLightState[]>([]);
  useEffect(() => {
      getTrafficLights().then(setAllTls).catch(console.error);
      const interval = setInterval(() => getTrafficLights().then(setAllTls), 5000);
      return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (theme === 'dark') { document.documentElement.classList.add('dark'); localStorage.setItem('theme', 'dark'); } 
    else { document.documentElement.classList.remove('dark'); localStorage.setItem('theme', 'light'); }
  }, [theme]);

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
  const hash = route.startsWith('#') ? route.substring(1) : route;

  let content;
  let currentTl = undefined;

  if (hash.startsWith('/details/')) {
    const parts = hash.split('/');
    if (parts.length >= 5) {
        currentTl = { class: parts[2], group: parts[3], tl: parts[4] };
        content = <Details cls={parts[2]} grp={parts[3]} tl={parts[4]} />;
    }
  } else if (hash === '/incidents') {
    content = <IncidentsReport />;
  } else if (hash === '/reports/top-offenders') {
    content = <TopOffendersReport />;
  } else if (hash.startsWith('/settings')) {
      content = <SettingsPage />;
  } else {
    content = <Dashboard />;
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 grid grid-cols-[280px_1fr]">
        <Sidebar trafficLights={allTls} currentTl={currentTl} />
        <main className="overflow-y-auto relative pb-12">
            <div className="fixed top-4 right-4 z-50">
                <button onClick={toggleTheme} className="p-2 rounded-full bg-white dark:bg-gray-800 shadow-md border dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Toggle Theme">
                    {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
            </div>
            {content}
        </main>
    </div>
  );
};

export default App;
