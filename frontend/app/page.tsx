"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./login/page";
import Dashboard from "./components/Dashboard/Dashboard";

export default function DefaultPage() {
  const { user, loading } = useAuth();
  const [dashboardData, setDashboardData] = useState<any>(null);
  const router = useRouter();

  // Fetch dashboard data only when the user is set.
  useEffect(() => {
    if (user) {
      const token = localStorage.getItem("token");
      if (!token) return;

      const fetchDashboard = async () => {
        try {
          const res = await fetch("/api/dashboard", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error("Failed to load dashboard");
          const data = await res.json();
          setDashboardData(data);
        } catch (error) {
          console.error("Error loading dashboard:", error);
        }
      };

      fetchDashboard();
    }
  }, [user]);

  if (loading) return <p>Loading...</p>;
  if (!user) return <LoginPage />;

  return <Dashboard user={user} dashboardData={dashboardData} />;
}