import { useState, useEffect } from "react";
import { onAuthStateChange, signOut, getSession } from "./services/auth";
import type { AuthUser } from "./services/auth";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import ResumeAnalyzer from "./ResumeUpload";

type View = "auth" | "home" | "dashboard";

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [view, setView] = useState<View>("auth");
  const [authLoading, setAuthLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    getSession().then((session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? "" });
        setView("home");
      }
      setAuthLoading(false);
    });

    const { data: sub } = onAuthStateChange((u) => {
      setUser(u);
      if (u) setView("home");
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    setView("auth");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-animated flex items-center justify-center">
        <svg className="spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      </div>
    );
  }

  // Auth page
  if (view === "auth") {
    return <AuthPage onAuth={() => setView("home")} />;
  }

  // Dashboard
  if (view === "dashboard" && user) {
    return <Dashboard user={user} onBack={() => setView("home")} />;
  }

  // Main analyzer
  return (
    <div className="bg-animated min-h-screen relative">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      {/* Header */}
      <header className="relative z-10 border-b border-white/5 glass-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <div>
              <span className="font-bold text-white text-lg tracking-tight">ResumeAI</span>
              <span className="text-xs text-white/40 ml-2 font-medium">Analyzer</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <button
                  onClick={() => setView("dashboard")}
                  className="btn-secondary py-2 px-4 rounded-xl text-xs flex items-center gap-2"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  My History
                </button>

                <div className="flex items-center gap-2 px-3 py-2 rounded-xl glass-card border border-white/8">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-xs font-bold text-white">
                    {user.email[0].toUpperCase()}
                  </div>
                  <span className="text-white/60 text-xs max-w-32 truncate">{user.email}</span>
                </div>

                <button
                  onClick={handleSignOut}
                  className="btn-secondary py-2 px-3 rounded-xl text-xs flex items-center gap-1.5 text-red-400/70 hover:text-red-400 border-red-500/10 hover:border-red-500/25"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <span className="text-white/30 text-xs">Guest mode</span>
                <button
                  onClick={() => setView("auth")}
                  className="btn-primary py-2 px-4 rounded-xl text-xs"
                >
                  Sign In to Save
                </button>
              </>
            )}

            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
              ✦ AI Powered
            </span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card border border-violet-500/20 text-sm text-violet-300 font-medium mb-6">
            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse"></span>
            Powered by OpenRouter · Free AI Models
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-5 leading-tight">
            <span className="gradient-text">Analyze Your Resume</span>
            <br />
            <span className="text-white/90 text-4xl md:text-5xl">with AI Intelligence</span>
          </h1>

          <p className="text-white/50 text-lg max-w-xl mx-auto leading-relaxed">
            Get instant ATS scores, skill gap analysis, and career recommendations
            powered by advanced AI models — completely free.
          </p>

          {user && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Signed in — analyses will be saved automatically
            </div>
          )}
        </div>

        <ResumeAnalyzer user={user} />
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 mt-20 py-6">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-white/25 text-sm">
          <span>© {new Date().getFullYear()} ResumeAI Analyzer</span>
          <span>Built with React · Vite · Supabase · OpenRouter</span>
        </div>
      </footer>
    </div>
  );
}

export default App;