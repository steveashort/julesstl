import React, { useState, useEffect, useMemo } from 'react';
import { getTrafficLights, getHistory, getMetrics, getIncidents, overrideColour, getTopOffenders, getSettings, updateSettings, getSystemConfig, TrafficLightState, MetricRecord, IncidentRecord, TopOffender, AppSettings, SystemLimits } from './api';
import TrafficLightCard from './components/TrafficLightCard';
import MetricsChart from './components/MetricsChart';
import StateTimelineChart from './components/StateTimelineChart';
import Sidebar from './components/Sidebar';
import clsx from 'clsx';
import { Filter, AlertTriangle, Moon, Sun, Search, BarChartHorizontal, Settings as SettingsIcon, CheckCircle, Timer, Home } from 'lucide-react';

const formatDuration = (seconds: number) => {
    const val = Math.max(0, seconds);
    if (val === 0) return "0m";
    const d = Math.floor(val / 86400);
    const h = Math.floor((val % 86400) / 3600);
    const m = Math.floor((val % 3600) / 60);
    const s = Math.floor(val % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (parts.length === 0) return `${s}s`;
    return parts.join(' ');
};

const DurationDisplay: React.FC<{ seconds: number, className?: string }> = ({ seconds, className }) => (
    <span className={clsx("inline-flex items-center gap-1 font-mono", className)}>
        <Timer size={14} className="opacity-70" />
        <span>{formatDuration(seconds)}</span>
    </span>
);

const getInitialFilters = () => {
    try {
        const stored = sessionStorage.getItem('dashboardFilters');
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        return {};
    }
};

interface DashboardProps {
    tls: TrafficLightState[];
    loading: boolean;
    filters: any;
    setFilters: (f: any) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ tls, loading, filters, setFilters }) => {
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
      if (selectedTags.length > 0 && !selectedTags.every((t: string) => (tl.tags || []).includes(t))) return false;
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
  
  const clearFilters = () => setFilters({});

  if (loading) return <div className="p-4 dark:text-gray-200">Loading Dashboard...</div>;

  return (
    <div className="p-4">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex justify-between items-center">
             <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold dark:text-white">Traffic Light Dashboard</h1>
                <button onClick={() => window.location.hash = '#/incidents'} className="flex items-center text-red-600 border border-red-600 px-3 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"><AlertTriangle className="w-4 h-4 mr-2" />Incidents</button>
                <button onClick={() => window.location.hash = '#/reports/top-offenders'} className="flex items-center text-blue-600 border border-blue-600 px-3 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"><BarChartHorizontal className="w-4 h-4 mr-2" />Top Offenders</button>
            </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border dark:border-gray-700">
           <div className="flex flex-wrap gap-2 items-center mb-2">
              <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400 mr-2" />
              <div className="relative flex-grow">
                  <input type="text" placeholder="Search..." value={searchTerm} onChange={e => updateFilters({ searchTerm: e.target.value })} className="border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 w-full" list="search-options" />
                   <datalist id="search-options">
                        {searchOptions.filter(opt => opt.value.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 10).map(opt => (
                            <option key={`${opt.type}-${opt.value}`} value={opt.value}>{opt.type}: {opt.value}</option>
                        ))}
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
                  <button key={t} onClick={() => toggleTag(t)} className={clsx("px-2 py-0.5 rounded text-xs border transition-colors", { "bg-blue-600 text-white border-blue-600": selectedTags.includes(t), "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600": !selectedTags.includes(t) })}>{t}</button>
              ))}
           </div>
        </div>
      </div>

      <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">Showing {filteredTls.length} of {tls.length} traffic lights</div>

      {Object.entries(grouped).length === 0 ? <div className="text-center text-gray-500 py-10 dark:text-gray-400">No traffic lights found.</div> : (
        Object.entries(grouped).map(([cls, classGroups]) => (
          <div key={cls} className="mb-8">
            <h2 className="text-xl font-semibold mb-2 dark:text-gray-200">{cls}</h2>
            {Object.entries(classGroups).map(([grp, items]) => (
                <div key={grp} className="mb-6 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium mb-3 dark:text-gray-300 flex items-center"><span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-sm">{grp}</span></h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {items.map(tl => (
                        <div key={`${tl.group}-${tl.tl}`} className="cursor-pointer" onClick={() => window.location.hash = `#/details/${tl.class}/${tl.group}/${tl.tl}`}><TrafficLightCard tl={tl} /></div>
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
                historiesData.forEach((h, i) => { newHistories[offenderKeys[i]] = h; });
                setHistories(newHistories);
                setLoading(false);
            });
        }).catch(() => setLoading(false));
    }, [hours]);
    
    return (
        <div className="p-4 pt-16">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold dark:text-white">Top 10 Red Offenders</h1>
                <div className="flex items-center gap-4">
                    {[24, 72, 720].map(h => (
                        <button key={h} onClick={() => setHours(h)} className={clsx("px-3 py-1 rounded", { "bg-blue-600 text-white": hours === h, "bg-gray-200 dark:bg-gray-700": hours !== h })}>
                            {h/24} {h === 24 ? 'Day' : 'Days'}
                        </button>
                    ))}
                </div>
            </div>
            {loading ? <div className="text-center py-10 dark:text-gray-300">Loading report...</div> : (
                <div className="space-y-8">
                    {offenders.length === 0 ? <p className="text-center">No red states recorded.</p> :
                    offenders.map(([cls, grp, tl, totalSeconds]) => {
                        const key = `${cls}-${grp}-${tl}`;
                        const history = histories[key] || [];
                        const domain: [number | 'dataMin', number | 'dataMax'] = history.length > 0 ? [new Date(history[history.length - 1].timestamp).getTime(), new Date(history[0].timestamp).getTime()] : ['dataMin', 'dataMax'];
                        return (
                            <div key={key} className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow border dark:border-gray-700">
                                <h3 className="font-bold text-lg dark:text-white mb-2">{cls} / {grp} / {tl}</h3>
                                <div className="text-sm text-red-500 mb-4 flex items-center gap-2"><span>Total Red Time:</span><DurationDisplay seconds={totalSeconds} /></div>
                                {history.length > 0 ? <StateTimelineChart history={history} domain={domain} /> : <p>No history.</p>}
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
    const [limits, setLimits] = useState<Partial<SystemLimits>>({});
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);

    const [expiryVal, setExpiryVal] = useState(60);
    const [expiryUnit, setExpiryUnit] = useState('minutes');
    const [purpleVal, setPurpleVal] = useState(1440);
    const [purpleUnit, setPurpleUnit] = useState('minutes');
    const [purpleAction, setPurpleAction] = useState('yellow');
    const [yellowVal, setYellowVal] = useState(1440);
    const [yellowUnit, setYellowUnit] = useState('minutes');
    const [yellowEnabled, setYellowEnabled] = useState(false);
    const [historyAgeVal, setHistoryAgeVal] = useState(30);
    const [historyAgeUnit, setHistoryAgeUnit] = useState('days');

    useEffect(() => {
        Promise.all([getSettings(), getSystemConfig()]).then(([data, limitsData]) => {
            setSettings(data); setLimits(limitsData);
            if (data.default_expiration_minutes) {
                if (data.default_expiration_minutes % 1440 === 0) { setExpiryVal(data.default_expiration_minutes / 1440); setExpiryUnit('days'); }
                else if (data.default_expiration_minutes % 60 === 0) { setExpiryVal(data.default_expiration_minutes / 60); setExpiryUnit('hours'); }
                else { setExpiryVal(data.default_expiration_minutes); setExpiryUnit('minutes'); }
            }
            const pVal = data.purple_to_yellow_minutes < data.purple_to_red_minutes ? data.purple_to_yellow_minutes : data.purple_to_red_minutes;
            setPurpleAction(data.purple_to_yellow_minutes < data.purple_to_red_minutes ? 'yellow' : 'red');
            if (pVal > 0) {
                if (pVal % 1440 === 0) { setPurpleVal(pVal / 1440); setPurpleUnit('days'); }
                else if (pVal % 60 === 0) { setPurpleVal(pVal / 60); setPurpleUnit('hours'); }
                else { setPurpleVal(pVal); setPurpleUnit('minutes'); }
            }
            if (data.yellow_to_red_minutes > 0) {
                setYellowEnabled(true);
                if (data.yellow_to_red_minutes % 1440 === 0) { setYellowVal(data.yellow_to_red_minutes / 1440); setYellowUnit('days'); }
                else if (data.yellow_to_red_minutes % 60 === 0) { setYellowVal(data.yellow_to_red_minutes / 60); setYellowUnit('hours'); }
                else { setYellowVal(data.yellow_to_red_minutes); setYellowUnit('minutes'); }
            }
            if (data.history_purge_max_days) { setHistoryAgeVal(data.history_purge_max_days); setHistoryAgeUnit('days'); }
            setLoading(false);
        });
    }, []);

    const getMaxExpiry = () => { const m = limits.max_expiration_minutes || 525600; return expiryUnit === 'days' ? Math.floor(m/1440) : (expiryUnit === 'hours' ? Math.floor(m/60) : m); };
    const getMaxHistoryAge = () => { const m = limits.max_history_days || 366; return historyAgeUnit === 'weeks' ? Math.floor(m/7) : (historyAgeUnit === 'months' ? Math.floor(m/30) : m); };

    const handleSave = () => {
        const n = { ...settings };
        let eM = expiryVal; if (expiryUnit === 'hours') eM *= 60; if (expiryUnit === 'days') eM *= 1440; n.default_expiration_minutes = eM;
        let pM = purpleVal; if (purpleUnit === 'hours') pM *= 60; if (purpleUnit === 'days') pM *= 1440;
        if (purpleAction === 'yellow') { n.purple_to_yellow_minutes = pM; n.purple_to_red_minutes = Math.max(n.purple_to_red_minutes || 0, pM * 3); }
        else { n.purple_to_red_minutes = pM; n.purple_to_yellow_minutes = pM; }
        n.yellow_to_red_minutes = yellowEnabled ? (yellowUnit === 'hours' ? yellowVal * 60 : (yellowUnit === 'days' ? yellowVal * 1440 : yellowVal)) : 0;
        let hD = historyAgeVal; if (historyAgeUnit === 'weeks') hD *= 7; if (historyAgeUnit === 'months') hD *= 30; n.history_purge_max_days = hD;
        updateSettings(n as AppSettings).then(() => { setSaved(true); setTimeout(() => setSaved(false), 2000); });
    };

    if (loading) return <div className="p-4 pt-16">Loading settings...</div>;

    return (
        <div className="p-4 pt-16"><h1 className="text-2xl font-bold dark:text-white mb-6 flex items-center gap-2"><SettingsIcon /> Settings</h1><div className="max-w-3xl space-y-8">
            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow border dark:border-gray-700">
                <h3 className="font-semibold text-lg mb-2 dark:text-gray-200">Default Expiration</h3>
                <div className="flex items-center gap-4"><input type="number" min="1" max={getMaxExpiry()} value={expiryVal} onChange={e => setExpiryVal(Number(e.target.value))} className="w-24 border rounded px-3 py-2 dark:bg-gray-700 dark:text-gray-200" /><select value={expiryUnit} onChange={e => setExpiryUnit(e.target.value)} className="border rounded px-3 py-2 dark:bg-gray-700 dark:text-gray-200"><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></div>
            </div>
            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow border dark:border-gray-700">
                <h3 className="font-semibold text-lg mb-2 dark:text-gray-200">Purple Escalation</h3>
                <div className="flex items-center gap-2"><span className="text-sm dark:text-gray-300">When purple for</span><input type="number" value={purpleVal} onChange={e => setPurpleVal(Number(e.target.value))} className="w-24 border rounded px-3 py-2 dark:bg-gray-700" /><select value={purpleUnit} onChange={e => setPurpleUnit(e.target.value)} className="border rounded px-3 py-2 dark:bg-gray-700"><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select><span>change to</span><select value={purpleAction} onChange={e => setPurpleAction(e.target.value)} className="border rounded px-3 py-2 uppercase"><option value="yellow">Yellow</option><option value="red">Red</option></select></div>
            </div>
            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow border dark:border-gray-700">
                <div className="flex justify-between mb-2"><h3 className="font-semibold text-lg dark:text-gray-200">Yellow Escalation</h3><input type="checkbox" checked={yellowEnabled} onChange={e => setYellowEnabled(e.target.checked)} className="w-5 h-5" /></div>
                {yellowEnabled && <div className="flex items-center gap-2"><span className="text-sm dark:text-gray-300">When yellow for</span><input type="number" value={yellowVal} onChange={e => setYellowVal(Number(e.target.value))} className="w-24 border rounded px-3 py-2 dark:bg-gray-700" /><select value={yellowUnit} onChange={e => setYellowUnit(e.target.value)} className="border rounded px-3 py-2 dark:bg-gray-700"><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select><span>change to Red</span></div>}
            </div>
            <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow border dark:border-gray-700">
                <h3 className="font-semibold text-lg mb-2 dark:text-gray-200">History Retention</h3>
                <div className="space-y-4"><div className="flex items-center gap-4"><span>Age:</span><input type="number" min="1" max={getMaxHistoryAge()} value={historyAgeVal} onChange={e => setHistoryAgeVal(Number(e.target.value))} className="w-24 border rounded px-3 py-2 dark:bg-gray-700" /><select value={historyAgeUnit} onChange={e => setHistoryAgeUnit(e.target.value)} className="border rounded px-3 py-2 dark:bg-gray-700"><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option></select></div><div className="flex items-center gap-4"><span>Max records:</span><input type="number" value={settings.history_purge_max_records || 10000} onChange={e => setSettings(p => ({...p, history_purge_max_records: Number(e.target.value)}))} className="w-24 border rounded px-3 py-2 dark:bg-gray-700" /></div></div>
            </div>
            <div className="flex justify-end gap-4">{saved && <span className="text-green-500">Saved!</span>}<button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded">Save Settings</button></div>
        </div></div>
    );
};

const IncidentsReport: React.FC = () => {
    const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
    const [hours, setHours] = useState(24);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        setLoading(true);
        getIncidents(hours).then(data => { setIncidents(data || []); setLoading(false); }).catch(() => setLoading(false));
    }, [hours]);
    return (
        <div className="p-4 pt-16">
            <button onClick={() => window.location.hash = '#/'} className="mb-4 text-blue-500 hover:underline">&larr; Back</button>
            <h1 className="text-2xl font-bold dark:text-white mb-6">Incidents Report</h1>
            {loading ? <div className="text-center py-10">Loading...</div> : (
                <div className="overflow-x-auto"><table className="min-w-full bg-white dark:bg-gray-800 border dark:border-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700"><tr><th className="py-2 px-4 text-left">Class</th><th className="py-2 px-4 text-left">Group</th><th className="py-2 px-4 text-left">TL Name</th><th className="py-2 px-4 text-left">Colour</th><th className="py-2 px-4 text-left">Start Time</th><th className="py-2 px-4 text-left">Duration</th><th className="py-2 px-4 text-left">Description</th></tr></thead>
                    <tbody>{incidents.map((incident, i) => (
                        <tr key={i} className="border-b dark:border-gray-700"><td className="py-2 px-4">{incident.class}</td><td className="py-2 px-4">{incident.group}</td><td className="py-2 px-4"><button onClick={() => window.location.hash = `#/details/${incident.class}/${incident.group}/${incident.tl}`} className="text-blue-600 hover:underline">{incident.tl}</button></td><td className="py-2 px-4"><span className={clsx("px-2 py-0.5 rounded text-xs", { 'bg-yellow-100 text-yellow-800': incident.colour === 'yellow', 'bg-red-100 text-red-800': incident.colour === 'red' })}>{incident.colour}</span></td><td className="py-2 px-4">{new Date(incident.start_time).toLocaleString()}</td><td className="py-2 px-4"><DurationDisplay seconds={incident.duration_seconds} /></td><td className="py-2 px-4">{incident.description}</td></tr>
                    ))}</tbody>
                </table></div>
            )}
        </div>
    );
};

const Details: React.FC<{ cls: string, grp: string, tl: string }> = ({ cls, grp, tl }) => {
  const [history, setHistory] = useState<TrafficLightState[]>([]);
  const [metrics, setMetrics] = useState<MetricRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartDomain, setChartDomain] = useState<[number | 'dataMin', number | 'dataMax']>(['dataMin', 'dataMax']);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      const [h, m] = await Promise.all([getHistory(cls, grp, tl), getMetrics(cls, grp, tl)]);
      if (isMounted) { setHistory(h || []); setMetrics(m || []); setLoading(false); }
    };
    fetchData(); const interval = setInterval(fetchData, 5000);
    return () => { isMounted = false; clearInterval(interval); };
  }, [cls, grp, tl]);

  const aggregatedHistory = useMemo(() => {
    const sorted = [...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const groups: any[] = []; let cur: any = null;
    for (const r of sorted) {
        if (!cur || r.colour !== cur.colour) { if (cur) groups.push(cur); cur = { colour: r.colour, start: r.timestamp, end: r.timestamp, count: 1, description: r.description }; }
        else { cur.end = r.timestamp; cur.count++; cur.description = r.description || cur.description; }
    }
    if (cur) groups.push(cur); return groups.reverse();
  }, [history]);

  if (loading) return <div className="p-4 pt-16">Loading...</div>;

  return (
    <div className="p-4">
      <div className="p-4 mb-6 border-b dark:border-gray-800 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
          <div className="flex justify-between items-center mb-4">
              <button onClick={() => window.location.hash = '#/'} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded">&larr; Back</button>
              <div className="flex gap-2">
                  {['24h', '3d', 'all'].map(r => (<button key={r} onClick={() => {}} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded text-sm capitalize">{r}</button>))}
              </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between gap-4">
              <h1 className="text-2xl font-bold dark:text-white">{cls} / {grp} / {tl}</h1>
              <div className="flex items-center gap-2">
                    <button onClick={() => overrideColour(cls, grp, tl, 'green', 'manual')} className="px-3 py-1 text-xs bg-green-500 text-white rounded">Green</button>
                    <button onClick={() => overrideColour(cls, grp, tl, 'yellow', 'manual')} className="px-3 py-1 text-xs bg-yellow-500 text-white rounded">Yellow</button>
                    <button onClick={() => overrideColour(cls, grp, tl, 'red', 'manual')} className="px-3 py-1 text-xs bg-red-500 text-white rounded">Red</button>
              </div>
          </div>
      </div>
      <div className="space-y-8">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border dark:border-gray-700">
            <StateTimelineChart history={history} domain={['dataMin', 'dataMax']} />
        </div>
        <div>
            <h2 className="text-xl font-semibold mb-4 dark:text-gray-200">History</h2>
            <div className="bg-white dark:bg-gray-800 rounded shadow-sm border dark:border-gray-700 overflow-hidden"><table className="min-w-full">
                <thead className="bg-gray-50 dark:bg-gray-700"><tr><th className="py-2 px-4 text-left">Colour</th><th className="py-2 px-4 text-left">Start</th><th className="py-2 px-4 text-left">End</th><th className="py-2 px-4 text-left">Duration</th><th className="py-2 px-4 text-left">Desc</th></tr></thead>
                <tbody>{aggregatedHistory.map((g, i) => (
                    <tr key={i} className="border-b dark:border-gray-700"><td className="py-2 px-4"><span className={clsx("px-2 py-0.5 rounded text-xs uppercase", { 'bg-green-100 text-green-800': g.colour === 'green', 'bg-yellow-100 text-yellow-800': g.colour === 'yellow', 'bg-red-100 text-red-800': g.colour === 'red', 'bg-purple-100 text-purple-800': g.colour === 'purple' })}>{g.colour}</span></td><td className="py-2 px-4 text-sm">{new Date(g.start).toLocaleString()}</td><td className="py-2 px-4 text-sm">{new Date(g.end).toLocaleString()}</td><td className="py-2 px-4 text-sm"><DurationDisplay seconds={(new Date(g.end).getTime() - new Date(g.start).getTime())/1000} /></td><td className="py-2 px-4 text-sm text-gray-500">{g.description}</td></tr>
                ))}</tbody>
            </table></div>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [route, setRoute] = useState(window.location.hash || '#/');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as any) || 'dark');
  const [allTls, setAllTls] = useState<TrafficLightState[]>([]);
  const [filters, setFilters] = useState(() => getInitialFilters());

  useEffect(() => {
      const fetchData = () => getTrafficLights().then(setAllTls).catch(console.error);
      fetchData(); const interval = setInterval(fetchData, 5000);
      return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => { sessionStorage.setItem('dashboardFilters', JSON.stringify(filters)); }, [filters]);

  const counts = useMemo(() => {
      const c = { green: 0, yellow: 0, red: 0, purple: 0 };
      allTls.forEach(tl => { if (tl.colour in c) c[tl.colour as keyof typeof c]++; });
      return c;
  }, [allTls]);

  const handleHomeClick = () => { setFilters({}); window.location.hash = '#/'; };
  const handleCountClick = (colour: string) => { setFilters({ colour }); window.location.hash = '#/'; };
  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const hash = route.startsWith('#') ? route.substring(1) : route;
  let content;
  let currentTl: any = undefined;

  if (hash.startsWith('/details/')) {
    const parts = hash.split('/');
    if (parts.length >= 5) {
        currentTl = { class: parts[2], group: parts[3], tl: parts[4] };
        content = <Details cls={parts[2]} grp={parts[3]} tl={parts[4]} />;
    }
  } else if (hash === '/incidents') { content = <IncidentsReport />; }
  else if (hash === '/reports/top-offenders') { content = <TopOffendersReport />; }
  else if (hash.startsWith('/settings')) { content = <SettingsPage />; }
  else { content = <Dashboard tls={allTls} loading={allTls.length === 0} filters={filters} setFilters={setFilters} />; }

  const latestTL = currentTl ? allTls.find(t => t.class === currentTl.class && t.group === currentTl.group && t.tl === currentTl.tl) : null;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 grid grid-cols-[280px_1fr]">
        <Sidebar trafficLights={allTls} currentTl={currentTl} />
        <main className="relative h-screen overflow-hidden flex flex-col">
            {/* Global Fixed Header */}
            <header className="h-16 bg-white dark:bg-gray-800 border-b dark:border-gray-700 flex items-center justify-between px-4 z-50 shadow-sm flex-shrink-0">
                <div className="flex-1 flex justify-center">
                    {latestTL && (
                        <div className={clsx("py-1.5 px-4 flex items-center gap-2 text-white font-bold rounded-full shadow-md animate-pulse-bg transition-all", {
                            'bg-green-500 shadow-green-500/40': latestTL.colour === 'green',
                            'bg-yellow-500 shadow-yellow-500/40': latestTL.colour === 'yellow',
                            'bg-red-500 shadow-red-500/40': latestTL.colour === 'red',
                            'bg-purple-500 shadow-purple-500/40': latestTL.colour === 'purple',
                            'bg-gray-500': !['green', 'yellow', 'red', 'purple'].includes(latestTL.colour),
                        })}>
                            <span>{latestTL.colour.toUpperCase()}</span>
                            {latestTL.expires_at && (
                                <span className="flex items-center gap-1 text-xs font-normal bg-black/20 px-2 py-0.5 rounded-full">
                                    <Timer size={12} /> {formatDuration(Math.max(0, Math.floor((new Date(latestTL.expires_at).getTime() - new Date().getTime()) / 1000)))}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-full text-xs font-semibold select-none border dark:border-gray-600">
                        <button onClick={() => handleCountClick('green')} className="text-green-600 dark:text-green-400 flex items-center gap-1 hover:bg-gray-200 dark:hover:bg-gray-600 px-1 rounded"><span className="w-2 h-2 bg-green-500 rounded-full"></span>{counts.green}</button>
                        <span className="text-gray-300 dark:text-gray-500">|</span>
                        <button onClick={() => handleCountClick('yellow')} className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1 hover:bg-gray-200 dark:hover:bg-gray-600 px-1 rounded"><span className="w-2 h-2 bg-yellow-500 rounded-full"></span>{counts.yellow}</button>
                        <span className="text-gray-300 dark:text-gray-500">|</span>
                        <button onClick={() => handleCountClick('red')} className="text-red-600 dark:text-red-400 flex items-center gap-1 hover:bg-gray-200 dark:hover:bg-gray-600 px-1 rounded"><span className="w-2 h-2 bg-red-500 rounded-full"></span>{counts.red}</button>
                        <span className="text-gray-300 dark:text-gray-500">|</span>
                        <button onClick={() => handleCountClick('purple')} className="text-purple-600 dark:text-purple-400 flex items-center gap-1 hover:bg-gray-200 dark:hover:bg-gray-600 px-1 rounded"><span className="w-2 h-2 bg-purple-500 rounded-full"></span>{counts.purple}</button>
                    </div>
                    <button onClick={handleHomeClick} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors" title="Home"><Home size={20} /></button>
                    <button onClick={() => window.location.hash = '#/settings'} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors" title="Settings"><SettingsIcon size={20} /></button>
                    <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors" title="Toggle Theme">{theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}</button>
                </div>
            </header>

            <div className="flex-grow overflow-y-auto p-4">
                {content}
            </div>
        </main>
    </div>
  );
};

export default App;
