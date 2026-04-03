import React, { useMemo } from 'react';
import Chart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { MetricRecord } from '../api';

interface Props {
  data: MetricRecord[];
  metricKey: string;
  domain: [number | 'dataMin', number | 'dataMax'];
  onZoom: (left: number, right: number) => void;
}

const MetricsChart: React.FC<Props> = ({ data, metricKey, domain, onZoom }) => {
  const filteredData = useMemo(() => data
    .filter(d => d.key === metricKey && d.metric_type === 'gauge')
    .map(d => ({
        ...d,
        value: Number(d.value),
        timeNum: new Date(d.timestamp).getTime()
    }))
    .filter(d => !isNaN(d.value) && !isNaN(d.timeNum)), [data, metricKey]);

  const thresholds = useMemo(() => {
    if (filteredData.length === 0) return { greenMax: 0, yellowMax: 0 };
    const last = [...filteredData].reverse().find(d => (d.green_if?.length || 0) > 0 || (d.yellow_if?.length || 0) > 0);
    
    const parse = (rules: string[] = []) => {
        let max = 0;
        for (const r of rules) {
            if (r.includes(':')) {
                const val = parseFloat(r.split(':')[1]);
                if (!isNaN(val) && val > max) max = val;
            }
        }
        return max;
    };

    return {
        greenMax: parse(last?.green_if),
        yellowMax: parse(last?.yellow_if)
    };
  }, [filteredData]);

  if (filteredData.length === 0) return null;

  const currentMin = typeof domain[0] === 'number' ? domain[0] : Math.min(...filteredData.map(d => d.timeNum));
  const currentMax = typeof domain[1] === 'number' ? domain[1] : Math.max(...filteredData.map(d => d.timeNum));
  const visibleData = filteredData.filter(d => d.timeNum >= currentMin && d.timeNum <= currentMax);
  const dataMax = visibleData.length > 0 ? Math.max(...visibleData.map(d => d.value)) : 0;
  
  let yMax = Math.max(dataMax, thresholds.yellowMax * 1.1);
  if (yMax <= 0) yMax = 100;

  const greenStop = (thresholds.greenMax / yMax) * 100;
  const yellowStop = (thresholds.yellowMax / yMax) * 100;

  const series = [{
    name: metricKey,
    data: filteredData.map(d => [d.timeNum, d.value])
  }];

  const options: ApexOptions = {
    chart: {
      type: 'line',
      height: '100%',
      animations: { enabled: false },
      toolbar: {
        autoSelected: 'zoom',
        tools: {
          pan: false,
          download: false,
          reset: false
        }
      },
      events: {
        zoomed: function(chartContext, { xaxis }) {
          if (xaxis && xaxis.min !== undefined && xaxis.max !== undefined) {
             onZoom(xaxis.min, xaxis.max);
          }
        }
      }
    },
    stroke: {
      curve: 'straight',
      width: 3,
    },
    fill: {
      type: 'gradient',
      gradient: {
        type: 'vertical',
        shadeIntensity: 1,
        colorStops: [
          { offset: 0, color: "#ef4444", opacity: 1 },
          { offset: Math.max(0, 100 - yellowStop), color: "#ef4444", opacity: 1 },
          { offset: Math.max(0, 100 - yellowStop), color: "#eab308", opacity: 1 },
          { offset: Math.max(0, 100 - greenStop), color: "#eab308", opacity: 1 },
          { offset: Math.max(0, 100 - greenStop), color: "#22c55e", opacity: 1 },
          { offset: 100, color: "#22c55e", opacity: 1 }
        ]
      }
    },
    xaxis: {
      type: 'datetime',
      min: currentMin,
      max: currentMax,
      labels: {
        datetimeUTC: false,
      }
    },
    yaxis: {
      min: 0,
      max: yMax,
      labels: {
        style: { fontSize: '10px' }
      }
    },
    tooltip: {
      x: { format: 'dd MMM yyyy HH:mm:ss' }
    },
    dataLabels: { enabled: false },
    grid: {
      show: true,
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } }
    }
  };

  return (
    <div className="h-64 w-full select-none">
      <h4 className="text-center text-sm font-bold mb-2 dark:text-gray-300 uppercase tracking-wider">{metricKey}</h4>
      <div className="h-[220px] w-full">
        <Chart options={options} series={series} type="line" height="100%" />
      </div>
    </div>
  );
};

export default MetricsChart;
