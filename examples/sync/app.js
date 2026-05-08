import { Component, html, keyed } from '../../src/index.js';
import { syncedModel } from '../../src/sync/index.js';

const Todo = syncedModel('todo', {
  fields: {
    id: 'string',
    title: 'string',
    completed: 'boolean',
    createdAt: 'datetime',
    updatedAt: 'datetime',
  },
});

class TodoApp extends Component {
  static tag = 'todo-app';
  static properties = {
    draft: { type: String, default: '' },
  };

  async add() {
    const title = this.draft.trim();
    if (!title) return;
    const now = new Date();
    await Todo.create({
      id: crypto.randomUUID(),
      title,
      completed: false,
      createdAt: now,
      updatedAt: now,
    });
    this.draft = '';
  }

  toggle(id, completed) {
    Todo.update(id, { completed: !completed, updatedAt: new Date() });
  }

  remove(id) {
    Todo.delete(id);
  }

  render() {
    const items = Todo.all();
    return html`
      <form on-submit=${(e) => { e.preventDefault(); this.add(); }}>
        <div style="display:flex; gap:.5rem;">
          <input
            type="text"
            .value=${this.draft}
            placeholder="What needs doing?"
            on-input=${(e) => (this.draft = e.target.value)}
          />
          <button type="submit">Add</button>
        </div>
      </form>
      <ul>
        ${items.map((t) =>
          keyed(t.id, html`
            <li class=${t.completed ? 'done' : ''}>
              <input
                type="checkbox"
                .checked=${t.completed}
                on-change=${() => this.toggle(t.id, t.completed)}
              />
              <span>${t.title}</span>
              <button on-click=${() => this.remove(t.id)}>×</button>
            </li>
          `),
        )}
      </ul>
      <p class="hint">${items.length} item(s)</p>
    `;
  }
}

TodoApp.register();
