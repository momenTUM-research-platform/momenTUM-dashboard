"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [dashboardData, setDashboardData] = useState<any>({ surveys: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      // Fetch user info
      fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => setUser(data))
        .catch(() => setUser(null));

      // Fetch dashboard data (studies, etc.)
      fetch("/api/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          setDashboardData(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Dashboard</h1>
      {user && user.username ? (
        <>
          <p>Welcome, {user.username}!</p>
          {loading ? (
            <p>Loading dashboard data...</p>
          ) : (
            <div>
              <h2>Your Studies</h2>
              {dashboardData?.surveys?.length > 0 ? (
                <ul>
                  {dashboardData.surveys.map((study: any) => (
                    <li key={study.id}>
                      <strong>{study.title}</strong>
                      <p>{study.description}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No studies associated.</p>
              )}
              {/* Show select studies link only if logged in */}
              <p>
                <Link href="/select-studies">Select studies</Link>
              </p>
            </div>
          )}
        </>
      ) : (
        <p>Please log in.</p>
      )}
    </div>
  );
}
