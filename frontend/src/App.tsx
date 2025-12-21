import React, { useState, useEffect, useMemo } from 'react';
import { getTrafficLights, getHistory, getMetrics, getIncidents, TrafficLightState, MetricRecord, IncidentRecord } from './api';
import TrafficLightCard from './components/TrafficLightCard';
import MetricsChart from './components/MetricsChart';
import clsx from 'clsx';
import { Filter, AlertTriangle } from 'lucide-react';

const Dashboard: React.FC = () => {
  const [tls, setTls] = useState<TrafficLightState[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedColour, setSelectedColour] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('');

  useEffect(() => {
    getTrafficLights().then(data => {
      setTls(data);
      setLoading(false);
    });
    const interval = setInterval(() => {
      getTrafficLights().then(setTls);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Compute available options
  const classes = useMemo(() => Array.from(new Set(tls.map(tl => tl.class))).sort(), [tls]);
  const colours = useMemo(() => Array.from(new Set(tls.map(tl => tl.colour))).sort(), [tls]);
  const tags = useMemo(() => {
    const allTags = tls.flatMap(tl => tl.tags);
    return Array.from(new Set(allTags)).sort();
  }, [tls]);

  // Filter logic
  const filteredTls = useMemo(() => {
    return tls.filter(tl => {
      if (selectedClass && tl.class !== selectedClass) return false;
      if (selectedColour && tl.colour !== selectedColour) return false;
      if (selectedTag && !tl.tags.includes(selectedTag)) return false;
      return true;
    });
  }, [tls, selectedClass, selectedColour, selectedTag]);

  const grouped = useMemo(() => {
    return filteredTls.reduce((acc, tl) => {
      if (!acc[tl.class]) acc[tl.class] = [];
      acc[tl.class].push(tl);
      return acc;
    }, {} as Record<string, TrafficLightState[]>);
  }, [filteredTls]);

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6">
        <div className="flex items-center">
            <h1 className="text-2xl font-bold mb-4 md:mb-0 mr-4">Traffic Light Dashboard</h1>
            <button onClick={() => window.location.hash = '#/incidents'} className="flex items-center text-red-600 border border-red-600 px-3 py-1 rounded hover:bg-red-50">
                <AlertTriangle className="w-4 h-4 mr-2" />
                Incidents Report
            </button>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap gap-2 items-center bg-gray-50 p-3 rounded-lg border">
          <Filter className="w-5 h-5 text-gray-500 mr-2" />

          <select
            value={selectedClass}
            onChange={e => setSelectedClass(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">All Classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={selectedColour}
            onChange={e => setSelectedColour(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">All Colours</option>
            {colours.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={selectedTag}
            onChange={e => setSelectedTag(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">All Tags</option>
            {tags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {(selectedClass || selectedColour || selectedTag) && (
            <button
              onClick={() => { setSelectedClass(''); setSelectedColour(''); setSelectedTag(''); }}
              className="text-red-500 text-sm hover:underline ml-2"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="text-sm text-gray-500 mb-4">
        Showing {filteredTls.length} of {tls.length} traffic lights
      </div>

      {Object.entries(grouped).length === 0 ? (
        <div className="text-center text-gray-500 py-10">No traffic lights match your filters.</div>
      ) : (
        Object.entries(grouped).map(([cls, items]) => (
          <div key={cls} className="mb-8">
            <h2 className="text-xl font-semibold mb-2">{cls}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map(tl => (
                <div key={tl.tl} className="cursor-pointer" onClick={() => window.location.hash = `/details/${tl.class}/${tl.tl}`}>
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
            setIncidents(data);
            setLoading(false);
        });
    }, [hours]);

    return (
        <div className="p-4">
            <button onClick={() => window.location.hash = '/'} className="mb-4 text-blue-500 hover:underline">&larr; Back to Dashboard</button>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Incidents Report</h1>
                <div className="flex items-center">
                    <span className="mr-2 text-sm text-gray-600">Time range:</span>
                    <select
                        value={hours}
                        onChange={e => setHours(Number(e.target.value))}
                        className="border rounded px-2 py-1"
                    >
                        <option value={1}>Last 1 Hour</option>
                        <option value={6}>Last 6 Hours</option>
                        <option value={12}>Last 12 Hours</option>
                        <option value={24}>Last 24 Hours</option>
                        <option value={48}>Last 48 Hours</option>
                        <option value={168}>Last 7 Days</option>
                    </select>
                </div>
            </div>

            {loading ? <div className="text-center py-10">Loading incidents...</div> : (
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border">
                        <thead>
                            <tr>
                                <th className="py-2 px-4 border-b">Class</th>
                                <th className="py-2 px-4 border-b">TL Name</th>
                                <th className="py-2 px-4 border-b">Colour</th>
                                <th className="py-2 px-4 border-b">Start Time</th>
                                <th className="py-2 px-4 border-b">Duration</th>
                                <th className="py-2 px-4 border-b">Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            {incidents.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-gray-500">No incidents found in the last {hours} hours.</td>
                                </tr>
                            ) : (
                                incidents.map((incident, i) => (
                                    <tr key={i} className="hover:bg-gray-50">
                                        <td className="py-2 px-4 border-b">{incident.class}</td>
                                        <td className="py-2 px-4 border-b font-medium">
                                            <button onClick={() => window.location.hash = `/details/${incident.class}/${incident.tl}`} className="text-blue-600 hover:underline">
                                                {incident.tl}
                                            </button>
                                        </td>
                                        <td className="py-2 px-4 border-b">
                                            <span className={clsx("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", {
                                                "bg-yellow-100 text-yellow-800": incident.colour === 'yellow',
                                                "bg-red-100 text-red-800": incident.colour === 'red',
                                            })}>
                                                {incident.colour}
                                            </span>
                                        </td>
                                        <td className="py-2 px-4 border-b">{new Date(incident.start_time).toLocaleString()}</td>
                                        <td className="py-2 px-4 border-b">
                                            {incident.duration_seconds > 3600
                                                ? `${(incident.duration_seconds / 3600).toFixed(2)}h`
                                                : incident.duration_seconds > 60
                                                    ? `${(incident.duration_seconds / 60).toFixed(1)}m`
                                                    : `${incident.duration_seconds.toFixed(0)}s`}
                                        </td>
                                        <td className="py-2 px-4 border-b text-sm text-gray-600 truncate max-w-xs" title={incident.description || ""}>
                                            {incident.description}
                                        </td>
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

  useEffect(() => {
    Promise.all([
      getHistory(cls, tl),
      getMetrics(cls, tl)
    ]).then(([h, m]) => {
      setHistory(h);
      setMetrics(m);
      setLoading(false);
    });
  }, [cls, tl]);

  if (loading) return <div className="p-4">Loading...</div>;

  // Calculate durations
  // History is ordered by timestamp DESC
  const historyWithDuration = history.map((item, index) => {
    const nextItem = history[index + 1];
    let duration = "-";
    if (nextItem) {
        const diff = new Date(item.timestamp).getTime() - new Date(nextItem.timestamp).getTime();
        // duration = `${(diff / 1000).toFixed(1)}s`;
        // Show in human readable format
        const seconds = diff / 1000;
        if (seconds > 3600) duration = `${(seconds / 3600).toFixed(1)}h`;
        else if (seconds > 60) duration = `${(seconds / 60).toFixed(1)}m`;
        else duration = `${seconds.toFixed(1)}s`;
    }
    return { ...item, duration };
  });

  // Calculate aggregated state durations (consecutive same colours)
  // We need to process in chronological order (ASC) to build logic easily, then reverse for display
  const sortedHistory = [...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  interface StateDuration {
    colour: string;
    startTime: string;
    endTime: string;
    durationSeconds: number;
    count: number;
  }

  const stateDurations: StateDuration[] = [];

  if (sortedHistory.length > 0) {
    let current = sortedHistory[0];
    let count = 1;
    let startTime = current.timestamp;

    for (let i = 1; i < sortedHistory.length; i++) {
        const next = sortedHistory[i];
        if (next.colour === current.colour) {
            count++;
        } else {
            // State changed
            const endTime = next.timestamp;
            const duration = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000;
            stateDurations.push({
                colour: current.colour,
                startTime,
                endTime,
                durationSeconds: duration,
                count
            });
            current = next;
            count = 1;
            startTime = next.timestamp;
        }
    }
    // Push the last state (ongoing)
    // For ongoing, we can't calculate duration unless we use "now" or just say "until now" or "open".
    // But typically user wants to know how long it stayed that way.
    // If it is the last update, the duration is technically 0 if we consider it point-in-time,
    // or we measure until now. Let's use "Since last update".
    stateDurations.push({
        colour: current.colour,
        startTime,
        endTime: "Latest",
        durationSeconds: (new Date().getTime() - new Date(startTime).getTime()) / 1000,
        count
    });
  }

  // Reverse to show latest on top
  const reversedStateDurations = [...stateDurations].reverse();

  const uniqueMetricKeys = Array.from(new Set(metrics.map(m => m.key)));

  return (
    <div className="p-4">
      <button onClick={() => window.location.hash = '/'} className="mb-4 text-blue-500 hover:underline">&larr; Back</button>
      <h1 className="text-2xl font-bold mb-4">{cls} / {tl}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">State Durations (Aggregated)</h2>
          <div className="overflow-x-auto mb-8">
            <table className="min-w-full bg-white border">
              <thead>
                <tr>
                  <th className="py-2 px-4 border-b">State</th>
                  <th className="py-2 px-4 border-b">Start Time</th>
                  <th className="py-2 px-4 border-b">End Time</th>
                  <th className="py-2 px-4 border-b">Updates Count</th>
                  <th className="py-2 px-4 border-b">Duration</th>
                </tr>
              </thead>
              <tbody>
                {reversedStateDurations.map((item, i) => (
                  <tr key={i}>
                    <td className="py-2 px-4 border-b">
                      <span className={clsx("inline-block w-4 h-4 rounded-full", {
                        'bg-green-500': item.colour === 'green',
                        'bg-yellow-500': item.colour === 'yellow',
                        'bg-red-500': item.colour === 'red',
                        'bg-purple-500': item.colour === 'purple',
                        'bg-gray-500': !['green', 'yellow', 'red', 'purple'].includes(item.colour),
                      })}></span> {item.colour}
                    </td>
                    <td className="py-2 px-4 border-b">{new Date(item.startTime).toLocaleString()}</td>
                    <td className="py-2 px-4 border-b">{item.endTime === "Latest" ? "Latest" : new Date(item.endTime).toLocaleString()}</td>
                    <td className="py-2 px-4 border-b">{item.count}</td>
                    <td className="py-2 px-4 border-b">
                        {item.durationSeconds > 3600
                            ? `${(item.durationSeconds / 3600).toFixed(2)}h`
                            : item.durationSeconds > 60
                                ? `${(item.durationSeconds / 60).toFixed(1)}m`
                                : `${item.durationSeconds.toFixed(0)}s`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="text-xl font-semibold mb-4">Metrics</h2>
          {uniqueMetricKeys.length > 0 ? (
            uniqueMetricKeys.map(key => (
               <MetricsChart key={key} data={metrics} metricKey={key} />
            ))
          ) : (
            <p>No metrics available.</p>
          )}
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Raw History</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border">
              <thead>
                <tr>
                  <th className="py-2 px-4 border-b">Timestamp</th>
                  <th className="py-2 px-4 border-b">Colour</th>
                  <th className="py-2 px-4 border-b">Interval</th>
                  <th className="py-2 px-4 border-b">Description</th>
                </tr>
              </thead>
              <tbody>
                {historyWithDuration.map((item, i) => (
                  <tr key={i}>
                    <td className="py-2 px-4 border-b">{new Date(item.timestamp).toLocaleString()}</td>
                    <td className="py-2 px-4 border-b">
                      <span className={clsx("inline-block w-4 h-4 rounded-full", {
                        'bg-green-500': item.colour === 'green',
                        'bg-yellow-500': item.colour === 'yellow',
                        'bg-red-500': item.colour === 'red',
                        'bg-purple-500': item.colour === 'purple',
                        'bg-gray-500': !['green', 'yellow', 'red', 'purple'].includes(item.colour),
                      })}></span> {item.colour}
                    </td>
                    <td className="py-2 px-4 border-b">{item.duration}</td>
                    <td className="py-2 px-4 border-b text-sm">{item.description}</td>
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

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Parse route
  // #/ -> Dashboard
  // #/details/:class/:tl -> Details
  // #/incidents -> IncidentsReport

  const hash = route.substring(1); // remove #

  if (hash.startsWith('/details/')) {
    const parts = hash.split('/');
    // /details/WebServer/my_server_01 -> ["", "details", "WebServer", "my_server_01"]
    if (parts.length >= 4) {
      return <Details cls={parts[2]} tl={parts[3]} />;
    }
  }

  if (hash === '/incidents') {
    return <IncidentsReport />;
  }

  return <Dashboard />;
};

export default App;
