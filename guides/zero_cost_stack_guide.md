# 🆓 The 100% Zero-Cost Hospital Automation Stack
*Complete Guide to Running, Demoing, and Delivering with ₹0 Out-of-Pocket Expense*

This guide replaces every paid component in the blueprint with a **100% free alternative**. Even if a setup procedure requires slightly more technical configuration, **you will not spend a single rupee**.

---

## 💰 The Zero-Cost Replacement Matrix

| Layer / Component | Paid Blueprint Default | 100% Free Alternative | Cost | Complexity |
| :--- | :--- | :--- | :---: | :---: |
| **AI / LLM Engine** | Claude 3.5 API (Prepaid credits) | **1. Google Gemini 1.5/2.0 Flash (Free Tier)**<br>**2. Ollama Local LLM (Llama 3.2 on PC)**<br>**3. Built-in Deterministic Engine** | **₹0** | Low to Medium |
| **WhatsApp Messaging** | Wati / AiSensy (₹1,500–₹2,500/mo) | **1. Meta Cloud API (1,000 Free Chats/Mo)**<br>**2. WhatsApp Web QR Automation (Baileys/WPP)**<br>**3. Telegram Bot API (Unlimited Free)** | **₹0** | Medium to High |
| **Workflow Engine** | Make.com Pro ($19/mo) | **1. Built-in Node.js Engine (Included)**<br>**2. Self-Hosted n8n (Community Edition)** | **₹0** | Low |
| **Database & Calendar** | Airtable ($24/mo) | **Native SQLite (`hospital.db` - Included)** | **₹0** | Zero |
| **Screen Recording** | Loom Pro ($12.50/mo) | **OBS Studio / Windows Snipping Tool (Win+Alt+R)** | **₹0** | Zero |
| **Clinic Prospecting** | Apollo / ZoomInfo ($99/mo) | **Google Maps + Practo Manual Search** | **₹0** | Low |
| **Hosting & Webhooks** | Paid AWS / VPS | **1. Localhost + Cloudflare Tunnel / Ngrok Free**<br>**2. Oracle Cloud Always-Free Tier (4 OCPU, 24GB RAM)** | **₹0** | Medium |

---

## 🤖 1. AI Layer: Three 100% Free Options

### Option A: Google Gemini API (Recommended — Cloud Free Tier)
* **What is it:** Google AI Studio offers Gemini 1.5 Flash and Gemini 2.0 Flash **100% free forever** for development (up to 15 requests per minute, 1,500 requests per day) without requiring any credit card.
* **How to get it:**
  1. Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
  2. Log in with your standard Google / Gmail account.
  3. Click **"Create API key"** (Instant, free, no payment details asked).
  4. Paste into your `.env`:
     ```ini
     GEMINI_API_KEY=AIzaSy...
     AI_PROVIDER=GEMINI
     ```

### Option B: Ollama (100% Offline, Zero Internet Quota, Infinite Tokens)
* **What is it:** Runs open-source models (Llama 3.2 3B or Mistral) locally on your PC.
* **How to set up:**
  1. Download Ollama from [https://ollama.com/download/windows](https://ollama.com/download/windows)
  2. Open terminal and run:
     ```bash
     ollama run llama3.2
     ```
  3. Configure `.env`:
     ```ini
     AI_PROVIDER=OLLAMA
     OLLAMA_MODEL=llama3.2
     ```
* **Cost:** **₹0 forever**. No rate limits, no bans, completely private.

### Option C: Built-in Deterministic Engine (Already Active in Codebase)
* **What is it:** Our custom rule-based classification and templating engine written in `src/ai/claude.js`.
* **Cost:** **₹0**. Requires zero API keys or external downloads.

---

## 📲 2. WhatsApp Layer: Two 100% Free Approaches

### Option A: Meta Cloud API Free Tier (Official & Compliant)
* Meta gives **1,000 free service/customer-initiated conversations every single calendar month** to every WhatsApp Business account.
* If a patient initiates an inquiry (via your website or click-to-WhatsApp ad), replying, booking, reminding, and recovering them within that 24-hour window **costs ₹0.00**.

### Option B: Free WhatsApp Web QR Bridge (Un-Official / Hack for Demos)
* Using open-source libraries like `whatsapp-web.js` or `@whiskeysockets/baileys`:
  1. It launches a headless browser.
  2. Generates a QR code in the terminal.
  3. You scan the QR code with WhatsApp on your phone (Linked Devices).
  4. It can send real messages directly from your existing mobile number for **₹0** without any business verification or per-message fees!

---

## 🌐 3. Public Webhook Exposing for Free (Cloudflare Tunnels)

To receive webhooks from Meta WhatsApp or an online form into your local machine for free:
* **Tool:** Cloudflare Tunnel (`cloudflared`)
* **How it works:**
  1. Download `cloudflared`:
     ```bash
     winget install Cloudflare.cloudflared
     ```
  2. Run:
     ```bash
     cloudflared tunnel --url http://localhost:3000
     ```
  3. Cloudflare gives you a free, public HTTPS URL (e.g., `https://random-subdomain.trycloudflare.com`) with valid SSL, zero port-forwarding, and 100% uptime for ₹0.

---

## 💼 4. The Golden Agency Rule: Who Pays for Production?

When you sign a real hospital client:
> **The hospital pays their own operating expenses!**
* You charge **₹50,000 for your implementation service** (this goes 100% into your pocket).
* The client provides their own Meta Business account and cloud hosting.
* For you to build, test, demonstrate, pitch, and sell: **YOUR TOTAL COST IS ₹0**.
