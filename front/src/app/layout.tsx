import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { QueryClientProvider } from "@/components/Providers";
import websiteLogo from "@/assest/Logo minimaliste AT avec swoosh.png";

// Applies the stored/system theme before first paint so dark mode never flashes
// light (Phase 11.1). Kept in sync by ThemeProvider once React hydrates.
const themeInit = `(function(){try{var t=localStorage.getItem('jt_theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Job Tracker — Track Your Applications",
  description: "Save, track and manage your job applications with a Kanban board.",
  icons: {
    icon: websiteLogo.src,
    shortcut: websiteLogo.src,
    apple: websiteLogo.src,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className={`${inter.className} antialiased`}>
        <QueryClientProvider>
          <ThemeProvider>
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
