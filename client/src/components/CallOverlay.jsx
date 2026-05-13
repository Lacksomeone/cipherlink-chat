import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, X } from "lucide-react";
import { useTheme } from "../context/ThemeContext.jsx";

export default function CallOverlay({
  callState, // "idle" | "ringing" | "incoming" | "active"
  callType,  // "audio" | "video"
  peerName,
  localStream,
  remoteStream,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleVideo,
}) {
  const { theme } = useTheme();
  const dark = theme === "dark";
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (callState !== "active") { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [callState]);

  if (callState === "idle") return null;

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center"
      >
        {/* Backdrop */}
        <div className={`absolute inset-0 ${dark ? "bg-dark-bg/95" : "bg-black/80"} backdrop-blur-xl`} />

        <div className="relative z-10 flex flex-col items-center gap-6 p-8 max-w-lg w-full">
          {/* Video areas */}
          {callType === "video" && callState === "active" && (
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black/50">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              {/* Local video PiP */}
              <div className="absolute bottom-4 right-4 w-32 aspect-video rounded-xl overflow-hidden border-2 border-white/20 shadow-xl">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover mirror"
                  style={{ transform: "scaleX(-1)" }}
                />
              </div>
            </div>
          )}

          {/* Avatar + Info */}
          {(callType === "audio" || callState !== "active") && (
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="flex flex-col items-center"
            >
              <div className={`w-28 h-28 rounded-full flex items-center justify-center text-4xl font-bold text-white ${
                callState === "incoming" ? "call-pulse bg-green-500" :
                callState === "ringing" ? "call-pulse bg-brand-500" :
                "bg-gradient-to-br from-brand-500 to-purple-600"
              }`}>
                {peerName?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <h2 className="text-2xl font-bold text-white mt-4">{peerName}</h2>
              <p className="text-white/60 text-sm mt-1">
                {callState === "incoming" && `Incoming ${callType} call...`}
                {callState === "ringing" && "Ringing..."}
                {callState === "active" && formatTime(elapsed)}
              </p>
            </motion.div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-4 mt-4">
            {callState === "incoming" && (
              <>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={onReject}
                  className="w-16 h-16 rounded-full bg-red-500 call-pulse-red flex items-center justify-center text-white shadow-lg"
                >
                  <PhoneOff className="w-7 h-7" />
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={onAccept}
                  className="w-16 h-16 rounded-full bg-green-500 call-pulse flex items-center justify-center text-white shadow-lg"
                >
                  <Phone className="w-7 h-7" />
                </motion.button>
              </>
            )}

            {(callState === "ringing" || callState === "active") && (
              <>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => { setMuted(!muted); onToggleMute?.(); }}
                  className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-colors ${muted ? "bg-red-500/80" : "bg-white/15 hover:bg-white/25"}`}
                >
                  {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </motion.button>

                {callType === "video" && (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => { setCamOff(!camOff); onToggleVideo?.(); }}
                    className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-colors ${camOff ? "bg-red-500/80" : "bg-white/15 hover:bg-white/25"}`}
                  >
                    {camOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                  </motion.button>
                )}

                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={onEnd}
                  className="w-16 h-16 rounded-full bg-red-500 call-pulse-red flex items-center justify-center text-white shadow-lg"
                >
                  <PhoneOff className="w-7 h-7" />
                </motion.button>
              </>
            )}
          </div>

          {/* E2EE badge */}
          <div className="flex items-center gap-1.5 text-white/40 text-xs mt-2">
            <X className="w-3 h-3" />
            <span>Peer-to-peer · End-to-end encrypted</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
