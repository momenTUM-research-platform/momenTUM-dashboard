import "react-big-calendar/lib/css/react-big-calendar.css"; // Required globally
import "./globals.css"; 
import Header from "./components/Header/Header";
import { AuthProvider } from "./context/AuthContext";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-lt-installed="true" --> hydration error caused by Chrome extension, adding this line to <html> is a workaround. 
    <html lang="en" data-lt-installed="true"> 
      <body>
        <AuthProvider>
          <Header />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
