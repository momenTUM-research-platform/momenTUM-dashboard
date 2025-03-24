"use client";

import Link from "next/link";

interface DashboardProps {
  user: any;
  dashboardData: any;
}

const Dashboard: React.FC<DashboardProps> = ({ user, dashboardData }) => {
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
          <p>
            <Link href="/retrieve-study">Search studies</Link>
          </p>
        </div>
      ) : (
        <p>No studies associated.</p>
      )}
    </div>
  );
};

export default Dashboard;