import React from 'react';
import Chart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
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
    purple: '#a855f7',// purple-500
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

  // Calculate gradient offsets
  const offsets = React.useMemo(() => {
    if (chartData.length < 2) return null;
    const minTime = chartData[0].time;
    const maxTime = chartData[chartData.length - 1].time;
    const totalDuration = maxTime - minTime;
    if (totalDuration === 0) return null;

    return chartData.map((p) => {
        const offset = ((p.time - minTime) / totalDuration * 100);
        return { offset: offset, color: colorMap[p.colour] || colorMap.gray, opacity: 0.8 };
    });
  }, [chartData]);

  if (chartData.length === 0) {
    return <div className="text-center text-gray-500 py-4">No history to display in timeline.</div>;
  }
  
  const currentMin = typeof domain[0] === 'number' ? domain[0] : chartData[0].time;
  const currentMax = typeof domain[1] === 'number' ? domain[1] : chartData[chartData.length - 1].time;

  const series = [{
    name: 'State',
    data: chartData.map((d) => [d.time, d.value])
  }];

  const options: ApexOptions = {
    chart: {
      type: 'area',
      height: '100%',
      animations: { enabled: false },
      toolbar: { show: false },
      zoom: { enabled: false }
    },
    dataLabels: { enabled: false },
    stroke: {
      curve: 'stepline',
      width: 2,
    },
    fill: {
      type: 'gradient',
      gradient: {
        type: 'horizontal',
        colorStops: offsets ? offsets : []
      }
    },
    xaxis: {
      type: 'datetime',
      min: currentMin,
      max: currentMax,
      labels: { datetimeUTC: false }
    },
    yaxis: {
      show: false,
      min: 0,
      max: 1.1
    },
    tooltip: {
      custom: function({ dataPointIndex }: any) {
         const data = chartData[dataPointIndex];
         if (!data) return '';
         const date = new Date(data.time).toLocaleString();
         return `
            <div class="bg-white dark:bg-gray-800 p-2 border dark:border-gray-700 rounded shadow-md">
                <p class="font-semibold capitalize" style="color: ${colorMap[data.colour] || colorMap.gray}">${data.colour}</p>
                <p class="text-sm">${date}</p>
                <p class="text-xs text-gray-500">${data.description}</p>
            </div>
         `;
      }
    },
    grid: {
      show: true,
      strokeDashArray: 3,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: false } }
    }
  };

  return (
    <div className="h-40 w-full relative">
        <h4 className="text-center font-semibold mb-4 dark:text-gray-200">State Timeline</h4>
        <div className="h-[120px] w-full">
            <Chart options={options} series={series} type="area" height="100%" />
        </div>
    </div>
  );
};

export default StateTimelineChart;