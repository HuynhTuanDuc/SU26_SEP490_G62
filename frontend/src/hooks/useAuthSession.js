import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../services/apiClient";
import {
  clearSession,
  getStoredUser,
  saveRememberedEmail,
  saveSession,
} from "../services/storage";

export function useAuthSession() {
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    const currentUser = await apiRequest("/auth/me");
    saveSession({ user: currentUser });
    setUser(currentUser);
    return currentUser;
  }, []);

  const setSession = useCallback(({ user: nextUser, rememberEmail }) => {
    saveSession({ user: nextUser });

    if (rememberEmail !== undefined) {
      saveRememberedEmail(rememberEmail);
    }

    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST", retryOnAuthFailure: false });
    } catch {
      // Clear local session state even if the logout request fails.
    }
    clearSession();
    setUser(null);
  }, []);

  useEffect(() => {
    let active = true;

    const hydrateSession = async () => {
      try {
        await refreshSession();
      } catch {
        clearSession();
        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    hydrateSession();

    return () => {
      active = false;
    };
  }, [refreshSession]);

  return {
    user,
    loading,
    setSession,
    refreshSession,
    logout,
  };
}
