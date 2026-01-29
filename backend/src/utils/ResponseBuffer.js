/**
 * ResponseBuffer - Buffers streaming AI responses for Telegram delivery
 *
 * Features:
 * - Batches chunks to reduce API calls
 * - Flushes on sentence boundaries for natural reading
 * - Max buffer size to prevent memory issues
 * - Force flush after 10 seconds
 * - Splits long messages at Telegram's 4096 char limit
 */
class ResponseBuffer {
  constructor(sendFn, delayMs = 500, maxBufferSize = 4096) {
    this.buffer = '';
    this.timer = null;
    this.sendFn = sendFn;
    this.delayMs = delayMs;
    this.maxBufferSize = maxBufferSize;
    this.lastActivity = Date.now();
    this.forceFlushTimer = null;
  }

  add(chunk) {
    this.buffer += chunk;
    this.lastActivity = Date.now();
    clearTimeout(this.timer);

    // Start force flush timer (10 seconds max)
    if (!this.forceFlushTimer) {
      this.forceFlushTimer = setTimeout(() => this.flush(), 10000);
    }

    // Force flush if buffer too large
    if (this.buffer.length > this.maxBufferSize) {
      this.flush();
      return;
    }

    // Send immediately if sentence-ending punctuation
    if (/[.!?]\s*$/.test(chunk.trim())) {
      this.flush();
    } else {
      // Delay flush for batching
      this.timer = setTimeout(() => this.flush(), this.delayMs);
    }
  }

  async flush() {
    clearTimeout(this.timer);
    clearTimeout(this.forceFlushTimer);
    this.timer = null;
    this.forceFlushTimer = null;

    if (!this.buffer.trim()) {
      return;
    }

    // Split long messages at sentence boundaries (Telegram 4096 char limit)
    const messages = this.splitMessage(this.buffer, 4000);
    this.buffer = '';

    for (const msg of messages) {
      try {
        await this.sendFn(msg);
      } catch (error) {
        console.error('[ResponseBuffer] Send error:', error.message);
      }
    }
  }

  splitMessage(text, maxLength) {
    if (text.length <= maxLength) return [text];

    // Split at sentence boundaries
    const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
    const messages = [];
    let current = '';

    for (const sentence of sentences) {
      if ((current + sentence).length > maxLength) {
        if (current) messages.push(current.trim());
        // If single sentence is too long, split by words
        if (sentence.length > maxLength) {
          const words = sentence.split(' ');
          current = '';
          for (const word of words) {
            if ((current + ' ' + word).length > maxLength) {
              if (current) messages.push(current.trim());
              current = word;
            } else {
              current = current ? current + ' ' + word : word;
            }
          }
        } else {
          current = sentence;
        }
      } else {
        current += sentence;
      }
    }

    if (current.trim()) messages.push(current.trim());
    return messages;
  }

  destroy() {
    clearTimeout(this.timer);
    clearTimeout(this.forceFlushTimer);
    this.timer = null;
    this.forceFlushTimer = null;
    this.buffer = '';
  }
}

export default ResponseBuffer;
