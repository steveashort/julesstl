import React from 'react';
import { TrafficLightState } from '../api';
import clsx from 'clsx';

interface Props {
  tl: TrafficLightState;
}

const TrafficLightCard: React.FC<Props> = ({ tl }) => {
  const pillClass = clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize", {
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300': tl.colour === 'green',
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300': tl.colour === 'yellow',
    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300': tl.colour === 'red',
    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300': tl.colour === 'purple',
    'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300': !['green', 'yellow', 'red', 'purple'].includes(tl.colour),
  });

  return (
    <div className="block h-full">
      <div className="border dark:border-gray-700 rounded-lg shadow-md p-4 hover:shadow-lg transition h-full flex flex-col bg-white dark:bg-gray-800">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold text-lg dark:text-gray-200">{tl.tl}</h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">{tl.class}</span>
        </div>
        <div className="mb-4">
            <span className={pillClass}>
                {tl.colour}
            </span>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{tl.description}</p>
        <div className="text-xs text-gray-400 mt-2">
          Updated: {new Date(tl.timestamp).toLocaleString()}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {tl.tags.map(tag => (
            <span key={tag} className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs px-2 py-1 rounded">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TrafficLightCard;
