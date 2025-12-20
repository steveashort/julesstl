import React, { useState, useEffect } from 'react';
import { getTrafficLights, getHistory, getMetrics, TrafficLightState, MetricRecord } from './api';
import TrafficLightCard from './components/TrafficLightCard';
import MetricsChart from './components/MetricsChart';
import clsx from 'clsx';

const Dashboard: React.FC = () => {
  const [tls, setTls] = useState<TrafficLightState[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="p-4">Loading...</div>;

  const grouped = tls.reduce((acc, tl) => {
    if (!acc[tl.class]) acc[tl.class] = [];
    acc[tl.class].push(tl);
    return acc;
  }, {} as Record<string, TrafficLightState[]>);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Traffic Light Dashboard</h1>
      {Object.entries(grouped).map(([cls, items]) => (
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
      ))}
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
                        'bg-gray-500': !['green', 'yellow', 'red'].includes(item.colour),
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
                        'bg-gray-500': !['green', 'yellow', 'red'].includes(item.colour),
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

  const hash = route.substring(1); // remove #

  if (hash.startsWith('/details/')) {
    const parts = hash.split('/');
    // /details/WebServer/my_server_01 -> ["", "details", "WebServer", "my_server_01"]
    if (parts.length >= 4) {
      return <Details cls={parts[2]} tl={parts[3]} />;
    }
  }

  return <Dashboard />;
};

export default App;
