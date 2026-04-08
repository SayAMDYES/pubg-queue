import { useState, useEffect, useCallback } from 'react';
import { userMe, type UserMeData } from '../api';

const DEFAULT: UserMeData = { loggedIn: false, phone: '', gameNames: [] };

export function useUserMe() {
  const [user, setUser] = useState<UserMeData>(DEFAULT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    userMe()
      .then((res) => setUser(res.data))
      .catch(() => setUser(DEFAULT))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { user, loading, refresh };
}
