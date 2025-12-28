import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts';
import { MetricRecord } from '../api';

interface Props {
  data: MetricRecord[];
  metricKey: string;
  domain: [number | 'dataMin', number | 'dataMax'];
  onZoom: (left: number, right: number) => void;
}

const MetricsChart: React.FC<Props> = ({ data, metricKey, domain, onZoom }) => {
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);

  const filteredData = React.useMemo(() => data
    .filter(d => d.key === metricKey && d.metric_type === 'gauge')
    .map(d => ({
        ...d,
        timeNum: new Date(d.timestamp).getTime()
    })), [data, metricKey]);

  if (filteredData.length === 0) return null;

  const zoom = () => {
    if (refAreaLeft === refAreaRight || refAreaRight === null || refAreaLeft === null) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }

    let newLeft = refAreaLeft;
    let newRight = refAreaRight;
    if (newLeft > newRight) [newLeft, newRight] = [newRight, newLeft];

    setRefAreaLeft(null);
    setRefAreaRight(null);
    
    onZoom(newLeft, newRight);
  };

  // Determine thresholds/zones
  const lastRecord = [...filteredData].reverse().find(d => (d.green_if && d.green_if.length > 0) || (d.yellow_if && d.yellow_if.length > 0));
  const greenRules = lastRecord?.green_if || [];
  const yellowRules = lastRecord?.yellow_if || [];

  const parseRanges = (rules: string[]) => {
      return rules.filter(r => r.includes(':')).map(r => {
          const [min, max] = r.split(':').map(Number);
          return { min, max };
      }).filter(r => !isNaN(r.min) && !isNaN(r.max));
  };

  const greenZones = parseRanges(greenRules);
  const yellowZones = parseRanges(yellowRules);

  let overallMin = Number.MAX_VALUE;
  let overallMax = Number.MIN_VALUE;
  [...greenZones, ...yellowZones].forEach(z => {
      if (z.min < overallMin) overallMin = z.min;
      if (z.max > overallMax) overallMax = z.max;
  });

  const redZones = [];
  if (overallMin !== Number.MAX_VALUE) {
      // Bottom Red Zone: 10% below min (or 0 if negative logic applies, but assume generic)
      // If min is 0, then -0.1? Gauge usually >= 0? Assuming positive.
      // If min is 0, we can't show 10% below 0 easily if domain is clamped.
      // But let's follow instruction: 10% less than min.
      // If min is 0, 10% of 0 is 0.
      // If ranges are 0:65. Min is 0. 
      // If user wants to see "Red" outside, and 0 is bound, then maybe only Top Red Zone matters for 0-start.
      // But mathematically:
      redZones.push({ min: overallMin - (overallMin * 0.1), max: overallMin });
      // Top Red Zone: 10% above max
      redZones.push({ min: overallMax, max: overallMax + (overallMax * 0.1) });
  }

  // Check time span
  const currentMin = typeof domain[0] === 'number' ? domain[0] : Math.min(...filteredData.map(d => d.timeNum));
  const currentMax = typeof domain[1] === 'number' ? domain[1] : Math.max(...filteredData.map(d => d.timeNum));
  const isMultiDay = (currentMax - currentMin) > 86400000;

  // Calculate yMax
  const visibleData = filteredData.filter(d => d.timeNum >= currentMin && d.timeNum <= currentMax);
  const visibleMax = visibleData.length > 0 ? Math.max(...visibleData.map(d => d.value)) : 0;

  let yMax = visibleMax;
  // Ensure we see the Red Zones (at least the top one)
  if (redZones.length > 0) {
      yMax = Math.max(yMax, redZones[1].max);
  } else {
      yMax = yMax * 1.1;
  }
  
  if (yMax === 0) yMax = 10;

  const yTicks = Array.from({ length: 6 }, (_, i) => parseFloat((yMax * (i / 5)).toFixed(2)));

  const formatXAxis = (timeNum: number) => {
    const date = new Date(timeNum);
    if (isMultiDay) {
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleTimeString();
  };

  return (
    <div className="h-80 w-full relative select-none">
      <h4 className="text-center font-semibold mb-2 dark:text-gray-200">{metricKey}</h4>
      
      <ResponsiveContainer width="100%" height="100%">
        <LineChart 
            data={filteredData} 
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            onMouseDown={(e) => e && setRefAreaLeft(Number(e.activeLabel))}
            onMouseMove={(e) => refAreaLeft && e && setRefAreaRight(Number(e.activeLabel))}
            onMouseUp={zoom}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#ccc" strokeOpacity={0.3} />
          <XAxis
            allowDataOverflow
            dataKey="timeNum"
            type="number"
            domain={[currentMin, currentMax]}
            tickFormatter={formatXAxis}
            minTickGap={30}
            stroke="#888"
          />
          <YAxis 
            allowDataOverflow 
            domain={[0, yMax]} 
            stroke="#888" 
            ticks={yTicks}
            minTickGap={20}
          />
          <Tooltip 
            labelFormatter={(label) => new Date(label).toLocaleString()} 
            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
          />
          <Legend />
          
          {/* Green Zones */}
          {greenZones.map((z, i) => (
             <ReferenceArea key={`g-${i}`} y1={z.min} y2={z.max} fill="rgba(34, 197, 94, 0.2)" stroke="none" />
          ))}
          {/* Yellow Zones */}
          {yellowZones.map((z, i) => (
             <ReferenceArea key={`y-${i}`} y1={z.min} y2={z.max} fill="rgba(234, 179, 8, 0.3)" stroke="none" />
          ))}
          {/* Red Zones */}
          {redZones.map((z, i) => (
             <ReferenceArea key={`r-${i}`} y1={z.min} y2={z.max} fill="rgba(239, 68, 68, 0.2)" stroke="none" />
          ))}

          {/* Selection Box */}
          {refAreaLeft && refAreaRight ? (
            <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="rgba(136, 132, 216, 0.3)" />
          ) : null}

          <Line type="monotone" dataKey="value" stroke="#6366f1" activeDot={{ r: 6 }} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MetricsChart;
