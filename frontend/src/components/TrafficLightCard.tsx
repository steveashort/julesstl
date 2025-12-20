import React from 'react';
import { TrafficLightState } from '../api';
import clsx from 'clsx';

interface Props {
  tl: TrafficLightState;
}

const TrafficLightCard: React.FC<Props> = ({ tl }) => {
  const colourClass = clsx({
    'bg-green-500': tl.colour === 'green',
    'bg-yellow-500': tl.colour === 'yellow',
    'bg-red-500': tl.colour === 'red',
    'bg-gray-500': !['green', 'yellow', 'red'].includes(tl.colour),
  });

  return (
    <div className="block h-full">
      <div className="border rounded-lg shadow-md p-4 hover:shadow-lg transition h-full flex flex-col">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold text-lg">{tl.tl}</h3>
          <span className="text-sm text-gray-500">{tl.class}</span>
        </div>
        <div className={clsx("h-8 w-8 rounded-full mb-4", colourClass)} />
        <p className="text-sm text-gray-700 truncate">{tl.description}</p>
        <div className="text-xs text-gray-400 mt-2">
          Updated: {new Date(tl.timestamp).toLocaleString()}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {tl.tags.map(tag => (
            <span key={tag} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TrafficLightCard;
