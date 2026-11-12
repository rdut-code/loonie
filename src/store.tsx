import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { emptyData } from './lib/actions';
import { loadData, saveData, wipeEverything } from './lib/storage';
import type { AppData } from './lib/types';
import { StoreContext } from './store-context';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    // Before setup (and right after a wipe) nothing at all is kept.
    if (!data.setupDone) {
      wipeEverything();
      setSaved(true);
      return;
    }
    setSaved(saveData(data));
  }, [data]);

  const update = useCallback((change: (d: AppData) => AppData) => setData((d) => change(d)), []);
  const restore = useCallback((d: AppData) => setData(d), []);
  const wipe = useCallback(() => {
    wipeEverything();
    setData(emptyData());
  }, []);

  const store = useMemo(() => ({ data, update, restore, wipe, saved }), [data, update, restore, wipe, saved]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export { useStore } from './store-context';
