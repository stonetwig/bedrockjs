import { Component, html, keyed } from '../../src/index.js';
import { syncedModel, configureSync } from '../../src/sync/index.js';

configureSync({
  baseUrl: '/sync',
  dbName: 'bedrockjs-sync-chat',
});

const Message = syncedModel('message', {
  fields: {
    id: 'string',
    text: 'string',
    timestamp: 'datetime',
    clientId: 'string',
  },
});

const clientId = crypto.randomUUID().slice(0, 8);

class ChatApp extends Component {
  static tag = 'chat-app';
  static properties = {
    draft: { type: String, default: '' },
  };

  async sendMessage() {
    const text = this.draft.trim();
    if (!text) return;

    await Message.create({
      id: crypto.randomUUID(),
      text,
      timestamp: new Date(),
      clientId,
    });
    this.draft = '';
    this.scrollToBottom();
  }

  scrollToBottom() {
    setTimeout(() => {
      const messages = this.querySelector('.messages');
      if (messages) {
        messages.scrollTop = messages.scrollHeight;
      }
    }, 0);
  }

  render() {
    const messages = Message.all();

    return html`
      <div class="chat-container">
        <div class="messages">
          ${messages.length === 0
            ? html`<div class="empty">No messages yet. Start the conversation!</div>`
            : messages.map((msg) =>
                keyed(msg.id, html`
                  <div class="message ${msg.clientId === clientId ? 'own' : 'other'}">
                    <div class="author">${msg.clientId}</div>
                    <div class="text">${msg.text}</div>
                    <div class="time">${new Date(msg.timestamp).toLocaleTimeString()}</div>
                  </div>
                `),
              )}
        </div>
        <form class="input-form" on-submit=${(e) => {
          e.preventDefault();
          this.sendMessage();
        }}>
          <div style="display: flex; gap: 0.5rem;">
            <input
              type="text"
              .value=${this.draft}
              placeholder="Type a message..."
              on-input=${(e) => (this.draft = e.target.value)}
              class="message-input"
            />
            <button type="submit" class="send-btn">Send</button>
          </div>
        </form>
        <p class="hint">Your client ID: <code>${clientId}</code> | Open in multiple tabs to chat!</p>
      </div>
    `;
  }
}

ChatApp.register();
