import { createContext, useContext } from 'react';
import type { AppData } from './lib/types';

export interface Store {
  data: AppData;
  /** Apply a change. Everything is saved to this browser straight after. */
  update: (change: (data: AppData) => AppData) => void;
  /** Put a whole copy of the data in place (used by undo and by restoring a backup). */
  restore: (data: AppData) => void;
  /** Delete everything stored on this device and start fresh. */
  wipe: () => void;
  /** False if the browser refused the last save. */
  saved: boolean;
}

// Kept in its own file so that editing a screen during development
// never swaps this context out from under the running app.
export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
