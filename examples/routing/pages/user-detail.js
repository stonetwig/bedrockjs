import { html, Component, navigate } from '../../../src/index.js';

class UserDetailPage extends Component {
  static tag = 'user-detail-page';

  goBack = () => {
    navigate('/users');
  };

  render() {
    const { loading, data, error, params } = this.routeData || {};

    if (loading) {
      return html`
        <div class="loading">
          <div class="spinner"></div>
          <span>Loading user ${params?.id}...</span>
        </div>
      `;
    }

    if (error) {
      return html`
        <div>
          <div style="color: #c62828; padding: 1rem; background: #ffebee; border-radius: 4px; margin-bottom: 1rem;">
            <h2>Error</h2>
            <p>${error.message}</p>
          </div>
          <button
            style="background: #007acc; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;"
            on-click=${this.goBack}
          >
            Back to Users
          </button>
        </div>
      `;
    }

    const user = data?.user;

    return html`
      <div>
        <button
          style="background: #666; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; margin-bottom: 1rem;"
          on-click=${this.goBack}
        >
          ← Back to Users
        </button>

        <style>
          .user-card {
            background: white;
            border-radius: 8px;
            padding: 2rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          .user-card h1 {
            margin-top: 0;
            color: #333;
          }
          .user-info {
            display: grid;
            grid-template-columns: 120px 1fr;
            gap: 1rem;
            margin-top: 1.5rem;
          }
          .user-info dt {
            font-weight: 600;
            color: #666;
          }
          .user-info dd {
            margin: 0;
          }
          .role-badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            background: #e3f2fd;
            color: #1976d2;
            border-radius: 20px;
            font-size: 0.9em;
          }
        </style>

        <div class="user-card">
          <h1>${user.name}</h1>
          <dl class="user-info">
            <dt>ID</dt>
            <dd>${user.id}</dd>

            <dt>Email</dt>
            <dd><a href="mailto:${user.email}">${user.email}</a></dd>

            <dt>Role</dt>
            <dd><span class="role-badge">${user.role}</span></dd>
          </dl>
        </div>

        <p style="color: #666; margin-top: 2rem; font-size: 0.9em;">
          This data was loaded via the route's async loader function.
          The route parameter was: <code>/users/${params?.id}</code>
        </p>
      </div>
    `;
  }
}

UserDetailPage.register();
