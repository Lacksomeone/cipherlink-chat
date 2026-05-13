# 🔐 CipherLink — End-to-End Encrypted Chat

<p align="center">
  <img src="https://img.shields.io/badge/E2EE-AES--256--GCM-green?style=for-the-badge" />
  <img src="https://img.shields.io/badge/WebRTC-P2P%20Calls-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge" />
</p>

> **Your messages. Your keys. Your privacy.**
> A production-ready, self-hosted encrypted messaging platform with P2P video/audio calling.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔒 **E2EE Messaging** | AES-256-GCM encryption with RSA-OAEP key wrapping. Server only stores ciphertext. |
| 📹 **Video & Audio Calls** | WebRTC peer-to-peer calls. Media never touches the server. |
| 🎨 **Dark/Light Glassmorphism** | Stunning modern UI with animated gradients and smooth transitions. |
| ⌨️ **Typing Indicators** | Real-time "typing..." status via Socket.io. |
| ✅ **Read Receipts** | Sent → Delivered → Seen status with checkmark icons. |
| 🟢 **Online Status** | Real-time online/offline presence. |
| 📱 **Mobile Responsive** | Full WhatsApp-style responsive layout. |
| 🐳 **One-Click Deploy** | Docker Compose + Render/Railway auto-deploy. |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (Client)                                    │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │  React + TW   │  │  WebRTC     │  │ AES-GCM    │ │
│  │  Framer Motion│  │  P2P Media  │  │ RSA-OAEP   │ │
│  └──────────────┘  └──────┬──────┘  └──────┬─────┘ │
│                           │ ICE             │ E2EE   │
└───────────────────────────┼─────────────────┼───────┘
                            │ Signaling       │ Ciphertext
┌───────────────────────────┼─────────────────┼───────┐
│  Server (Node.js)         │                 │       │
│  ┌──────────────┐  ┌──────┴──────┐  ┌──────┴─────┐ │
│  │  Express API  │  │  Socket.io  │  │  SQLite DB │ │
│  │  Auth/JWT     │  │  Signaling  │  │  Encrypted │ │
│  └──────────────┘  └─────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Key Design Principle:** The server is a zero-knowledge relay. It stores encrypted blobs and public keys only. Private keys live exclusively in the user's browser (`localStorage`).

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 22+** (uses built-in `node:sqlite`)
- **npm** or **yarn**

### 1. Clone & Install
```bash
git clone https://github.com/YOUR_USERNAME/cipherlink-chat.git
cd cipherlink-chat
cp .env.example .env
npm install
```

### 2. Run Development Server
```bash
npm run dev
```
This starts both the backend (port 3001) and Vite dev server (port 5173) concurrently.

### 3. Open in Browser
Navigate to `http://localhost:5173`

---

## 🐳 Docker Deployment

```bash
# One-click start
docker-compose up -d

# View logs
docker-compose logs -f
```

---

## ☁️ Cloud Deployment

### Render.com
1. Push to GitHub
2. Connect repo on [render.com](https://render.com)
3. It auto-detects `render.yaml` — click Deploy

### Railway.app
1. Push to GitHub
2. Go to [railway.app](https://railway.app)
3. Connect GitHub repo → Deploy
4. Set `JWT_SECRET` in environment variables

### Auto-Deploy (CI/CD)
The included `.github/workflows/deploy.yml` auto-deploys on every push to `main`.

**Required GitHub Secrets:**
| Secret | Description |
|---|---|
| `RENDER_SERVICE_ID` | Your Render service ID |
| `RENDER_API_KEY` | Render API key |
| `RAILWAY_TOKEN` | Railway project token |
| `RAILWAY_SERVICE_ID` | Railway service name |

---

## 📱 Google Play Store — ASO Content

### App Name
**CipherLink — Secure E2EE Chat & Calls**

### Short Description (80 chars)
Private encrypted messaging with video calls. Your keys, your privacy.

### Full Description (4000 chars)
🔐 **CipherLink** is the most secure messaging app you can self-host. Every message is encrypted with military-grade AES-256-GCM encryption before it ever leaves your phone. Your encryption keys are generated and stored only on your device — not even our servers can read your messages.

**Why CipherLink?**
✅ True End-to-End Encryption — Messages encrypted with AES-256-GCM + RSA-OAEP key wrapping
✅ P2P Video & Audio Calls — WebRTC direct connections, zero server involvement
✅ Self-Hosted — Run your own server, own your data completely
✅ Open Source — Fully auditable code, no hidden backdoors
✅ Modern UI — Stunning glassmorphism design with dark/light themes
✅ Real-time — Instant messaging with typing indicators and read receipts
✅ Privacy First — Zero-knowledge architecture, server stores only ciphertext

**How it works:**
When you register, a unique RSA-2048 keypair is generated in your browser. Only the public key is shared with the server. When you send a message, it's encrypted locally with a fresh AES-256 key, which is then wrapped with the recipient's RSA public key. The server only ever sees the encrypted blob — it cannot decrypt your conversations.

**Calls are truly private:**
Voice and video calls use WebRTC for direct peer-to-peer connections. Your audio and video stream directly between devices without passing through any server. Combined with ICE/STUN for NAT traversal, this ensures the lowest latency and highest privacy.

### Keywords
encrypted chat, E2EE messaging, secure video calls, private messaging, end-to-end encryption, self-hosted chat, WebRTC calls, privacy app, secure communication, encrypted calls

### Category
Communication

### Content Rating
Everyone

---

## 🛡️ Security Model

| Layer | Technology | Purpose |
|---|---|---|
| Message Encryption | AES-256-GCM | Encrypts message content |
| Key Exchange | RSA-OAEP (2048-bit) | Wraps per-message AES keys |
| Authentication | JWT (7-day expiry) | Session management |
| Password Storage | bcrypt (10 rounds) | Server-side password hashing |
| Transport | WSS/HTTPS | Wire encryption |
| Media | WebRTC DTLS-SRTP | P2P encrypted calls |

---

## 📁 Project Structure

```
cipherlink-chat/
├── server.js                    # Express + Socket.io server
├── lib/
│   └── getOrCreateConversation.js
├── client/
│   ├── src/
│   │   ├── App.jsx              # Auth screen
│   │   ├── Chat.jsx             # Main orchestrator
│   │   ├── crypto.js            # E2EE module
│   │   ├── webrtc.js            # WebRTC P2P manager
│   │   ├── context/
│   │   │   └── ThemeContext.jsx  # Dark/Light theme
│   │   └── components/
│   │       ├── Sidebar.jsx      # Chat list
│   │       ├── ChatWindow.jsx   # Messages + input
│   │       └── CallOverlay.jsx  # Video/audio call UI
│   ├── tailwind.config.js
│   └── vite.config.js
├── docker-compose.yml
├── Dockerfile
├── render.yaml
├── .github/workflows/deploy.yml
├── .env.example
└── README.md
```

---

## 📝 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | No | `production` or `development` |
| `PORT` | No | Server port (default: 3001) |
| `JWT_SECRET` | **Yes (prod)** | Secret for JWT signing |
| `SQLITE_PATH` | No | Path to SQLite database |
| `CLIENT_ORIGIN` | No | CORS origin for frontend |

---

## 📄 License

MIT © 2025 CipherLink Contributors
