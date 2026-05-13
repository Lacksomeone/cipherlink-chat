import { useTheme } from "../context/ThemeContext.jsx";
import { motion } from "framer-motion";
import { Search, Plus, LogOut, Sun, Moon, Shield } from "lucide-react";

export default function Sidebar({
  user,
  conversations,
  activeId,
  socketConnected,
  onOpenConversation,
  onNewChat,
  onLogout,
  onlineUsers,
  typingUsers,
}) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";

  function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diff < 604800000) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return (
    <aside className={`flex flex-col w-full md:w-[360px] lg:w-[400px] shrink-0 h-full ${
      dark ? "glass-dark" : "glass-light"
    } border-r ${dark ? "border-dark-border" : "border-light-border"}`}>
      {/* Header */}
      <header className={`flex items-center justify-between px-4 py-3.5 border-b ${
        dark ? "border-dark-border" : "border-light-border"
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 shadow-md"
            style={{ background: `linear-gradient(135deg, ${user.avatarColor || "#6366f1"}, #a855f7)` }}
          >
            {user.username?.charAt(0)?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className={`font-semibold text-sm truncate ${dark ? "text-dark-text" : "text-light-text"}`}>
              {user.username}
            </p>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${socketConnected ? "bg-green-400" : "bg-yellow-400 animate-pulse"}`} />
              <span className={`text-xs ${dark ? "text-dark-muted" : "text-light-muted"}`}>
                {socketConnected ? "Connected" : "Connecting…"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={toggle}
            className={`p-2 rounded-lg transition-colors ${dark ? "hover:bg-dark-hover text-dark-muted" : "hover:bg-light-hover text-light-muted"}`}
            title="Toggle theme"
          >
            {dark ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
          </button>
          <button
            onClick={onNewChat}
            className="p-2 rounded-lg bg-gradient-to-r from-brand-500 to-purple-600 text-white shadow-md shadow-brand-500/20 hover:shadow-brand-500/30 transition-shadow"
            title="New chat"
          >
            <Plus className="w-4.5 h-4.5" />
          </button>
          <button
            onClick={onLogout}
            className={`p-2 rounded-lg transition-colors ${dark ? "hover:bg-dark-hover text-dark-muted" : "hover:bg-light-hover text-light-muted"}`}
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Encryption banner */}
      <div className={`flex items-center gap-2 px-4 py-2 text-xs ${
        dark ? "bg-brand-500/5 text-brand-400 border-b border-dark-border" : "bg-brand-50 text-brand-600 border-b border-light-border"
      }`}>
        <Shield className="w-3.5 h-3.5 shrink-0" />
        <span>Messages are end-to-end encrypted</span>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
              dark ? "bg-dark-card" : "bg-gray-100"
            }`}>
              <Search className={`w-7 h-7 ${dark ? "text-dark-muted" : "text-light-muted"}`} />
            </div>
            <p className={`text-sm font-medium ${dark ? "text-dark-text" : "text-light-text"}`}>
              No conversations yet
            </p>
            <p className={`text-xs mt-1 ${dark ? "text-dark-muted" : "text-light-muted"}`}>
              Tap + to start a new encrypted chat
            </p>
          </div>
        )}

        {conversations.map((c, i) => {
          const isActive = activeId === c.id;
          const isOnline = onlineUsers?.[c.peer?.id];
          const isTyping = typingUsers?.[c.peer?.id];

          return (
            <motion.button
              key={c.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => onOpenConversation(c)}
              className={`w-full text-left px-4 py-3.5 flex gap-3 border-b transition-all duration-200 ${
                dark
                  ? `border-dark-border/50 ${isActive ? "bg-brand-500/10 border-l-2 border-l-brand-500" : "hover:bg-dark-hover"}`
                  : `border-light-border/50 ${isActive ? "bg-brand-500/8 border-l-2 border-l-brand-500" : "hover:bg-light-hover"}`
              }`}
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-medium shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${c.peer?.avatarColor || "#6366f1"}, #a855f7)` }}
                >
                  {c.peer?.username?.charAt(0)?.toUpperCase()}
                </div>
                {isOnline && (
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-400 border-2 border-white dark:border-dark-surface rounded-full" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline gap-2">
                  <span className={`font-medium text-sm truncate ${dark ? "text-dark-text" : "text-light-text"}`}>
                    {c.peer?.username}
                  </span>
                  <span className={`text-[11px] shrink-0 ${dark ? "text-dark-muted" : "text-light-muted"}`}>
                    {formatTime(c.lastAt)}
                  </span>
                </div>
                <p className={`text-xs truncate mt-0.5 ${dark ? "text-dark-muted" : "text-light-muted"}`}>
                  {isTyping ? (
                    <span className="text-brand-400 italic">typing...</span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Shield className="w-3 h-3 inline" />
                      {c.lastMessagePreview}
                    </span>
                  )}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </aside>
  );
}
