"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LoginPage from "./login/page";
import Link from "next/link";

/**
 * DefaultPage checks if a user is logged in by looking for a token in localStorage.
 * If a valid token exists (and the backend confirms it), the dashboard is rendered.
 * Otherwise, the LoginPage is rendered.
 */
export default function DefaultPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [dashboardData, setDashboardData] = useState<any>({ surveys: [] });
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    // If a token is found, attempt to fetch user information
    if (token) {
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => {
          if (!res.ok) {
            throw new Error("Invalid token");
          }
          return res.json();
        })
        .then((data) => {
          setUser(data);
          // If user data is returned, fetch dashboard information
          return fetch("/api/dashboard", { headers: { Authorization: `Bearer ${token}` } });
        })
        .then((res) => res.json())
        .then((dashboard) => {
          setDashboardData(dashboard);
          setLoading(false);
        })
        .catch(() => {
          // If any error occurs (invalid token, API error, etc.), show the login form.
          setShowLogin(true);
          setLoading(false);
        });
    } else {
      // No token found, so show login form.
      setShowLogin(true);
      setLoading(false);
    }
  }, []);

  // While waiting for async operations, show a loading message.
  if (loading) return <p>Loading...</p>;

  // If no valid session exists, render the login page.
  if (showLogin || !user) return <LoginPage />;

  // If the user is authenticated, render the dashboard.
  return (
    <div style={{ padding: "2rem" }}>
      <h1>Dashboard</h1>
      <p>Welcome, {user.username}!</p>
      {dashboardData?.surveys?.length > 0 ? (
        <div>
          <h2>Your Studies</h2>
          <ul>
            {dashboardData.surveys.map((study: any) => (
              <li key={study.id}>
                <strong>{study.title}</strong>
                <p>{study.description}</p>
              </li>
            ))}
          </ul>
          {/* Link to the study selection page (only accessible if logged in) */}
          <p>
            <Link href="/retrieve-study">Search studies</Link>
          </p>
        </div>
      ) : (
        <p>No studies associated.</p>
      )}
    </div>
  );
}
