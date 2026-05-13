import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Check, CheckCheck, ArrowLeft, Phone, Video, MoreVertical } from "lucide-react";
import { useTheme } from "../context/ThemeContext.jsx";

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StatusIcon({ status }) {
  if (status === "seen") return <CheckCheck className="w-3.5 h-3.5 text-brand-400" />;
  if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 text-dark-muted" />;
  return <Check className="w-3.5 h-3.5 text-dark-muted" />;
}

export default function ChatWindow({
  activeConv,
  messages,
  decryptedByMsgId,
  userId,
  input,
  onInputChange,
  onSend,
  onBack,
  onCall,
  isOnline,
  isTyping,
}) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const bottomRef = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, [messages, decryptedByMsgId]);

  if (!activeConv) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center p-8 ${
        dark ? "chat-wallpaper-dark" : "chat-wallpaper-light"
      }`}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-brand-500/20 to-purple-600/20 flex items-center justify-center mx-auto mb-6 border border-brand-500/20">
            <Shield className={`w-12 h-12 ${dark ? "text-brand-400" : "text-brand-500"}`} />
          </div>
          <h2 className={`text-xl font-bold ${dark ? "text-dark-text" : "text-light-text"}`}>
            <span className="gradient-text">CipherLink</span>
          </h2>
          <p className={`text-sm mt-2 max-w-sm ${dark ? "text-dark-muted" : "text-light-muted"}`}>
            Select a conversation or start a new chat.
            <br />Messages are encrypted before leaving your browser.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col min-h-0 min-w-0 ${dark ? "chat-wallpaper-dark" : "chat-wallpaper-light"}`}>
      {/* Chat header */}
      <header className={`flex items-center gap-3 px-4 py-3 shrink-0 ${
        dark ? "glass-dark border-b border-dark-border" : "glass-light border-b border-light-border"
      }`}>
        <button
          onClick={onBack}
          className={`md:hidden p-2 -ml-1 rounded-lg ${dark ? "hover:bg-dark-hover text-dark-muted" : "hover:bg-light-hover text-light-muted"}`}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0"
          style={{ background: `linear-gradient(135deg, ${activeConv.peer?.avatarColor || "#6366f1"}, #a855f7)` }}
        >
          {activeConv.peer?.username?.charAt(0)?.toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm truncate ${dark ? "text-dark-text" : "text-light-text"}`}>
            {activeConv.peer?.username}
          </p>
          <p className={`text-xs ${
            isTyping ? "text-brand-400" :
            isOnline ? "text-green-400" :
            dark ? "text-dark-muted" : "text-light-muted"
          }`}>
            {isTyping ? "typing..." : isOnline ? "online" : "offline"}
          </p>
        </div>

        {/* Call buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onCall("audio")}
            className={`p-2.5 rounded-xl transition-colors ${dark ? "hover:bg-dark-hover text-dark-muted hover:text-green-400" : "hover:bg-light-hover text-light-muted hover:text-green-600"}`}
            title="Voice call"
          >
            <Phone className="w-5 h-5" />
          </button>
          <button
            onClick={() => onCall("video")}
            className={`p-2.5 rounded-xl transition-colors ${dark ? "hover:bg-dark-hover text-dark-muted hover:text-brand-400" : "hover:bg-light-hover text-light-muted hover:text-brand-600"}`}
            title="Video call"
          >
            <Video className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5">
        <AnimatePresence initial={false}>
          {messages.map((m) => {
            const mine = Number(m.senderId) === Number(userId);
            const body = decryptedByMsgId[m.id] ?? (mine ? "…" : "Decrypting…");
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.2 }}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%] md:max-w-[65%] px-4 py-2.5 ${
                  mine
                    ? dark ? "bubble-sent-dark" : "bubble-sent-light"
                    : dark ? "bubble-recv-dark" : "bubble-recv-light"
                }`}>
                  <p className={`text-[14px] leading-relaxed whitespace-pre-wrap break-words ${
                    dark ? "text-dark-text" : "text-light-text"
                  }`}>
                    {body}
                  </p>
                  <div className={`flex items-center gap-1 justify-end mt-1 ${
                    dark ? "text-dark-muted" : "text-light-muted"
                  }`}>
                    <span className="text-[10px]">{formatTime(m.createdAt)}</span>
                    {mine && <StatusIcon status={m.status} />}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Typing indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex justify-start"
          >
            <div className={`px-4 py-3 rounded-2xl ${dark ? "bubble-recv-dark" : "bubble-recv-light"}`}>
              <div className="flex items-center gap-1.5">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <footer className={`p-3 shrink-0 border-t ${
        dark ? "glass-dark border-dark-border" : "glass-light border-light-border"
      }`}>
        <div className="flex gap-2 items-end">
          <textarea
            rows={1}
            className={`flex-1 resize-none rounded-xl px-4 py-3 text-sm outline-none max-h-32 transition-all ${
              dark
                ? "bg-dark-bg/60 border border-dark-border text-dark-text placeholder-dark-muted focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20"
                : "bg-gray-50 border border-light-border text-light-text placeholder-light-muted focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20"
            }`}
            placeholder="Type a message..."
            value={input}
            onChange={onInputChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onSend}
            disabled={!input.trim()}
            className="px-5 py-3 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-brand-500 to-purple-600 shadow-md shadow-brand-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Send
          </motion.button>
        </div>
      </footer>
    </div>
  );
}
