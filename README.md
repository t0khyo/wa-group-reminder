# WhatsApp Group Reminder Bot

A smart WhatsApp bot that creates and manages meeting reminders when mentioned in group chats. Built with Node.js and Baileys.

## Features
- **Mention-Triggered** - Only responds when explicitly mentioned with @bot
- **Natural Language Parsing** - Understands dates like "tomorrow 3pm", "next Monday 9am"
- **Dual Notifications** - Sends reminders 24 hours and 1 hour before meetings
- **Reminder Management** - List, create, and cancel reminders easily
- **Persistent Storage** - SQLite database for reliable data storage

## Creating a Reminder

User: 
```
@bot
Team standup
tomorrow at 3pm
```

Bot: 
```
Reminder created ✅

📌 Team standup
🕒 Tuesday, November 25 at 03:00 PM

🔔 You'll receive reminders:
- 24 hours before
- 1 hour before
```

## Quick Start 🚀

### Prerequisites:

- Node.js 16.x or higher
- npm
- A WhatsApp account

### Installation:

1. Clone the repository

```bash
git clone https://github.com/t0khyo/wa-group-reminder.git
cd wa-group-reminder
```

2. Install dependencies

```bash
npm install
```

3. Start the bot

```bash
npm start
```

4. Scan QR code

   A QR code will appear in your terminal
Open WhatsApp on your phone
Go to `Settings → Linked Devices → Link a Device
Scan the QR code`

Done! The bot is now active in all your groups

## Usage

### Creating Reminders

**Format 1 (Recommended):**
```
@bot
Meeting title here
tomorrow at 3pm
```

**Format 2 (Single-line):**
```
@bot Meeting title tomorrow at 3pm
```

### Commands

| Command | Description |
|---------|-------------|
| `@bot list` | Show all your active reminders |
| `@bot cancel` | Cancel your most recent reminder |
| `@bot help` | Display help message |

### Examples

```
@bot
Client call with John
Monday 9am

@bot
Team standup
next Friday at 10:30am

@bot Project deadline December 25 at 11:59pm

@bot Quick sync in 2 hours
```

## 🛠️ Technology Stack

| Technology | Purpose |
|------------|---------|
| [Node.js](https://nodejs.org/) | Runtime environment |
| [Baileys](https://github.com/WhiskeySockets/Baileys) | WhatsApp Web API |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | SQLite database |
| [chrono-node](https://github.com/wanasit/chrono) | Natural language date parsing |
| [qrcode-terminal](https://github.com/gtanner/qrcode-terminal) | QR code display |

## ⚠️ Known Limitations

- Uses unofficial WhatsApp Web API (may break with WhatsApp updates)
- Bot occupies one device slot in your WhatsApp account
- Cannot read messages sent before bot joined group
- Rate limiting applies (avoid sending too many messages)

**Disclaimer**: This is not an official WhatsApp product. Use at your own risk. WhatsApp may ban accounts that use unofficial clients.
