import { html, Component, navigate, keyed } from '../../../src/index.js';

class UsersPage extends Component {
  static tag = 'users-page';

  viewUser(id) {
    navigate(`/users/${id}`);
  }

  render() {
    const { loading, data, error } = this.routeData || {};

    if (loading) {
      return html`
        <div class="loading">
          <div class="spinner"></div>
          <span>Loading users...</span>
        </div>
      `;
    }

    if (error) {
      return html`
        <div style="color: #c62828; padding: 1rem; background: #ffebee; border-radius: 4px;">
          <h2>Error Loading Users</h2>
          <p>${error.message}</p>
        </div>
      `;
    }

    const users = data?.users || [];

    return html`
      <div>
        <h1>Users</h1>
        <p>Loaded ${users.length} users from the "API"</p>

        <style>
          .user-table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .user-table th,
          .user-table td {
            padding: 1rem;
            text-align: left;
            border-bottom: 1px solid #eee;
          }
          .user-table th {
            background: #f5f5f5;
            font-weight: 600;
          }
          .user-table tr:hover {
            background: #f9f9f9;
          }
          .user-table tr:last-child td {
            border-bottom: none;
          }
          .view-btn {
            background: #007acc;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 4px;
            cursor: pointer;
          }
          .view-btn:hover {
            background: #005fa3;
          }
        </style>

        <table class="user-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(user => keyed(user.id, html`
              <tr>
                <td>${user.id}</td>
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${user.role}</td>
                <td>
                  <button class="view-btn" on-click=${() => this.viewUser(user.id)}>
                    View Details
                  </button>
                </td>
              </tr>
            `))}
          </tbody>
        </table>
      </div>
    `;
  }
}

UsersPage.register();
