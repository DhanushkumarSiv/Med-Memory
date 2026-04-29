import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { AuthUser } from "../types/auth";

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  providerSessionToken: string | null;
  setProviderSessionToken: (token: string | null) => void;
  setSession: (token: string, user: AuthUser) => void;
  clearSession: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function parseStoredUser(): AuthUser | null {
  const raw = localStorage.getItem("medmemory_user");
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [token, setToken] = useState<string | null>(localStorage.getItem("medmemory_token"));
  const [user, setUser] = useState<AuthUser | null>(parseStoredUser());
  const [providerSessionToken, setProviderSessionToken] = useState<string | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      providerSessionToken,
      setProviderSessionToken,
      setSession: (nextToken, nextUser) => {
        setToken(nextToken);
        setUser(nextUser);
        localStorage.setItem("medmemory_token", nextToken);
        localStorage.setItem("medmemory_user", JSON.stringify(nextUser));
      },
      clearSession: () => {
        setToken(null);
        setUser(null);
        setProviderSessionToken(null);
        localStorage.removeItem("medmemory_token");
        localStorage.removeItem("medmemory_user");
      },
    }),
    [token, user, providerSessionToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
