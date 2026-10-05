import { create } from 'zustand';
import api from '../services/api';
import type { HistorySummary, ScanResult } from '../types';

interface HistoryState {
  items: ScanResult[];
  summary: HistorySummary | null;
  nextCursor: string | null;
  hasMore: boolean;

  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  error: string | null;
  /** Set when a new scan lands so the tab refetches on next focus. */
  stale: boolean;

  load: (options?: { refresh?: boolean }) => Promise<void>;
  loadMore: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  invalidate: () => void;
}

const PAGE_SIZE = 25;

export const useHistoryStore = create<HistoryState>((set, get) => ({
  items: [],
  summary: null,
  nextCursor: null,
  hasMore: false,

  loading: false,
  loadingMore: false,
  refreshing: false,
  error: null,
  stale: true,

  load: async (options = {}) => {
    const { refresh = false } = options;
    if (get().loading || get().refreshing) return;

    set(refresh ? { refreshing: true, error: null } : { loading: true, error: null });

    try {
      // Summary and first page are independent; one request's latency should
      // not gate the other.
      const [page, summary] = await Promise.all([
        api.getHistory({ limit: PAGE_SIZE }),
        api.getHistorySummary(),
      ]);

      set({
        items: page.items,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        summary,
        stale: false,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loading: false, refreshing: false });
    }
  },

  loadMore: async () => {
    const { hasMore, nextCursor, loadingMore, items } = get();
    if (!hasMore || !nextCursor || loadingMore) return;

    set({ loadingMore: true });

    try {
      const page = await api.getHistory({ cursor: nextCursor, limit: PAGE_SIZE });
      // Guard against a duplicate page if a scan landed mid-pagination.
      const seen = new Set(items.map((item) => item.id));
      set({
        items: [...items, ...page.items.filter((item) => !seen.has(item.id))],
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ loadingMore: false });
    }
  },

  remove: async (id) => {
    const previous = get().items;
    // Optimistic: the row disappears immediately and is restored on failure.
    set({ items: previous.filter((item) => item.id !== id) });

    try {
      await api.deleteScan(id);
      set({ stale: true });
    } catch (error) {
      set({
        items: previous,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  invalidate: () => set({ stale: true }),
}));

export default useHistoryStore;
