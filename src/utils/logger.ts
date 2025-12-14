import { createLogger, format, transports, Logger } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const logLevel = process.env.LOG_LEVEL || "info";

// Rotating transport for error logs
const errorRotateTransport = new DailyRotateFile({
  filename: "logs/error-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  level: "error",
  maxSize: "20m", // Rotate if file exceeds 20MB
  maxFiles: "14d", // Keep logs for 14 days
  zippedArchive: true, // Compress old logs
});

// Rotating transport for all logs
const combinedRotateTransport = new DailyRotateFile({
  filename: "logs/app-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxSize: "20m", // Rotate if file exceeds 20MB
  maxFiles: "30d", // Keep logs for 30 days
  zippedArchive: true, // Compress old logs
});

const logger: Logger = createLogger({
  level: logLevel,
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: "wa-group-reminder" },
  transports: [errorRotateTransport, combinedRotateTransport],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length
            ? ` ${JSON.stringify(meta)}`
            : "";
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      ),
    })
  );
} else {
  logger.add(
    new transports.Console({
      format: format.json(),
    })
  );
}

export default logger;
