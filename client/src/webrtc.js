/**
 * CipherLink — WebRTC P2P Call Manager
 * Handles audio/video calls with ICE negotiation via Socket.io signaling.
 * All media goes directly P2P — server only relays signaling data.
 */

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

export class WebRTCManager {
  constructor(socket) {
    this.socket = socket;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.onRemoteStream = null;
    this.onCallEnded = null;
    this.onConnectionStateChange = null;
    this.iceCandidateQueue = [];
  }

  /**
   * Initiate a call to another user.
   * @param {number} toUserId
   * @param {"audio"|"video"} callType
   * @returns {{ localStream: MediaStream }}
   */
  async initiateCall(toUserId, callType) {
    await this._setupLocalStream(callType);
    this._createPeerConnection(toUserId);

    // Add local tracks to connection
    this.localStream.getTracks().forEach((track) => {
      this.peerConnection.addTrack(track, this.localStream);
    });

    // Create and send offer
    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: callType === "video",
    });
    await this.peerConnection.setLocalDescription(offer);

    this.socket.emit("call:initiate", {
      toUserId,
      callType,
      offer: {
        type: offer.type,
        sdp: offer.sdp,
      },
    });

    return { localStream: this.localStream };
  }

  /**
   * Accept an incoming call.
   * @param {number} fromUserId
   * @param {RTCSessionDescriptionInit} offer
   * @param {"audio"|"video"} callType
   * @returns {{ localStream: MediaStream }}
   */
  async acceptCall(fromUserId, offer, callType) {
    await this._setupLocalStream(callType);
    this._createPeerConnection(fromUserId);

    // Add local tracks
    this.localStream.getTracks().forEach((track) => {
      this.peerConnection.addTrack(track, this.localStream);
    });

    // Set remote description (the offer)
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(offer)
    );

    // Process queued ICE candidates
    for (const candidate of this.iceCandidateQueue) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn("Failed to add queued ICE candidate:", e);
      }
    }
    this.iceCandidateQueue = [];

    // Create and send answer
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.socket.emit("call:answer", {
      toUserId: fromUserId,
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
    });

    return { localStream: this.localStream };
  }

  /**
   * Handle received answer (caller side).
   * @param {RTCSessionDescriptionInit} answer
   */
  async handleAnswer(answer) {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );

    // Process queued ICE candidates
    for (const candidate of this.iceCandidateQueue) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn("Failed to add queued ICE candidate:", e);
      }
    }
    this.iceCandidateQueue = [];
  }

  /**
   * Handle received ICE candidate.
   * @param {RTCIceCandidateInit} candidate
   */
  async handleIceCandidate(candidate) {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      // Queue if remote description not yet set
      this.iceCandidateQueue.push(candidate);
      return;
    }
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn("Failed to add ICE candidate:", e);
    }
  }

  /**
   * Reject an incoming call.
   * @param {number} fromUserId
   */
  rejectCall(fromUserId) {
    this.socket.emit("call:reject", { toUserId: fromUserId });
    this.cleanup();
  }

  /**
   * End active call.
   * @param {number} toUserId
   */
  endCall(toUserId) {
    this.socket.emit("call:end", { toUserId });
    this.cleanup();
  }

  /**
   * Toggle microphone.
   */
  toggleMute() {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled; // returns true if muted
    }
    return false;
  }

  /**
   * Toggle camera.
   */
  toggleVideo() {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled; // returns true if camera off
    }
    return false;
  }

  /**
   * Clean up all connections and streams.
   */
  cleanup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteStream = null;
    this.iceCandidateQueue = [];
    if (this.onCallEnded) this.onCallEnded();
  }

  /* ─── Private ─── */

  async _setupLocalStream(callType) {
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: callType === "video"
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
        : false,
    };
    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
  }

  _createPeerConnection(remoteUserId) {
    this.peerConnection = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    });

    this.remoteStream = new MediaStream();

    // Handle remote tracks
    this.peerConnection.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        this.remoteStream.addTrack(track);
      });
      if (this.onRemoteStream) {
        this.onRemoteStream(this.remoteStream);
      }
    };

    // Send ICE candidates to remote
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit("call:ice-candidate", {
          toUserId: remoteUserId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Track connection state
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      if (this.onConnectionStateChange) this.onConnectionStateChange(state);
      if (state === "disconnected" || state === "failed" || state === "closed") {
        this.cleanup();
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      if (state === "disconnected" || state === "failed") {
        this.cleanup();
      }
    };
  }
}
