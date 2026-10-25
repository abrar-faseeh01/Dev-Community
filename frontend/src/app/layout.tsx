import { Header } from "@/components/layout/header";
import { ROUTES } from "@/constants/routes";
import { Providers } from "@/providers/providers";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "@/styles/globals.css";

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
        <Providers>
          <Header />
          {children}
          <footer className="mt-auto border-t border-neutral-800">
            <div className="mx-auto flex max-w-5xl justify-end px-4 py-4 sm:px-6">
              <Link
                href={ROUTES.HEALTH}
                className="text-xs text-neutral-500 transition-colors hover:text-neutral-300"
              >
                System status
              </Link>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
