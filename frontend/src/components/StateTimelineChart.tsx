import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrafficLightState } from '../api';

interface Props {
  history: TrafficLightState[];
  domain: [number | 'dataMin', number | 'dataMax'];
}

const StateTimelineChart: React.FC<Props> = ({ history, domain }) => {
  
  const colorMap: { [key: string]: string } = {
    green: '#22c55e', // green-500
    yellow: '#eab308',// yellow-500
    red: '#ef4444',  // red-500
    purple: '#8b5cf6',// purple-500
    gray: '#6b7280',  // gray-500
  };

  const chartData = React.useMemo(() => {
    if (history.length === 0) return [];
    const sorted = [...history].reverse(); // oldest first
    const data = sorted.map((item, index) => {
        const next = sorted[index + 1];
        return {
            timestamp: new Date(item.timestamp).getTime(),
            colour: item.colour,
            description: item.description,
            // Add a point for the end of the state duration
            endTimestamp: next ? new Date(next.timestamp).getTime() : new Date().getTime(),
        };
    });

    // To make continuous blocks, we need to duplicate points at each state change
    const plotPoints: any[] = [];
    data.forEach(item => {
        plotPoints.push({ time: item.timestamp, colour: item.colour, description: item.description, value: 1 });
        plotPoints.push({ time: item.endTimestamp, colour: item.colour, description: item.description, value: 1 });
    });
    return plotPoints;

  }, [history]);

  const formatXAxis = (timeNum: number) => {
    return new Date(timeNum).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const gradientId = "colorGradient";

  // Calculate gradient offsets
  const offsets = React.useMemo(() => {
    if (chartData.length < 2) return null;
    const minTime = chartData[0].time;
    const maxTime = chartData[chartData.length - 1].time;
    const totalDuration = maxTime - minTime;
    if (totalDuration === 0) return null;

    let lastTime = minTime;
    return chartData.map((p) => {
        const offset = ((p.time - minTime) / totalDuration * 100).toFixed(3);
        lastTime = p.time;
        return { offset: `${offset}%`, color: colorMap[p.colour] || colorMap.gray };
    });
  }, [chartData]);


  if (chartData.length === 0) {
    return <div className="text-center text-gray-500 py-4">No history to display in timeline.</div>;
  }

  return (
    <div className="h-40 w-full relative">
        <h4 className="text-center font-semibold mb-4 dark:text-gray-200">State Timeline</h4>
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart 
                data={chartData}
                margin={{ top: 5, right: 30, left: 20, bottom: 20 }}
            >
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                        {offsets?.map(({ offset, color }, i) => (
                            <stop key={i} offset={offset} stopColor={color} />
                        ))}
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ccc" strokeOpacity={0.3}/>
                <XAxis 
                    dataKey="time" 
                    type="number" 
                    domain={domain} 
                    tickFormatter={formatXAxis} 
                    scale="time"
                    minTickGap={40}
                />
                <YAxis hide={true} domain={[0, 'dataMax']} />
                <Tooltip 
                    content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                                <div className="bg-white dark:bg-gray-800 p-2 border dark:border-gray-700 rounded shadow-md">
                                    <p className="font-semibold capitalize" style={{ color: colorMap[data.colour] || colorMap.gray }}>{data.colour}</p>
                                    <p className="text-sm">{new Date(data.time).toLocaleString()}</p>
                                    <p className="text-xs text-gray-500">{data.description}</p>
                                </div>
                            );
                        }
                        return null;
                    }}
                />
                <Area type="step" dataKey="value" stroke={`url(#${gradientId})`} fill={`url(#${gradientId})`} strokeWidth={2} />
            </AreaChart>
        </ResponsiveContainer>
    </div>
  );
};

export default StateTimelineChart;