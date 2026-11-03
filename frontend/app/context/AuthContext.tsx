"use client";

import { getAccessToken } from "@/app/lib/auth";

import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";

interface AuthContextType {
  user: any;
  refreshUser: () => Promise<void>;
  logout: () => void;
  loading: boolean;
  startPreview: (userId: number) => Promise<void>;
  endPreview: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    const token =
      typeof window !== "undefined" ? getAccessToken() : null;
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      let res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 && sessionStorage.getItem("previewToken")) {
        sessionStorage.removeItem("previewToken");
        res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
      }
      if (!res.ok) throw new Error("Unauthorized");

      const data = await res.json();
      setUser(data);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const logout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      sessionStorage.removeItem("previewToken");
    }
    setUser(null);
  };

  const startPreview = async (userId: number) => {
    const response = await fetch(`/api/auth/users/${userId}/preview`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || "Could not start preview");
    }
    const data = await response.json();
    sessionStorage.setItem("previewToken", data.access_token);
    await refreshUser();
  };

  const endPreview = async () => {
    try {
      await fetch("/api/auth/preview/end", {
        method: "POST",
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
    } finally {
      sessionStorage.removeItem("previewToken");
      await refreshUser();
    }
  };

  return (
    <AuthContext.Provider value={{ user, refreshUser, logout, loading, startPreview, endPreview }}>
      <Fragment key={`${user?.id ?? "anonymous"}:${user?.preview?.audit_id ?? "self"}`}>
        {children}
      </Fragment>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}