import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Lock, Eye, EyeOff, User, ArrowRight, Sparkles } from "lucide-react";
import { useTheme } from "./context/ThemeContext.jsx";
import Chat from "./Chat.jsx";

const TOKEN_KEY = "cipherlink_token";

export default function App() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";

  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(() => {
    const raw = sessionStorage.getItem("cipherlink_user");
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleRegister(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const { generateIdentityKeyPair, exportPublicJwk, exportPrivateJwk, savePrivateKeyLocal } =
        await import("./crypto.js");
      const pair = await generateIdentityKeyPair();
      const publicJwk = await exportPublicJwk(pair.publicKey);
      const privateJwk = await exportPrivateJwk(pair.privateKey);
      savePrivateKeyLocal(privateJwk);
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, publicKey: publicJwk }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Registration failed");
      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem("cipherlink_user", JSON.stringify(data.user));
      setToken(data.token); setUser(data.user);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally { setBusy(false); }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Login failed");
      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem("cipherlink_user", JSON.stringify(data.user));
      setToken(data.token); setUser(data.user);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally { setBusy(false); }
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem("cipherlink_user");
    setToken(null); setUser(null);
  }

  if (token && user) {
    return <Chat token={token} user={user} onLogout={logout} />;
  }

  return (
    <div className={`min-h-full flex items-center justify-center p-4 ${dark ? "animated-bg" : "animated-bg-light"}`}>
      {/* Decorative orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl ${dark ? "bg-brand-600/10" : "bg-brand-400/15"}`} />
        <div className={`absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl ${dark ? "bg-purple-600/8" : "bg-purple-400/10"}`} />
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-3xl ${dark ? "bg-pink-600/5" : "bg-pink-400/8"}`} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className={`relative w-full max-w-md rounded-2xl overflow-hidden ${dark ? "glass-dark glow-border" : "glass-light glow-border"}`}
      >
        {/* Header */}
        <div className="relative px-8 pt-10 pb-8 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-5 bg-gradient-to-br from-brand-500 to-purple-600 shadow-lg shadow-brand-500/25"
          >
            <Shield className="w-10 h-10 text-white" strokeWidth={1.5} />
          </motion.div>

          <h1 className="text-3xl font-bold tracking-tight">
            <span className="gradient-text">CipherLink</span>
          </h1>
          <p className={`text-sm mt-2 ${dark ? "text-dark-muted" : "text-light-muted"}`}>
            End-to-end encrypted messaging. Your keys never leave your device.
          </p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className={`mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${dark ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-green-500/10 text-green-600 border border-green-500/20"}`}
          >
            <Lock className="w-3 h-3" />
            <span>AES-256-GCM + RSA-OAEP</span>
          </motion.div>
        </div>

        {/* Mode tabs */}
        <div className="px-8 mb-4">
          <div className={`flex rounded-xl p-1 ${dark ? "bg-dark-bg/60" : "bg-gray-100"}`}>
            {["login", "register"].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 ${
                  mode === m
                    ? "bg-gradient-to-r from-brand-500 to-purple-600 text-white shadow-md shadow-brand-500/20"
                    : dark ? "text-dark-muted hover:text-dark-text" : "text-light-muted hover:text-light-text"
                }`}
              >
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form
          className="px-8 pb-8 space-y-4"
          onSubmit={mode === "register" ? handleRegister : handleLogin}
        >
          {/* Username */}
          <div className="relative">
            <User className={`absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 ${dark ? "text-dark-muted" : "text-light-muted"}`} />
            <input
              className={`w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all duration-200 ${
                dark
                  ? "bg-dark-bg/60 border border-dark-border text-dark-text placeholder-dark-muted focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
                  : "bg-gray-50 border border-light-border text-light-text placeholder-light-muted focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
              }`}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="Username or phone number"
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 ${dark ? "text-dark-muted" : "text-light-muted"}`} />
            <input
              type={showPass ? "text" : "password"}
              className={`w-full pl-10 pr-12 py-3 rounded-xl text-sm outline-none transition-all duration-200 ${
                dark
                  ? "bg-dark-bg/60 border border-dark-border text-dark-text placeholder-dark-muted focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
                  : "bg-gray-50 border border-light-border text-light-text placeholder-light-muted focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30"
              }`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              placeholder="Password (min 6 characters)"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className={`absolute right-3 top-1/2 -translate-y-1/2 ${dark ? "text-dark-muted hover:text-dark-text" : "text-light-muted hover:text-light-text"}`}
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Info / Warning */}
          {mode === "login" && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-start gap-2 text-xs p-3 rounded-xl ${
                dark ? "bg-amber-500/10 text-amber-300 border border-amber-500/15" : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}
            >
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Use the same browser where you registered. Your encryption key is stored locally.</span>
            </motion.div>
          )}

          {mode === "register" && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-start gap-2 text-xs p-3 rounded-xl ${
                dark ? "bg-brand-500/10 text-brand-300 border border-brand-500/15" : "bg-brand-50 text-brand-700 border border-brand-200"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>A unique RSA-2048 keypair will be generated in your browser. Only the public key is sent to our server.</span>
            </motion.div>
          )}

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={`text-xs p-3 rounded-xl ${
                  dark ? "bg-red-500/10 text-red-400 border border-red-500/15" : "bg-red-50 text-red-600 border border-red-200"
                }`}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <motion.button
            type="submit"
            disabled={busy}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="w-full py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-brand-500 to-purple-600 hover:from-brand-600 hover:to-purple-700 shadow-lg shadow-brand-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
          >
            {busy ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {mode === "register" ? "Create Secure Account" : "Sign In"}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
