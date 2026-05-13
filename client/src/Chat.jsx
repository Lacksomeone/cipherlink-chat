import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { io } from "socket.io-client";
import { X, UserPlus, Shield } from "lucide-react";
import { useTheme } from "./context/ThemeContext.jsx";
import {
  loadPrivateKeyJwk, importPrivateKey, importPublicKeyFromJwk,
  encryptMessageEnvelope, decryptMessageEnvelope,
} from "./crypto.js";
import { WebRTCManager } from "./webrtc.js";
import Sidebar from "./components/Sidebar.jsx";
import ChatWindow from "./components/ChatWindow.jsx";
import CallOverlay from "./components/CallOverlay.jsx";

export default function Chat({ token, user, onLogout }) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  // Core state
  const [privateKey, setPrivateKey] = useState(null);
  const [noLocalKey, setNoLocalKey] = useState(false);
  const [myPublicJwk, setMyPublicJwk] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messagesByConv, setMessagesByConv] = useState({});
  const [decryptedByMsgId, setDecryptedByMsgId] = useState({});
  const [peerKeys, setPeerKeys] = useState({});
  const [input, setInput] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [mobilePanel, setMobilePanel] = useState("list");

  // New chat dialog
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatUsername, setNewChatUsername] = useState("");
  const [newChatError, setNewChatError] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Presence & typing
  const [onlineUsers, setOnlineUsers] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const typingTimerRef = useRef({});

  // Call state
  const [callState, setCallState] = useState("idle");
  const [callType, setCallType] = useState("audio");
  const [callPeer, setCallPeer] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const webrtcRef = useRef(null);
  const pendingCallRef = useRef(null);

  const socketRef = useRef(null);
  const decryptedRef = useRef({});

  useEffect(() => { decryptedRef.current = decryptedByMsgId; }, [decryptedByMsgId]);

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeId),
    [conversations, activeId]
  );

  // ─── Load private key ───
  useEffect(() => {
    (async () => {
      const jwk = loadPrivateKeyJwk();
      if (!jwk) { setNoLocalKey(true); return; }
      try { setPrivateKey(await importPrivateKey(jwk)); }
      catch { setNoLocalKey(true); }
    })();
  }, []);

  // ─── Fetch me ───
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { onLogout(); return; }
      const me = await res.json();
      setMyPublicJwk(me.publicKey);
    })();
  }, [token, onLogout]);

  // ─── Fetch conversations ───
  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/conversations", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    setConversations(await res.json());
  }, [token]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // ─── Socket.io ───
  useEffect(() => {
    const s = io({ path: "/socket.io", auth: { token }, transports: ["websocket", "polling"] });
    socketRef.current = s;

    s.on("connect", () => setSocketConnected(true));
    s.on("disconnect", () => setSocketConnected(false));

    // Messages
    s.on("message", (payload) => {
      const { id, conversationId, senderId, senderUsername, peerId, peerUsername, envelope, createdAt, status } = payload;
      setMessagesByConv((prev) => {
        const arr = prev[conversationId] || [];
        if (arr.some((m) => m.id === id)) return prev;
        return { ...prev, [conversationId]: [...arr, { id, senderId, senderUsername, envelope, createdAt, status }] };
      });
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conversationId);
        if (!exists) {
          return [{ id: conversationId, peer: { id: peerId, username: peerUsername || "Unknown" }, lastMessagePreview: "[Encrypted]", lastAt: createdAt, lastSenderId: senderId }, ...prev];
        }
        const next = prev.map((c) => c.id === conversationId ? { ...c, lastAt: createdAt, lastSenderId: senderId } : c);
        return next.sort((a, b) => (b.lastAt || "").localeCompare(a.lastAt || ""));
      });
    });

    // Online status
    s.on("user_online", ({ userId, online }) => {
      setOnlineUsers((p) => ({ ...p, [userId]: online }));
    });

    // Typing
    s.on("typing", ({ fromUserId, isTyping }) => {
      setTypingUsers((p) => ({ ...p, [fromUserId]: isTyping }));
      if (isTyping) {
        if (typingTimerRef.current[fromUserId]) clearTimeout(typingTimerRef.current[fromUserId]);
        typingTimerRef.current[fromUserId] = setTimeout(() => {
          setTypingUsers((p) => ({ ...p, [fromUserId]: false }));
        }, 3000);
      }
    });

    // Seen receipts
    s.on("messages_seen", ({ conversationId, messageIds }) => {
      setMessagesByConv((prev) => {
        const arr = prev[conversationId];
        if (!arr) return prev;
        return {
          ...prev,
          [conversationId]: arr.map((m) => messageIds.includes(m.id) ? { ...m, status: "seen" } : m),
        };
      });
    });

    // WebRTC signaling
    s.on("call:incoming", ({ fromUserId, fromUsername, callType: ct, offer }) => {
      pendingCallRef.current = { fromUserId, fromUsername, offer, callType: ct };
      setCallPeer({ id: fromUserId, username: fromUsername });
      setCallType(ct);
      setCallState("incoming");
    });
    s.on("call:answered", async ({ fromUserId, answer }) => {
      if (webrtcRef.current) {
        await webrtcRef.current.handleAnswer(answer);
        setCallState("active");
      }
    });
    s.on("call:ice-candidate", async ({ fromUserId, candidate }) => {
      if (webrtcRef.current) await webrtcRef.current.handleIceCandidate(candidate);
    });
    s.on("call:rejected", () => { cleanupCall(); });
    s.on("call:ended", () => { cleanupCall(); });

    return () => { s.removeAllListeners(); s.close(); };
  }, [token, user.id]);

  // ─── Decrypt messages when active chat changes ───
  useEffect(() => {
    if (!activeId || !privateKey) return;
    const msgs = messagesByConv[activeId];
    if (!msgs?.length) return;
    let cancelled = false;
    (async () => {
      for (const m of msgs) {
        if (cancelled) break;
        if (decryptedRef.current[m.id] !== undefined) continue;
        let text;
        try { text = await decryptMessageEnvelope(m.envelope, m.senderId, user.id, privateKey); }
        catch { text = "[Cannot decrypt]"; }
        setDecryptedByMsgId((prev) => prev[m.id] !== undefined ? prev : { ...prev, [m.id]: text });
      }
    })();
    return () => { cancelled = true; };
  }, [activeId, messagesByConv, privateKey, user.id]);

  // ─── Mark as seen ───
  useEffect(() => {
    if (!activeId || !socketRef.current) return;
    const msgs = messagesByConv[activeId] || [];
    const unseen = msgs.filter((m) => m.senderId !== user.id && m.status !== "seen").map((m) => m.id);
    if (unseen.length > 0) {
      socketRef.current.emit("mark_seen", { conversationId: activeId, messageIds: unseen });
    }
  }, [activeId, messagesByConv, user.id]);

  // ─── Peer key lookup ───
  const ensurePeerKey = useCallback(async (username) => {
    const res = await fetch(`/api/users/lookup?username=${encodeURIComponent(username)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("User not found");
    const data = await res.json();
    const pub = await importPublicKeyFromJwk(data.publicKey);
    setPeerKeys((p) => ({ ...p, [Number(data.id)]: pub }));
    return { ...data, id: Number(data.id) };
  }, [token]);

  // ─── Load messages ───
  const loadMessages = useCallback(async (conversationId) => {
    if (String(conversationId).startsWith("pending-")) return;
    const res = await fetch(`/api/conversations/${conversationId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const msgs = await res.json();
    setMessagesByConv((prev) => {
      const existing = prev[conversationId] || [];
      const byId = new Map(existing.map((m) => [m.id, m]));
      for (const m of msgs) byId.set(m.id, m);
      return { ...prev, [conversationId]: Array.from(byId.values()).sort((a, b) => a.id - b.id) };
    });
  }, [token]);

  // ─── Open conversation ───
  const openConversation = async (conv) => {
    setActiveId(conv.id);
    setMobilePanel("chat");
    if (!peerKeys[conv.peer.id]) {
      try { await ensurePeerKey(conv.peer.username); } catch {}
    }
    await loadMessages(conv.id);
  };

  // ─── Send message ───
  const handleSend = async () => {
    const text = input.trim();
    if (!text || !privateKey || !myPublicJwk) return;
    const isPending = activeId?.toString().startsWith("pending-");
    const peerId = activeConv?.peer?.id;
    const recipientPub = peerKeys[peerId];
    if (!recipientPub) { alert("Missing recipient key. Re-open chat."); return; }

    const myPub = await importPublicKeyFromJwk(myPublicJwk);
    const envelope = await encryptMessageEnvelope(text, myPub, recipientPub);
    setInput("");
    socketRef.current.emit("typing", { toUserId: peerId, isTyping: false });

    socketRef.current.emit("send_message", { toUserId: peerId, envelope }, (ack) => {
      if (!ack?.ok) { alert(ack?.error || "Send failed"); return; }
      if (isPending) {
        const realId = ack.conversationId;
        setConversations((prev) =>
          prev.filter((c) => c.id !== activeId).concat([{
            id: realId, peer: activeConv.peer, lastMessagePreview: "[Encrypted]",
            lastAt: ack.createdAt, lastSenderId: user.id,
          }])
        );
        setMessagesByConv((prev) => {
          const next = { ...prev }; delete next[activeId];
          next[realId] = [{ id: ack.id, senderId: user.id, envelope: ack.envelope, createdAt: ack.createdAt, status: ack.status }];
          return next;
        });
        setActiveId(realId);
      }
      fetchConversations();
    });
  };

  // ─── Typing indicator emit ───
  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (activeConv?.peer?.id && socketRef.current) {
      socketRef.current.emit("typing", { toUserId: activeConv.peer.id, isTyping: true });
      if (typingTimerRef.current._self) clearTimeout(typingTimerRef.current._self);
      typingTimerRef.current._self = setTimeout(() => {
        socketRef.current?.emit("typing", { toUserId: activeConv.peer.id, isTyping: false });
      }, 2000);
    }
  };

  // ─── Fetch users for new chat ───
  const fetchSearchUsers = useCallback(async (query = "") => {
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setSearchResults(await res.json());
    } catch {} finally { setSearchLoading(false); }
  }, [token]);

  // Load users when dialog opens
  useEffect(() => {
    if (newChatOpen) fetchSearchUsers("");
  }, [newChatOpen, fetchSearchUsers]);

  // Search users as user types
  useEffect(() => {
    if (!newChatOpen) return;
    const timer = setTimeout(() => fetchSearchUsers(newChatUsername), 300);
    return () => clearTimeout(timer);
  }, [newChatUsername, newChatOpen, fetchSearchUsers]);

  const startChatWithUser = async (peer) => {
    setNewChatError("");
    try {
      // Ensure we have peer's public key
      const peerData = await ensurePeerKey(peer.username);
      const existing = conversations.find((c) => c.peer.id === peerData.id);
      if (existing) {
        setNewChatOpen(false); setNewChatUsername(""); setSearchResults([]);
        openConversation(existing);
        return;
      }
      const optimistic = {
        id: `pending-${peerData.id}`,
        peer: { id: peerData.id, username: peerData.username, avatarColor: peerData.avatarColor || peer.avatarColor },
        lastMessagePreview: "[Encrypted]", lastAt: null, lastSenderId: null,
      };
      setConversations((prev) => [optimistic, ...prev.filter((c) => c.id !== optimistic.id)]);
      setActiveId(optimistic.id);
      setMessagesByConv((prev) => ({ ...prev, [optimistic.id]: [] }));
      setNewChatOpen(false); setNewChatUsername(""); setSearchResults([]); setMobilePanel("chat");
    } catch {
      setNewChatError("Could not start chat with this user.");
    }
  };

  const startNewChat = async (e) => {
    e.preventDefault();
    const u = newChatUsername.trim();
    if (!u) return;
    // Try to find the user from search results first
    const match = searchResults.find((r) => r.username.toLowerCase() === u.toLowerCase());
    if (match) {
      startChatWithUser(match);
    } else {
      // Direct username lookup
      try {
        const peer = await ensurePeerKey(u);
        startChatWithUser(peer);
      } catch {
        setNewChatError("User not found. Check the username and try again.");
      }
    }
  };

  // ─── Call functions ───
  const initiateCall = async (type) => {
    if (!activeConv || !socketRef.current) return;
    const mgr = new WebRTCManager(socketRef.current);
    webrtcRef.current = mgr;
    mgr.onRemoteStream = (stream) => setRemoteStream(stream);
    mgr.onCallEnded = () => cleanupCall();
    setCallPeer(activeConv.peer);
    setCallType(type);
    setCallState("ringing");
    try {
      const { localStream: ls } = await mgr.initiateCall(activeConv.peer.id, type);
      setLocalStream(ls);
    } catch (err) {
      alert("Could not access media: " + err.message);
      cleanupCall();
    }
  };

  const acceptCall = async () => {
    const pending = pendingCallRef.current;
    if (!pending || !socketRef.current) return;
    const mgr = new WebRTCManager(socketRef.current);
    webrtcRef.current = mgr;
    mgr.onRemoteStream = (stream) => setRemoteStream(stream);
    mgr.onCallEnded = () => cleanupCall();
    try {
      const { localStream: ls } = await mgr.acceptCall(pending.fromUserId, pending.offer, pending.callType);
      setLocalStream(ls);
      setCallState("active");
    } catch (err) {
      alert("Could not access media: " + err.message);
      cleanupCall();
    }
  };

  const rejectCall = () => {
    const pending = pendingCallRef.current;
    if (pending && socketRef.current) {
      const mgr = new WebRTCManager(socketRef.current);
      mgr.rejectCall(pending.fromUserId);
    }
    cleanupCall();
  };

  const endCall = () => {
    const peerId = callPeer?.id;
    if (webrtcRef.current && peerId) webrtcRef.current.endCall(peerId);
    else cleanupCall();
  };

  const cleanupCall = () => {
    if (webrtcRef.current) { webrtcRef.current.cleanup(); webrtcRef.current = null; }
    setCallState("idle"); setCallPeer(null); setLocalStream(null); setRemoteStream(null);
    pendingCallRef.current = null;
  };

  const activeMessages = activeId ? messagesByConv[activeId] || [] : [];

  return (
    <div className={`h-full flex flex-col md:flex-row ${dark ? "bg-dark-bg" : "bg-light-bg"}`}>
      {/* No-key warning */}
      {noLocalKey && (
        <div className="bg-amber-500/10 text-amber-400 text-xs px-4 py-2 text-center border-b border-amber-500/20 absolute top-0 left-0 right-0 z-50">
          ⚠ No private key in this browser. Register or use the same browser.
        </div>
      )}

      {/* Sidebar */}
      <div className={`${mobilePanel === "list" ? "flex" : "hidden"} md:flex h-full`}>
        <Sidebar
          user={user}
          conversations={conversations}
          activeId={activeId}
          socketConnected={socketConnected}
          onOpenConversation={openConversation}
          onNewChat={() => setNewChatOpen(true)}
          onLogout={onLogout}
          onlineUsers={onlineUsers}
          typingUsers={typingUsers}
        />
      </div>

      {/* Chat Window */}
      <div className={`${mobilePanel === "chat" ? "flex" : "hidden"} md:flex flex-1 min-w-0 h-full`}>
        <ChatWindow
          activeConv={activeConv}
          messages={activeMessages}
          decryptedByMsgId={decryptedByMsgId}
          userId={user.id}
          input={input}
          onInputChange={handleInputChange}
          onSend={handleSend}
          onBack={() => setMobilePanel("list")}
          onCall={initiateCall}
          isOnline={activeConv ? onlineUsers[activeConv.peer?.id] : false}
          isTyping={activeConv ? typingUsers[activeConv.peer?.id] : false}
        />
      </div>

      {/* New Chat Modal */}
      <AnimatePresence>
        {newChatOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className={`w-full max-w-md rounded-2xl p-6 max-h-[80vh] flex flex-col ${dark ? "glass-dark glow-border" : "glass-light glow-border"}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <UserPlus className={`w-5 h-5 ${dark ? "text-brand-400" : "text-brand-500"}`} />
                  <h2 className={`text-lg font-semibold ${dark ? "text-dark-text" : "text-light-text"}`}>New Chat</h2>
                </div>
                <button onClick={() => { setNewChatOpen(false); setNewChatError(""); setSearchResults([]); }}
                  className={`p-1.5 rounded-lg ${dark ? "hover:bg-dark-hover text-dark-muted" : "hover:bg-light-hover text-light-muted"}`}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search input */}
              <form onSubmit={startNewChat} className="mb-3">
                <input
                  className={`w-full px-4 py-3 rounded-xl text-sm outline-none transition-all ${
                    dark
                      ? "bg-dark-bg/60 border border-dark-border text-dark-text placeholder-dark-muted focus:border-brand-500"
                      : "bg-gray-50 border border-light-border text-light-text placeholder-light-muted focus:border-brand-500"
                  }`}
                  placeholder="Search by username..."
                  value={newChatUsername}
                  onChange={(e) => setNewChatUsername(e.target.value)}
                  autoFocus
                />
              </form>

              {newChatError && (
                <p className="text-xs text-red-400 mb-2">{newChatError}</p>
              )}

              {/* User List */}
              <div className="flex-1 overflow-y-auto -mx-2 min-h-0">
                {searchLoading && (
                  <div className="flex justify-center py-6">
                    <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                  </div>
                )}

                {!searchLoading && searchResults.length === 0 && (
                  <div className="text-center py-8">
                    <p className={`text-sm ${dark ? "text-dark-muted" : "text-light-muted"}`}>
                      {newChatUsername.trim() ? "No users found" : "No other users registered yet"}
                    </p>
                    <p className={`text-xs mt-1 ${dark ? "text-dark-muted/60" : "text-light-muted/60"}`}>
                      Share the link so friends can register!
                    </p>
                  </div>
                )}

                {!searchLoading && searchResults.map((u, i) => (
                  <motion.button
                    key={u.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => startChatWithUser(u)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${
                      dark ? "hover:bg-dark-hover" : "hover:bg-light-hover"
                    }`}
                  >
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white font-medium text-sm shrink-0 shadow-sm"
                      style={{ background: `linear-gradient(135deg, ${u.avatarColor || "#6366f1"}, #a855f7)` }}
                    >
                      {u.username?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm truncate ${dark ? "text-dark-text" : "text-light-text"}`}>
                        {u.username}
                      </p>
                      <p className={`text-xs ${dark ? "text-dark-muted" : "text-light-muted"}`}>
                        Tap to start encrypted chat
                      </p>
                    </div>
                    <div className="text-brand-400 shrink-0">
                      <Shield className="w-4 h-4" />
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Call Overlay */}
      <CallOverlay
        callState={callState}
        callType={callType}
        peerName={callPeer?.username}
        localStream={localStream}
        remoteStream={remoteStream}
        onAccept={acceptCall}
        onReject={rejectCall}
        onEnd={endCall}
        onToggleMute={() => webrtcRef.current?.toggleMute()}
        onToggleVideo={() => webrtcRef.current?.toggleVideo()}
      />
    </div>
  );
}
