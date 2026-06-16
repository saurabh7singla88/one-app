import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BSE Stock Scanner',
  description: 'Scan all BSE-listed Indian stocks for 52W highs/lows, RSI extremes, volume surges and get AI-powered recommendations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen antialiased">
        {/* Top nav */}
        <nav className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 font-bold text-gray-900 hover:text-blue-600 transition-colors">
              <span className="text-lg">📊</span>
              <span>BSE Scanner</span>
            </a>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="hidden sm:inline">Indian Equity Research Tool</span>
              <a
                href="https://finance.yahoo.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:text-blue-500"
              >
                Data: Yahoo Finance
              </a>
            </div>
          </div>
        </nav>

        {/* Page content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>

        {/* Disclaimer */}
        <footer className="border-t border-gray-100 bg-white mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-xs text-gray-400">
            ⚠ This tool is for informational and educational purposes only. Not financial advice.
            Always do your own research before investing.
          </div>
        </footer>
      </body>
    </html>
  );
}
