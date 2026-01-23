import { html, Component } from '../../../src/index.js';

class HomePage extends Component {
  static tag = 'home-page';

  render() {
    return html`
      <div>
        <h1>Welcome to BedrockJS</h1>
        <p>This is a demo of the BedrockJS router with async data loading.</p>

        <h2>Features</h2>
        <ul>
          <li>History API based routing</li>
          <li>Async data loaders per route</li>
          <li>Loading states handled automatically</li>
          <li>Route parameters (try /users/1)</li>
          <li>Navigation with router-link components</li>
        </ul>

        <h2>Try It Out</h2>
        <p>Click on the navigation links to see different pages:</p>
        <ul>
          <li><strong>Users</strong> - Loads user list with simulated API delay</li>
          <li><strong>About</strong> - Static page without data loading</li>
        </ul>

        <p style="color: #666; margin-top: 2rem;">
          Note: This demo uses History API routing. If you're serving this locally,
          make sure your server handles client-side routing (returns index.html for all routes).
        </p>
      </div>
    `;
  }
}

HomePage.register();
