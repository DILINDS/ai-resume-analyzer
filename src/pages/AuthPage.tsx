import { useState } from "react";
import { signIn, signUp } from "../services/auth";

interface AuthPageProps {
  onAuth: () => void;
}

export default function AuthPage({ onAuth }: AuthPageProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        await signUp(email, password);
        setSuccess("Account created! Check your email to confirm, then sign in.");
        setMode("signin");
      } else {
        await signIn(email, password);
        onAuth();
      }
    } catch (err) {
      setError(String(err).replace("Error: ", ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-animated flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="relative z-10 w-full max-w-md fade-in-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-2xl shadow-violet-500/40 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">ResumeAI Analyzer</h1>
          <p className="text-white/40 text-sm mt-1">
            {mode === "signin" ? "Sign in to access your resume history" : "Create your free account"}
          </p>
        </div>

        {/* Card */}
        <div className="glass-card rounded-2xl p-8">
          {/* Toggle */}
          <div className="flex rounded-xl bg-white/5 p-1 mb-7">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setSuccess(null); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200
                  ${mode === m
                    ? "bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-lg"
                    : "text-white/40 hover:text-white/70"
                  }`}
              >
                {m === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/25
                  focus:outline-none focus:border-violet-500/60 focus:bg-white/8 transition-all duration-200 text-sm"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1.5">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/25
                  focus:outline-none focus:border-violet-500/60 focus:bg-white/8 transition-all duration-200 text-sm"
              />
              {mode === "signup" && (
                <p className="text-white/30 text-xs mt-1.5">Minimum 6 characters</p>
              )}
            </div>

            {/* Error / Success */}
            {error && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2.5">
                <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2.5">
                <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <p className="text-emerald-400 text-sm">{success}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <svg className="spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  {mode === "signin" ? "Signing in..." : "Creating account..."}
                </>
              ) : (
                mode === "signin" ? "Sign In" : "Create Account"
              )}
            </button>
          </form>

          {/* Guest mode note */}
          <p className="text-center text-white/25 text-xs mt-5">
            Don't want an account?{" "}
            <button onClick={onAuth} className="text-violet-400 hover:text-violet-300 underline transition-colors">
              Continue as guest
            </button>
            {" "}(analyses won't be saved)
          </p>
        </div>
      </div>
    </div>
  );
}
