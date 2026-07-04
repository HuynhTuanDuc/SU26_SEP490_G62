import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { router, useSegments } from 'expo-router';

import { ERROR_MESSAGES } from '@/constants/error-messages';
import { authEvents } from '@/lib/auth-events';
import { profileService } from '@/services/profile-service';
import { tokenStorage } from '@/services/token-storage';
import type { UserProfile } from '@/types/profile';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  profile: UserProfile | null;
  refreshSession: () => Promise<UserProfile | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isPublicRoute(firstSegment: string | undefined) {
  return firstSegment === undefined || firstSegment === 'login';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const segments = useSegments();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const signOut = useCallback(async () => {
    await tokenStorage.clearAll();
    setProfile(null);
    setStatus('unauthenticated');
    router.replace('/login');
  }, []);

  const refreshSession = useCallback(async () => {
    const token = await tokenStorage.getToken();
    if (!token) {
      setProfile(null);
      setStatus('unauthenticated');
      return null;
    }

    try {
      const { profile: nextProfile } = await profileService.getMyProfile();

      if (nextProfile.role !== 'driver') {
        await tokenStorage.removeToken();
        setProfile(null);
        setStatus('unauthenticated');
        throw new Error(ERROR_MESSAGES.driverOnly);
      }

      setProfile(nextProfile);
      setStatus('authenticated');
      return nextProfile;
    } catch (error) {
      await tokenStorage.clearAll();
      setProfile(null);
      setStatus('unauthenticated');
      throw error;
    }
  }, []);

  useEffect(() => {
    authEvents.register(signOut);
  }, [signOut]);

  useEffect(() => {
    refreshSession().catch(() => {
      setProfile(null);
      setStatus('unauthenticated');
    });
  }, [refreshSession]);

  useEffect(() => {
    if (status === 'loading') return;

    const firstSegment = segments[0];
    const publicRoute = isPublicRoute(firstSegment);

    if (status === 'authenticated' && publicRoute) {
      router.replace('/(tabs)');
      return;
    }

    if (status === 'unauthenticated' && !publicRoute) {
      router.replace('/login');
    }
  }, [segments, status]);

  const value = useMemo(
    () => ({ status, profile, refreshSession, signOut }),
    [status, profile, refreshSession, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthSession must be used inside AuthProvider');
  return context;
}
