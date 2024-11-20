import { useState, useEffect } from 'react';
import { Weapon, WeaponType } from '../types/weapon';

export const useWeapons = (weaponType: WeaponType | null) => {
  const [weapons, setWeapons] = useState<Weapon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWeapons = async () => {
      if (!weaponType) {
        setWeapons([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/Data/${weaponType}s.json`);
        if (!response.ok) {
          throw new Error(`Failed to load ${weaponType} weapons`);
        }
        
        const data = await response.json();
        const weaponsWithType = data.map((weapon: Omit<Weapon, 'type'>) => ({
          ...weapon,
          type: weaponType,
          ATK: Number(weapon.ATK),
          base_main: Number(weapon.base_main),
          passive_stat: weapon.passive_stat ? Number(weapon.passive_stat) : undefined,
          passive_stat2: weapon.passive_stat2 ? Number(weapon.passive_stat2) : undefined,
        }));
        
        setWeapons(weaponsWithType);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load weapons');
        setWeapons([]);
      } finally {
        setLoading(false);
      }
    };

    loadWeapons();
  }, [weaponType]);

  return { weapons, loading, error };
};