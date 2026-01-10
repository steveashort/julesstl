import React, { useMemo } from 'react';
import { MetricRecord } from '../api';
import { getMetricColor } from '../utils/statusUtils';
import clsx from 'clsx';
import { Timer } from 'lucide-react';

interface Props {
  data: MetricRecord[];
  metricKey: string;
}

const EnumMetricDisplay: React.FC<Props> = ({ data, metricKey }) => {
  const filteredData = useMemo(() =>
    [...data]
      .filter(d => d.key === metricKey)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [data, metricKey]
  );

  if (filteredData.length === 0) return null;

  const latest = filteredData[0];

  const statusChanges = useMemo(() => {
    const changes: MetricRecord[] = [];
    let lastVal = '';
    // Reverse to iterate from oldest to newest for change detection
    const chron = [...filteredData].reverse();
    for (const d of chron) {
      if (d.value_str !== lastVal) {
        changes.push(d);
        lastVal = d.value_str || '';
      }
    }
    return changes.reverse().slice(0, 10); // Show last 10 changes
  }, [filteredData]);

  const getColorClass = (metric: MetricRecord) => {
    const color = getMetricColor(metric);
    switch (color) {
      case 'green': return 'bg-green-500';
      case 'yellow': return 'bg-yellow-500';
      case 'red': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="w-full">
      <h4 className="text-center text-sm font-bold mb-4 dark:text-gray-300 uppercase tracking-wider">{metricKey}</h4>

      <div className="flex flex-col items-center mb-6">
        <div className={clsx("px-6 py-3 rounded-xl text-white text-xl font-bold uppercase shadow-lg transform transition-transform hover:scale-105",
          getColorClass(latest))}>
          {latest.value_str || 'UNKNOWN'}
        </div>
        <div className="text-xs text-gray-500 mt-2 flex items-center gap-1">
          <Timer size={12} />
          <span>Last updated: {new Date(latest.timestamp).toLocaleString()}</span>
        </div>
      </div>

      <div className="mt-4 border-t dark:border-gray-700 pt-4">
        <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase flex items-center gap-2">
          Status History
        </h5>
        <div className="space-y-2">
          {statusChanges.map((change, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs p-2 rounded bg-gray-50 dark:bg-gray-700/50">
              <div className="flex items-center gap-2">
                <span className={clsx("w-3 h-3 rounded-full", getColorClass(change))}></span>
                <span className="font-semibold dark:text-gray-200">{change.value_str}</span>
              </div>
              <span className="text-gray-400">{new Date(change.timestamp).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EnumMetricDisplay;
