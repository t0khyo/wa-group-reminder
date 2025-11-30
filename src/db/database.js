// src/db/database.js (ES module)
import Database from 'better-sqlite3';
import path from 'path';
import fs, { link } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'reminders.db');
const db = new Database(dbPath);

// initialize table
db.exec(`
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    title TEXT NOT NULL,
    meeting_time INTEGER NOT NULL,
    reminder_24h_sent INTEGER DEFAULT 0,
    reminder_1h_sent INTEGER DEFAULT 0,
    cancelled INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
`);

console.log('✅ Database initialized at', dbPath);

class ReminderDatabase {
  constructor(database) {
    this.db = database;
  }

  createReminder(groupId, senderId, title, meetingTime) {
    const stmt = this.db.prepare(`
      INSERT INTO reminders (group_id, sender_id, title, meeting_time, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      groupId,
      senderId,
      title,
      typeof meetingTime === 'number' ? meetingTime : meetingTime.getTime(),
      Date.now()
    );

    return result.lastInsertRowid;
  }

  getRemindersFor24h() {
    const now = Date.now();
    // reminders between now+24h and now+25h
    const from = now + 24 * 60 * 60 * 1000;
    const to = now + 25 * 60 * 60 * 1000;

    const stmt = this.db.prepare(`
      SELECT * FROM reminders
      WHERE cancelled = 0
        AND reminder_24h_sent = 0
        AND meeting_time <= ?
        AND meeting_time > ?
    `);

    return stmt.all(to, from);
  }

  getRemindersFor1h() {
    const now = Date.now();
    // reminders between now+1h and now+2h
    const from = now + 1 * 60 * 60 * 1000;
    const to = now + 2 * 60 * 60 * 1000;

    const stmt = this.db.prepare(`
      SELECT * FROM reminders
      WHERE cancelled = 0
        AND reminder_1h_sent = 0
        AND meeting_time <= ?
        AND meeting_time > ?
    `);

    return stmt.all(to, from);
  }

  mark24hSent(reminderId) {
    this.db.prepare('UPDATE reminders SET reminder_24h_sent = 1 WHERE id = ?').run(reminderId);
  }

  mark1hSent(reminderId) {
    this.db.prepare('UPDATE reminders SET reminder_1h_sent = 1 WHERE id = ?').run(reminderId);
  }

  cancelLastReminder(groupId, senderId) {
    const stmt = this.db.prepare(`
      UPDATE reminders 
      SET cancelled = 1 
      WHERE id = (
        SELECT id FROM reminders 
        WHERE group_id = ? 
          AND sender_id = ? 
          AND cancelled = 0
        ORDER BY created_at DESC 
        LIMIT 1
      )
    `);

    const result = stmt.run(groupId, senderId);
    return result.changes > 0;
  }

  getUserReminders(groupId, senderId) {
    const stmt = this.db.prepare(`
      SELECT * FROM reminders
      WHERE group_id = ?
        AND sender_id = ?
        AND cancelled = 0
        AND meeting_time > ?
      ORDER BY meeting_time ASC
    `);

    return stmt.all(groupId, senderId, Date.now());
  }
}

const reminderDb = new ReminderDatabase(db);
export default reminderDb;
