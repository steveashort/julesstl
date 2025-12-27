import React, { useState, useEffect, useMemo } from 'react';
import { getTrafficLights, getHistory, getMetrics, getIncidents, TrafficLightState, MetricRecord, IncidentRecord } from './api';
import TrafficLightCard from './components/TrafficLightCard';
import MetricsChart from './components/MetricsChart';
import clsx from 'clsx';
import { Filter, AlertTriangle, Moon, Sun } from 'lucide-react';

const Dashboard: React.FC = () => {
  const [tls, setTls] = useState<TrafficLightState[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedColour, setSelectedColour] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

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
  const colours = useMemo(() => Array.from(new Set(tls.map(tl => tl.colour))).sort(), [tls]);
  const tags = useMemo(() => {
    const allTags = tls.flatMap(tl => tl.tags || []);
    return Array.from(new Set(allTags)).sort();
  }, [tls]);

  const filteredTls = useMemo(() => {
    return tls.filter(tl => {
      if (selectedClass && tl.class !== selectedClass) return false;
      if (selectedColour && tl.colour !== selectedColour) return false;
      if (selectedTags.length > 0 && !selectedTags.every(t => (tl.tags || []).includes(t))) return false;
      return true;
    });
  }, [tls, selectedClass, selectedColour, selectedTags]);

  const grouped = useMemo(() => {
    return filteredTls.reduce((acc, tl) => {
      if (!acc[tl.class]) acc[tl.class] = [];
      acc[tl.class].push(tl);
      return acc;
    }, {} as Record<string, TrafficLightState[]>);
  }, [filteredTls]);

  const toggleTag = (tag: string) => {
      setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  if (loading) return <div className="p-4 dark:text-gray-200">Loading Dashboard...</div>;

  return (
    <div className="p-4">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex justify-between items-center">
             <div className="flex items-center">
                <h1 className="text-2xl font-bold mr-4 dark:text-white">Traffic Light Dashboard</h1>
                <button 
                    onClick={() => window.location.hash = '#/incidents'} 
                    className="flex items-center text-red-600 border border-red-600 px-3 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Incidents
                </button>
            </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border dark:border-gray-700">
           <div className="flex flex-wrap gap-2 items-center mb-2">
              <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400 mr-2" />
              <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
                <option value="">All Classes</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={selectedColour} onChange={e => setSelectedColour(e.target.value)} className="border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200">
                <option value="">All Colours</option>
                {colours.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {(selectedClass || selectedColour || selectedTags.length > 0) && (
                <button onClick={() => { setSelectedClass(''); setSelectedColour(''); setSelectedTags([]); }} className="text-red-500 text-sm hover:underline ml-2">Clear All</button>
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
        Object.entries(grouped).map(([cls, items]) => (
          <div key={cls} className="mb-8">
            <h2 className="text-xl font-semibold mb-2 dark:text-gray-200">{cls}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {items.map(tl => (
                <div key={tl.tl} className="cursor-pointer" onClick={() => window.location.hash = `#/details/${tl.class}/${tl.tl}`}>
                  <TrafficLightCard tl={tl} />
                </div>
              ))}
            </div>
          </div>
        ))
      )}
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
                                <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">TL Name</th>
                                <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">Colour</th>
                                <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">Start Time</th>
                                <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">Duration</th>
                                <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            {incidents.length === 0 ? (
                                <tr><td colSpan={6} className="py-8 text-center text-gray-500 dark:text-gray-400">No incidents found.</td></tr>
                            ) : (
                                incidents.map((incident, i) => (
                                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="py-2 px-4 border-b dark:border-gray-700 dark:text-gray-300">{incident.class}</td>
                                        <td className="py-2 px-4 border-b dark:border-gray-700 font-medium">
                                            <button onClick={() => window.location.hash = `#/details/${incident.class}/${incident.tl}`} className="text-blue-600 hover:underline dark:text-blue-400">{incident.tl}</button>
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

const Details: React.FC<{ cls: string, tl: string }> = ({ cls, tl }) => {
  const [history, setHistory] = useState<TrafficLightState[]>([]);
  const [metrics, setMetrics] = useState<MetricRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartDomain, setChartDomain] = useState<[number | 'dataMin', number | 'dataMax']>(['dataMin', 'dataMax']);

  const latestTL = useMemo(() => {
    if (history.length === 0) return null;
    return [...history].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  }, [history]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getHistory(cls, tl),
      getMetrics(cls, tl)
    ]).then(([h, m]) => {
      const hist = h || [];
      const mets = m || [];
      setHistory(hist);
      setMetrics(mets);
      setLoading(false);

      if (mets.length > 0) {
          const timestamps = mets.map(d => new Date(d.timestamp).getTime()).filter(t => !isNaN(t));
          if (timestamps.length > 0) {
              const maxTime = Math.max(...timestamps);
              const oneDayAgo = maxTime - (24 * 60 * 60 * 1000);
              const minTime = Math.min(...timestamps);
              if (minTime < oneDayAgo) {
                  setChartDomain([oneDayAgo, maxTime]);
              }
          }
      }
    }).catch(e => {
        console.error(e);
        setLoading(false);
    });
  }, [cls, tl]);

  const handleZoom = (left: number, right: number) => setChartDomain([left, right]);

  const resetZoom = (range: '24h' | '3d' | 'all') => {
      if (metrics.length === 0) return;
      const timestamps = metrics.map(d => new Date(d.timestamp).getTime()).filter(t => !isNaN(t));
      if (timestamps.length === 0) return;
      const maxTime = Math.max(...timestamps);
      if (range === 'all') setChartDomain(['dataMin', 'dataMax']);
      else if (range === '24h') setChartDomain([maxTime - 86400000, maxTime]);
      else if (range === '3d') setChartDomain([maxTime - 259200000, maxTime]);
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

  const historyWithDuration = history.map((item, index) => {
    const nextItem = history[index + 1];
    let duration = "-";
    if (nextItem) {
        const diff = new Date(item.timestamp).getTime() - new Date(nextItem.timestamp).getTime();
        duration = formatDuration(diff / 1000);
    }
    return { ...item, duration };
  });

  const uniqueMetricKeys = Array.from(new Set(metrics.map(m => m.key)));
  const metricsByTimestamp = metrics.reduce((acc, m) => {
    if (!acc[m.timestamp]) acc[m.timestamp] = [];
    acc[m.timestamp].push(m);
    return acc;
  }, {} as Record<string, MetricRecord[]>);

  const getMetricColour = (m: MetricRecord) => {
    if (m.metric_type === 'gauge') {
        if (m.red_at != null && m.value >= m.red_at) return 'red';
        if (m.yellow_at != null && m.value >= m.yellow_at) return 'yellow';
        return 'green';
    }
    return 'gray';
  };

  // --- Aggregation Logic (Wide Format) ---
  interface AggregatedPeriod {
    overall: string;
    metrics: Record<string, string>;
    startTime: string;
    endTime: string;
    count: number;
    durationSeconds: number;
  }

  const aggregatedPeriods = useMemo(() => {
      if (metrics.length === 0) return [];

      const allTimestamps = Array.from(new Set(metrics.map(m => m.timestamp)))
          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

      const periods: AggregatedPeriod[] = [];
      let currentMetricStates: Record<string, string> = {};
      uniqueMetricKeys.forEach(k => currentMetricStates[k] = 'gray');

      let currentOverall = 'green';
      let startTime = allTimestamps[0];
      let count = 0;

      const getOverall = (states: Record<string, string>) => {
          const colours = Object.values(states);
          if (colours.includes('red')) return 'red';
          if (colours.includes('yellow')) return 'yellow';
          return 'green';
      };

      const statesEqual = (s1: Record<string, string>, s2: Record<string, string>) => {
          return uniqueMetricKeys.every(k => s1[k] === s2[k]);
      };

      for (let i = 0; i < allTimestamps.length; i++) {
          const ts = allTimestamps[i];
          const updates = metricsByTimestamp[ts] || [];
          const nextMetricStates = { ...currentMetricStates };
          
          for (const m of updates) {
              nextMetricStates[m.key] = getMetricColour(m);
          }
          
          const nextOverall = getOverall(nextMetricStates);

          if (i > 0 && (nextOverall !== currentOverall || !statesEqual(nextMetricStates, currentMetricStates))) {
              const endTime = ts;
              periods.push({
                  overall: currentOverall,
                  metrics: { ...currentMetricStates },
                  startTime,
                  endTime,
                  count,
                  durationSeconds: (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000
              });
              startTime = ts;
              count = 0;
          }

          currentMetricStates = nextMetricStates;
          currentOverall = nextOverall;
          count += updates.length;
      }

      periods.push({
          overall: currentOverall,
          metrics: { ...currentMetricStates },
          startTime,
          endTime: "Latest",
          count,
          durationSeconds: (new Date().getTime() - new Date(startTime).getTime()) / 1000
      });

      return periods.reverse();
  }, [metrics, metricsByTimestamp, uniqueMetricKeys]);

  const effectiveDomain = useMemo(() => {
    let start = 0;
    let end = Date.now();

    if (metrics.length > 0) {
        const timestamps = metrics.map(m => new Date(m.timestamp).getTime());
        start = Math.min(...timestamps);
        end = Math.max(...timestamps);
        if (history.length > 0) {
            const historyTimestamps = history.map(h => new Date(h.timestamp).getTime());
            start = Math.min(start, ...historyTimestamps);
            end = Math.max(end, ...historyTimestamps);
        }
    } else if (history.length > 0) {
        const historyTimestamps = history.map(h => new Date(h.timestamp).getTime());
        start = Math.min(...historyTimestamps);
        end = Math.max(...historyTimestamps);
    }

    if (typeof chartDomain[0] === 'number') start = chartDomain[0];
    if (typeof chartDomain[1] === 'number') end = chartDomain[1];
    
    return { start, end };
  }, [metrics, history, chartDomain]);

  const filteredPeriods = useMemo(() => {
      return aggregatedPeriods.filter(p => {
          const pStart = new Date(p.startTime).getTime();
          const pEnd = p.endTime === "Latest" ? Date.now() : new Date(p.endTime).getTime();
          return pStart <= effectiveDomain.end && pEnd >= effectiveDomain.start;
      });
  }, [aggregatedPeriods, effectiveDomain]);

  const handleRowClick = (period: AggregatedPeriod) => {
      const start = new Date(period.startTime).getTime() - 3600000; // -1 hour
      const end = (period.endTime === "Latest" ? Date.now() : new Date(period.endTime).getTime()) + 3600000; // +1 hour
      setChartDomain([start, end]);
  };

  const downloadCsv = () => {
      const headers = ['Timestamp', 'Colour', 'Description', ...uniqueMetricKeys];
      const rows = historyWithDuration.map(item => {
          const rowMetricsMap = (metricsByTimestamp[item.timestamp] || []).reduce((acc, m) => { acc[m.key] = m.value; return acc; }, {} as Record<string, any>);
          const metricValues = uniqueMetricKeys.map(key => rowMetricsMap[key] ?? '');
          const esc = (s: any) => { const str = String(s || ''); return (str.includes(',') || str.includes('"') || str.includes('\n')) ? `"${str.replace(/"/g, '""')}"` : str; };
          return [esc(item.timestamp), esc(item.colour), esc(item.description), ...metricValues].join(',');
      });
      const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `${cls}_${tl}_history.csv`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  if (loading) return <div className="p-4 pt-16 dark:text-gray-200">Loading Details...</div>;

  return (
    <div className="p-4">
      <div className="sticky top-0 z-40 bg-gray-100 dark:bg-gray-900 pt-16 pb-4 border-b dark:border-gray-800 mb-6 -mx-4 px-4 shadow-sm">
          <div className="flex justify-between items-center mb-4">
              <button onClick={() => window.location.hash = '#/'} className="text-blue-500 hover:underline">&larr; Back</button>
              <div className="flex gap-2">
                  {['24h', '3d', 'all'].map(r => (
                      <button key={r} onClick={() => resetZoom(r as any)} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-sm rounded hover:bg-gray-300 dark:hover:bg-gray-600 dark:text-gray-200 capitalize">{r === '3d' ? '3 Days' : r}</button>
                  ))}
                  <div className="w-4"></div>
                  <button onClick={downloadCsv} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm font-medium">Download CSV</button>
              </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                <div>
                   <h1 className="text-2xl font-bold dark:text-white flex items-center gap-2">
                       {cls} / {tl}
                       {latestTL && (
                           <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize", {
                                'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300': latestTL.colour === 'green',
                                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300': latestTL.colour === 'yellow',
                                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300': latestTL.colour === 'red',
                                'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300': !['green', 'yellow', 'red'].includes(latestTL.colour),
                            })}>
                                {latestTL.colour}
                           </span>
                       )}
                   </h1>
                   {latestTL?.description && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{latestTL.description}</p>}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-white dark:bg-gray-800 px-2 py-1 rounded border dark:border-gray-700 whitespace-nowrap">
                    {new Date(effectiveDomain.start).toLocaleString()} - {new Date(effectiveDomain.end).toLocaleString()}
                </div>
            </div>
            {latestTL?.tags && latestTL.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                    {latestTL.tags.map(tag => (
                        <span key={tag} className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 text-xs px-2 py-0.5 rounded border dark:border-blue-900/30">
                          {tag}
                        </span>
                    ))}
                </div>
            )}
          </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div>
           <h2 className="text-xl font-semibold mb-4 dark:text-gray-200">Metrics</h2>
           {uniqueMetricKeys.length > 0 ? uniqueMetricKeys.map(key => (
                <div key={key} className="mb-6 bg-white dark:bg-gray-800 p-2 rounded shadow-sm border dark:border-gray-700">
                    <MetricsChart data={metrics} metricKey={key} domain={chartDomain} onZoom={handleZoom} />
                </div>
           )) : <p className="dark:text-gray-400">No metrics available.</p>}
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-4 dark:text-gray-200">State Durations (Aggregated)</h2>
          <div className="overflow-x-auto">
              <table className="min-w-full bg-white dark:bg-gray-800 border dark:border-gray-700">
              <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700">
                  <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">Overall</th>
                  {uniqueMetricKeys.map(key => (
                      <th key={key} className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">{key}</th>
                  ))}
                  <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">Start Time</th>
                  <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">End Time</th>
                  <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">Updates</th>
                  <th className="py-2 px-4 border-b dark:border-gray-600 text-left dark:text-gray-200">Duration</th>
                  </tr>
              </thead>
              <tbody>
                  {filteredPeriods.map((period, i) => (
                  <tr key={i} onClick={() => handleRowClick(period)} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                      <td className="py-2 px-4 border-b dark:border-gray-700 dark:text-gray-300">
                          <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize", {
                              'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300': period.overall === 'green',
                              'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300': period.overall === 'yellow',
                              'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300': period.overall === 'red',
                          })}>
                              {period.overall}
                          </span>
                      </td>
                      {uniqueMetricKeys.map(key => (
                          <td key={key} className="py-2 px-4 border-b dark:border-gray-700 dark:text-gray-300">
                             <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize", {
                                'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300': period.metrics[key] === 'green',
                                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300': period.metrics[key] === 'yellow',
                                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300': period.metrics[key] === 'red',
                                'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300': period.metrics[key] === 'purple',
                                'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300': !['green', 'yellow', 'red', 'purple'].includes(period.metrics[key]),
                            })}>
                                {period.metrics[key]}
                            </span>
                          </td>
                      ))}
                      <td className="py-2 px-4 border-b dark:border-gray-700 dark:text-gray-300 whitespace-nowrap">{new Date(period.startTime).toLocaleString()}</td>
                      <td className="py-2 px-4 border-b dark:border-gray-700 dark:text-gray-300 whitespace-nowrap">{period.endTime === "Latest" ? "Latest" : new Date(period.endTime).toLocaleString()}</td>
                      <td className="py-2 px-4 border-b dark:border-gray-700 dark:text-gray-300">{period.count}</td>
                      <td className="py-2 px-4 border-b dark:border-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {formatDuration(period.durationSeconds)}
                      </td>
                  </tr>
                  ))}
              </tbody>
              </table>
          </div>
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
  if (hash.startsWith('/details/')) {
    const parts = hash.split('/');
    if (parts.length >= 4) content = <Details cls={parts[2]} tl={parts[3]} />; 
  } else if (hash === '/incidents') {
    content = <IncidentsReport />;
  } else {
    content = <Dashboard />;
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
        <div className="fixed top-4 right-4 z-50">
            <button onClick={toggleTheme} className="p-2 rounded-full bg-white dark:bg-gray-800 shadow-md border dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Toggle Theme">
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
        </div>
        {content}
    </div>
  );
};

export default App;
