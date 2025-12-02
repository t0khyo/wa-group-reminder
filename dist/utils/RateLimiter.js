export class RateLimiter {
    /**
     * @param maxRequests - Maximum number of requests allowed in the window
     * @param windowMs - Time window in milliseconds
     */
    constructor(maxRequests = 10, windowMs = 60000) {
        this.requests = new Map();
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }
    /**
     * Try to consume a request for the given identifier
     * @param identifier - User ID, chat ID, or any unique identifier
     * @returns true if request is allowed, false if rate limit exceeded
     */
    tryConsume(identifier) {
        const now = Date.now();
        const userRequests = this.requests.get(identifier) || [];
        // Remove old requests outside the window
        const validRequests = userRequests.filter((timestamp) => now - timestamp < this.windowMs);
        // Check if limit exceeded
        if (validRequests.length >= this.maxRequests) {
            return false;
        }
        // Add new request
        validRequests.push(now);
        this.requests.set(identifier, validRequests);
        return true;
    }
    /**
     * Get remaining requests for identifier
     */
    getRemaining(identifier) {
        const now = Date.now();
        const userRequests = this.requests.get(identifier) || [];
        const validRequests = userRequests.filter((timestamp) => now - timestamp < this.windowMs);
        return Math.max(0, this.maxRequests - validRequests.length);
    }
    /**
     * Reset rate limit for identifier
     */
    reset(identifier) {
        this.requests.delete(identifier);
    }
    /**
     * Clear all rate limits (useful for cleanup)
     */
    clear() {
        this.requests.clear();
    }
    /**
     * Cleanup old entries (call periodically)
     */
    cleanup() {
        const now = Date.now();
        for (const [identifier, timestamps] of this.requests.entries()) {
            const validRequests = timestamps.filter((timestamp) => now - timestamp < this.windowMs);
            if (validRequests.length === 0) {
                this.requests.delete(identifier);
            }
            else {
                this.requests.set(identifier, validRequests);
            }
        }
    }
}
