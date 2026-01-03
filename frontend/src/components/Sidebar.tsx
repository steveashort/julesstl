import React, { useState, useMemo, useEffect } from 'react';
import { TrafficLightState } from '../api';
import { ChevronRight, ChevronDown, Server, Folder, Layers } from 'lucide-react';

interface Props {
  trafficLights: TrafficLightState[];
  currentTl?: { class: string; group: string; tl: string };
}

const Sidebar: React.FC<Props> = ({ trafficLights, currentTl }) => {
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Expand current TL's path when it changes or on mount
  useEffect(() => {
    if (currentTl) {
      setExpandedClasses(prev => {
          const next = new Set(prev);
          next.add(currentTl.class);
          return next;
      });
      setExpandedGroups(prev => {
          const next = new Set(prev);
          next.add(`${currentTl.class}-${currentTl.group}`);
          return next;
      });
    }
  }, [currentTl?.class, currentTl?.group, currentTl?.tl]);

  const groupedTree = useMemo(() => {
    return trafficLights.reduce((acc, tl) => {
      if (!acc[tl.class]) acc[tl.class] = {};
      if (!acc[tl.class][tl.group]) acc[tl.class][tl.group] = [];
      acc[tl.class][tl.group].push(tl);
      return acc;
    }, {} as Record<string, Record<string, TrafficLightState[]>>);
  }, [trafficLights]);

  const toggleClass = (className: string) => {
    setExpandedClasses(prev => {
      const next = new Set(prev);
      if (next.has(className)) {
        next.delete(className);
      } else {
        next.add(className);
      }
      return next;
    });
  };

  const toggleGroup = (className: string, groupName: string) => {
    const key = `${className}-${groupName}`;
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  
  const isTlActive = (tl: TrafficLightState) => {
      return currentTl && currentTl.class === tl.class && currentTl.group === tl.group && currentTl.tl === tl.tl;
  }

  return (
    <div className="h-full bg-gray-50 dark:bg-gray-800 border-r dark:border-gray-700 p-2 text-sm text-gray-800 dark:text-gray-200 overflow-y-auto flex flex-col">
        <a href="#/" className="block font-bold text-lg p-2 mb-2 dark:text-white">Dashboard</a>
        <nav className="flex-grow overflow-y-auto">
            <ul>
                {Object.entries(groupedTree).map(([className, groups]) => (
                    <li key={className}>
                        <div onClick={() => toggleClass(className)} className="flex items-center p-2 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700">
                           {expandedClasses.has(className) ? <ChevronDown size={16} className="mr-1" /> : <ChevronRight size={16} className="mr-1" />}
                           <Layers size={14} className="mr-2 text-gray-500" />
                           <span className="font-semibold">{className}</span>
                        </div>
                        {expandedClasses.has(className) && (
                            <ul className="pl-4 border-l ml-3 dark:border-gray-600">
                                {Object.entries(groups).map(([groupName, tls]) => (
                                    <li key={groupName}>
                                        <div onClick={() => toggleGroup(className, groupName)} className="flex items-center p-2 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700">
                                            {expandedGroups.has(`${className}-${groupName}`) ? <ChevronDown size={16} className="mr-1" /> : <ChevronRight size={16} className="mr-1" />}
                                            <Folder size={14} className="mr-2 text-gray-500" />
                                            <span>{groupName}</span>
                                        </div>
                                        {expandedGroups.has(`${className}-${groupName}`) && (
                                            <ul className="pl-4 border-l ml-3 dark:border-gray-600">
                                                {tls.map(tl => (
                                                    <li key={tl.tl}>
                                                        <a href={`#/details/${tl.class}/${tl.group}/${tl.tl}`} 
                                                           className={`flex items-center p-2 rounded text-xs transition-colors ${isTlActive(tl) ? 'bg-blue-100 dark:bg-blue-900/40 font-semibold' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                                                            <Server size={12} className="mr-2 text-gray-500" />
                                                            {tl.tl}
                                                        </a>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </li>
                ))}
            </ul>
        </nav>
    </div>
  );
};

export default Sidebar;
