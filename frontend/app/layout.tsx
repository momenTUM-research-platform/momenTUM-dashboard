import "./globals.css";

import type {
  Metadata,
} from "next";

import Header from "./components/Header/Header";
import Footer from "./components/Footer/Footer";
import { AuthProvider } from "./context/AuthContext";

export const metadata: Metadata = {
  title: "momenTUM Research Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
    >
      <body>
        <AuthProvider>
          <div className="appShell">
            <Header />

            <div className="appContent">
              {children}
            </div>

            <Footer />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}