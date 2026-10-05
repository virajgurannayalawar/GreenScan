import { create } from 'zustand';
import api from '../services/api';
import { getDeviceId } from '../services/deviceIdentity';
import useScanStore from './useScanStore';
import type { Profile } from '../types';

interface ProfileState {
  profile: Profile | null;
  deviceId: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** Health probe so the user can see whether the backend is reachable. */
  backendStatus: 'unknown' | 'online' | 'offline';
  backendDetail: Record<string, unknown> | null;

  load: () => Promise<void>;
  save: (patch: Partial<Profile>) => Promise<void>;
  setBandMapping: (mapping: { red?: number; green?: number; blue?: number }) => Promise<void>;
  checkBackend: () => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  deviceId: null,
  loading: false,
  saving: false,
  error: null,
  backendStatus: 'unknown',
  backendDetail: null,

  load: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });

    try {
      const [deviceId, profile] = await Promise.all([getDeviceId(), api.getProfile()]);
      set({ deviceId, profile });

      // Keep the viewer's band mapping in step with the saved preference so a
      // sensor configured once renders correctly on every later scan.
      const saved = profile.preferences?.bandMapping;
      if (saved) {
        useScanStore.getState().setMapping({
          red: saved.red,
          green: saved.green,
          blue: saved.blue,
          nir: saved.red,
        });
      }
    } catch (error) {
      // The device id is local, so show it even when the API is unreachable.
      const deviceId = await getDeviceId().catch(() => null);
      set({
        deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      set({ loading: false });
    }
  },

  save: async (patch) => {
    set({ saving: true, error: null });
    try {
      const profile = await api.updateProfile(patch);
      set({ profile });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ saving: false });
    }
  },

  setBandMapping: async (mapping) => {
    const current = get().profile?.preferences?.bandMapping;
    const merged = {
      red: mapping.red ?? current?.red ?? 3,
      green: mapping.green ?? current?.green ?? 4,
      blue: mapping.blue ?? current?.blue ?? 1,
    };

    // Apply locally first — the viewer should respond instantly.
    useScanStore.getState().setMapping({ ...merged, nir: merged.red });

    await get().save({ preferences: { units: get().profile?.preferences?.units ?? 'percent', bandMapping: merged } } as Partial<Profile>);
  },

  checkBackend: async () => {
    try {
      const detail = await api.health();
      set({ backendStatus: 'online', backendDetail: detail });
    } catch {
      set({ backendStatus: 'offline', backendDetail: null });
    }
  },
}));

export default useProfileStore;
