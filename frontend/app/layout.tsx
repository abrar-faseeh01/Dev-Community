import { Header } from "@/components/layout/header";
import { AuthProvider } from "@/lib/auth/auth-context";
import { QueryClientProvider } from "@/lib/query-client";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dev Community",
  description: "A community for developers to share, discuss, and grow.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <QueryClientProvider>
          <AuthProvider>
            <Header />
            {children}
          </AuthProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
