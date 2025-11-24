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
  Go to Settings → Linked Devices → Link a Device
  Scan the QR code

Done! The bot is now active in all your groups


