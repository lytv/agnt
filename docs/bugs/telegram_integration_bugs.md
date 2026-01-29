# Telegram Integration & DeepSeek Adapter Issues

## Overview
This document outlines three critical bugs identified in the Telegram integration and AI orchestration layer that prevent messages from being processed and accounts from being linked correctly.

## Bug 1: Missing Method in LLM Adapter (DeepSeek/OpenAI-compatible)

### Symptom
When sending a message via Telegram using the DeepSeek (or any OpenAI-compatible) provider, the server logs the following error:
```
[ExternalChat] Stream error: TypeError: adapter.createChatCompletionStream is not a function
```
The user receives the fallback error message: "Sorry, I encountered an error processing your request."

### Root Cause
The `OrchestratorService.js` (line ~1669) calls `adapter.createChatCompletionStream()`. However, the `OpenAiLikeAdapter` class in `backend/src/services/orchestrator/llmAdapters.js` only implements `callStream()`. It lacks the `createChatCompletionStream` alias that the orchestrator expects.

### Recommended Fix
Add the missing method to `OpenAiLikeAdapter` in `backend/src/services/orchestrator/llmAdapters.js`:

```javascript
// Add inside OpenAiLikeAdapter class
async createChatCompletionStream(options) {
  return await this.client.chat.completions.create(options);
}
```

---

## Bug 2: Database Transaction Context Loss

### Symptom
When attempting to link a Telegram account using a pairing code, the server crashes with:
```
TypeError: Cannot read properties of undefined (reading 'run')
    at Statement.<anonymous> (ExternalChatService.js:338:37)
```

### Root Cause
In `backend/src/services/ExternalChatService.js`, the `linkAccount` method uses a standard function callback for a `db.run` operation:
```javascript
this.db.run(query, params, function(err) { ... })
```
Inside this callback, `this` refers to the SQLite `Statement` object (to access `this.lastID`), hiding the `ExternalChatService` instance. Consequently, calls to `this.db.run('COMMIT')` fail because `this.db` is undefined.

### Recommended Fix
Capture the service instance context before the callback:

```javascript
// In ExternalChatService.js
const self = this; // Capture context
this.db.run(query, params, function(err) {
  if (err) {
    self.db.run('ROLLBACK'); // Use self instead of this
    return reject(err);
  }
  const accountId = this.lastID; // Keep using 'this' for lastID

  self.db.run('COMMIT', ...); // Use self for DB operations
});
```

---

## Bug 3: Missing Database Model Method

### Symptom
After a message is processed (or even if it fails), the server attempts to save the log and fails with:
```
TypeError: ConversationLogModel.getByConversationId is not a function
```

### Root Cause
The `OrchestratorService` tries to call `ConversationLogModel.getByConversationId()` to check if a conversation log exists. However, `backend/src/models/ConversationLogModel.js` does not implement this static method.

### Recommended Fix
Implement the missing method in `backend/src/models/ConversationLogModel.js`:

```javascript
static async getByConversationId(conversationId) {
  const query = `SELECT * FROM conversation_logs WHERE conversation_id = ?`;
  return new Promise((resolve, reject) => {
    db.get(query, [conversationId], (err, row) => {
      if (err) {
        console.error('Error fetching conversation log:', err);
        return reject(err);
      }
      resolve(row);
    });
  });
}
```
