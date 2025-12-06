// src/app/layout.js
import "./globals.css";

export const metadata = {
  title: "Exodologio",
  description: "Οικογενειακό έσοδα-έξοδα, απλά και καθαρά.",
  manifest: "/manifest.webmanifest",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

function LogoMark() {
  return (
    <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-sm">
      <div className="h-6 w-6 rounded-xl bg-white/95 flex items-center justify-center">
        <span className="text-orange-600 font-black text-sm">€</span>
      </div>
    </div>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="el">
      <body className="min-h-screen text-slate-900">
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LogoMark />
              <div className="leading-tight">
                <div className="font-extrabold tracking-tight text-lg">Exodologio</div>
                <div className="text-xs text-slate-500">Έσοδα • Έξοδα • Μήνας</div>
              </div>
            </div>

            <div className="text-xs text-slate-500 hidden md:block">
              PWA • Install στο κινητό
            </div>
          </div>
        </header>

        {children}

        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-slate-500 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} Exodologio</span>
            <span>Δεδομένα: localStorage (v1)</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
