#!/bin/sh
set -e

echo "🚀 Starting WhatsApp Group Reminder Bot..."

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10
echo "✅ Database is ready!"

# Run database schema sync (using db push for development/docker flexibility)
echo "🔄 Syncing database schema..."
npx prisma db push --accept-data-loss

# Start the application
echo "🤖 Starting WhatsApp bot..."
exec node dist/app.js
