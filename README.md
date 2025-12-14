# WhatsApp Group Reminder Bot

A smart WhatsApp bot that creates and manages meeting reminders when mentioned in group chats. Built with Node.js and Baileys.

## Features

- **Mention-Triggered** - Only responds when explicitly mentioned with @bot
- **Natural Language Parsing** - Understands dates like "tomorrow 3pm", "next Monday 9am"
- **Multi-Stage Notifications** - Sends reminders 24h, 1h, and 30m before meetings
- **Reminder Management** - List, create, and cancel reminders easily
- **Persistent Storage** - PostgreSQL database for reliable data storage
- **Production-Ready Logging** - Structured JSON logging with automatic rotation
- **Task Management** - Create and track tasks with assignments
- **AI-Powered** - Optional AI assistant integration for enhanced responses

## Creating a Reminder

User:

```txt
@bot
Team standup
tomorrow at 3pm
```

Bot:

```txt
Reminder created ✅

📌 Team standup
🕒 Tuesday, November 25 at 03:00 PM

🔔 You'll receive reminders:
- 24 hours before
- 1 hour before
- 30 minutes before
```

## Quick Start 🚀

### Prerequisites

- Node.js 18.x or higher
- npm or yarn
- PostgreSQL 14+ or SQLite (development)
- A WhatsApp account

### Installation

1. Clone the repository

```bash
git clone https://github.com/t0khyo/wa-group-reminder.git
cd wa-group-reminder
```

2. Install dependencies

```bash
npm install
```

3. Set up environment variables

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Set up the database

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy
```

5. Build the project

```bash
npm run build
```

6. Start the bot

```bash
npm start
```

7. Scan QR code

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

| Command          | Description                      |
| ---------------- | -------------------------------- |
| `@bot list`      | Show all your active reminders   |
| `@bot cancel`    | Cancel your most recent reminder |
| `@bot help`      | Display help message             |
| `@bot task list` | Show all tasks                   |
| `@bot task new`  | Create a new task                |

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

| Technology                                                      | Purpose                       |
| --------------------------------------------------------------- | ----------------------------- |
| [Node.js](https://nodejs.org/)                                  | Runtime environment           |
| [TypeScript](https://www.typescriptlang.org/)                   | Type-safe development         |
| [Baileys](https://github.com/WhiskeySockets/Baileys)            | WhatsApp Web API              |
| [Prisma](https://www.prisma.io/)                                | Database ORM                  |
| [PostgreSQL](https://www.postgresql.org/)                       | Production database           |
| [Winston](https://github.com/winstonjs/winston)                 | Production-grade logging      |
| [chrono-node](https://github.com/wanasit/chrono)                | Natural language date parsing |
| [Luxon](https://moment.github.io/luxon/)                        | Date/time manipulation        |
| [node-schedule](https://github.com/node-schedule/node-schedule) | Job scheduling                |
| [OpenAI](https://openai.com/)                                   | AI assistant (optional)       |

## 📊 Logging & Monitoring

This project uses production-ready structured logging with automatic rotation:

- **Structured JSON logs** for easy parsing and analysis
- **Log rotation** - Daily rotation with automatic cleanup
- **Compression** - Old logs are gzipped to save space
- **Retention policies**:
  - Error logs: 14 days
  - Application logs: 30 days
- **Environment-based log levels** via `LOG_LEVEL` env variable

For details, see [Log Rotation Documentation](./docs/LOG_ROTATION.md)

## Database Schema

![ERD](./assets/reminder-db.png)

## 🔧 Configuration

The bot can be configured via environment variables in `.env`:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/wa_reminder"

# Logging
LOG_LEVEL="info"  # Options: debug, info, warn, error

# OpenAI (Optional)
OPENAI_API_KEY="your-api-key"
OPENAI_MODEL="gpt-4"

# WhatsApp (Auto-generated on first run)
# AUTH_INFO stored in ./auth_info directory
```

## 📁 Project Structure

```
wa-group-reminder/
├── src/
│   ├── service/          # Business logic (WhatsApp, Tasks, Reminders)
│   ├── sheduler/         # Background job schedulers
│   ├── utils/            # Logger and utilities
│   └── app.ts            # Application entry point
├── prisma/               # Database schema and migrations
├── logs/                 # Rotating log files
├── auth_info/            # WhatsApp authentication
└── docs/                 # Documentation
```

## 🚀 Development

```bash
# Watch mode for development
npm run dev

# Build TypeScript
npm run build

# Run in production
npm start
```

## ⚠️ Limitations

- Uses unofficial WhatsApp Web API (may break with WhatsApp updates)
- Bot occupies one device slot in your WhatsApp account
- Cannot read messages sent before bot joined group
- Rate limiting applies (avoid sending too many messages)

**Disclaimer**: This is not an official WhatsApp product. Use at your own risk. WhatsApp may ban accounts that use unofficial clients.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.