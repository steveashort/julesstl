import React from 'react';
import { TrafficLightState } from '../api';
import clsx from 'clsx';

interface Props {
  tl: TrafficLightState;
}

const TrafficLightCard: React.FC<Props> = ({ tl }) => {
  const pillClass = clsx("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize", {
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300': tl.colour === 'green',
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300': tl.colour === 'yellow',
    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300': tl.colour === 'red',
    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300': tl.colour === 'purple',
    'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300': !['green', 'yellow', 'red', 'purple'].includes(tl.colour),
  });

  return (
    <div className="block h-full">
      <div className="border dark:border-gray-700 rounded shadow-sm p-3 hover:shadow-md transition h-full flex flex-col bg-white dark:bg-gray-800 text-sm">
        <div className="flex justify-between items-start mb-2">
          <div className="flex flex-col overflow-hidden mr-2">
             <h3 className="font-bold text-base dark:text-gray-200 truncate" title={tl.tl}>{tl.tl}</h3>
             <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{tl.class}</span>
          </div>
          <span className={pillClass}>
              {tl.colour}
          </span>
        </div>
        
        <p className="text-xs text-gray-600 dark:text-gray-400 truncate mb-2">{tl.description}</p>
        
        <div className="mt-auto pt-2 border-t dark:border-gray-700 flex flex-col gap-1">
             <div className="flex flex-wrap gap-1 mb-1">
              {tl.tags.slice(0, 3).map(tag => (
                <span key={tag} className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 text-[10px] px-1.5 py-0.5 rounded border dark:border-blue-900/30">
                  {tag}
                </span>
              ))}
              {tl.tags.length > 3 && <span className="text-[10px] text-gray-400">+{tl.tags.length - 3}</span>}
            </div>
            <div className="text-[10px] text-gray-400 text-right">
              {new Date(tl.timestamp).toLocaleTimeString()}
            </div>
        </div>
      </div>
    </div>
  );
};

export default TrafficLightCard;
