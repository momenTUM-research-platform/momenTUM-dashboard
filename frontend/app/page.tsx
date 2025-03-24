"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./login/page";
import Dashboard from "./components/Dashboard";

export default function DefaultPage() {
  const router = useRouter();
  const { user, refreshUser, loading } = useAuth();
  const [dashboardData, setDashboardData] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const fetchDashboard = async () => {
      try {
        const res = await fetch("/api/dashboard", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setDashboardData(data);
      } catch (error) {
        console.error("Error loading dashboard:", error);
      }
    };

    fetchDashboard();
  }, [user]);

  if (loading) return <p>Loading...</p>;
  if (!user) return <LoginPage />;

  return <Dashboard user={user} dashboardData={dashboardData} />;
}