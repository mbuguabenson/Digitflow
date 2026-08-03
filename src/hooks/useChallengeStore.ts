import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Challenge, ChallengeConfig } from '@/lib/challenge';
import { calculateChallenge } from '@/lib/challenge';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

type ChallengeRow = {
  id: string;
  name: string;
  config: ChallengeConfig;
  days: Challenge['days'];
  stats: Challenge['stats'];
  status: string;
  created_at: string;
  updated_at: string;
};

function rowToChallenge(row: ChallengeRow): Challenge {
  return {
    id: row.id,
    config: row.config,
    days: row.days,
    stats: row.stats,
    status: row.status as Challenge['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useChallengeStore() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('challenges')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      if (data) setChallenges(data.map(rowToChallenge));
    } catch (err) {
      console.error('Failed to load challenges:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (challenge: Challenge): Promise<Challenge | null> => {
    try {
      const payload = {
        name: challenge.config.name,
        config: challenge.config,
        days: challenge.days,
        stats: challenge.stats,
        status: challenge.status,
        updated_at: new Date().toISOString(),
      };

      let result;
      if (challenge.id) {
        const { data, error } = await supabase
          .from('challenges')
          .update(payload)
          .eq('id', challenge.id)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabase
          .from('challenges')
          .insert(payload)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        result = data;
      }

      if (result) {
        const updated = rowToChallenge(result);
        setChallenges(prev => {
          const idx = prev.findIndex(c => c.id === updated.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = updated;
            return copy;
          }
          return [updated, ...prev];
        });
        return updated;
      }
    } catch (err) {
      console.error('Failed to save challenge:', err);
    }
    return null;
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      await supabase.from('challenges').delete().eq('id', id);
      setChallenges(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      console.error('Failed to delete challenge:', err);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return { challenges, loading, loadAll, save, remove };
}

export { supabase };
