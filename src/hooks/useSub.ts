import { useState, useEffect } from 'react';

interface SubstatData {
  [statName: string]: number[];
}

interface PanelSelections {
  [panelId: string]: Set<string>;
}

interface SubstatsHook {
  substatsData: SubstatData | null;
  loading: boolean;
  error: string | null;
  panelSelections: PanelSelections;
  selectStatForPanel: (panelId: string, stat: string, previousStat?: string) => void;
  unselectStatForPanel: (panelId: string, stat: string) => void;
  isStatAvailableForPanel: (panelId: string, stat: string, currentStat?: string) => boolean;
  getAvailableStats: () => string[];
  getStatValues: (stat: string) => number[] | null;
}

export const useSubstats = (): SubstatsHook => {
  const [substatsData, setSubstatsData] = useState<SubstatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panelSelections, setPanelSelections] = useState<PanelSelections>({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('Data/Substats.json');
        if (!response.ok) throw new Error('Failed to fetch substats');
        const data = await response.json();
        setSubstatsData(data.subStats);
      } catch (err) {
        setError('Error loading substats data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const selectStatForPanel = (panelId: string, stat: string, previousStat?: string) => {
    setPanelSelections(prev => {
      const panelStats = new Set(prev[panelId] || []);
      if (previousStat) panelStats.delete(previousStat);
      panelStats.add(stat);
      return { ...prev, [panelId]: panelStats };
    });
  };

  const unselectStatForPanel = (panelId: string, stat: string) => {
    setPanelSelections(prev => {
      const panelStats = new Set(prev[panelId] || []);
      panelStats.delete(stat);
      return { ...prev, [panelId]: panelStats };
    });
  };

  const isStatAvailableForPanel = (panelId: string, stat: string, currentStat?: string) => {
    const panelStats = panelSelections[panelId];
    if (!panelStats) return true;
    if (currentStat === stat) return true;
    return !panelStats.has(stat);
  };

  const getAvailableStats = () => {
    return substatsData ? Object.keys(substatsData) : [];
  };

  const getStatValues = (stat: string) => {
    return substatsData?.[stat] || null;
  };

  return {
    substatsData,
    loading,
    error,
    panelSelections,
    selectStatForPanel,
    unselectStatForPanel,
    isStatAvailableForPanel,
    getAvailableStats,
    getStatValues
  };
};