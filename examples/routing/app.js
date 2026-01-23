/**
 * Main app file with router configuration
 */

import { createRouter } from '../../src/index.js';

// Import page components
import './pages/home.js';
import './pages/users.js';
import './pages/user-detail.js';
import './pages/about.js';

// Mock user data
const mockUsers = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'Admin' },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'Developer' },
  { id: 3, name: 'Carol Williams', email: 'carol@example.com', role: 'Designer' },
  { id: 4, name: 'David Brown', email: 'david@example.com', role: 'Developer' },
  { id: 5, name: 'Eve Davis', email: 'eve@example.com', role: 'Manager' }
];

// Simulate async API calls
async function fetchUsers() {
  await new Promise(r => setTimeout(r, 500)); // Simulate network delay
  return mockUsers;
}

async function fetchUser(id) {
  await new Promise(r => setTimeout(r, 300)); // Simulate network delay
  const user = mockUsers.find(u => u.id === parseInt(id));
  if (!user) {
    throw new Error(`User with id ${id} not found`);
  }
  return user;
}

// Create and start router
const router = createRouter({
  base: '/examples/routing',
  routes: [
    {
      path: '/',
      component: 'home-page'
    },
    {
      path: '/users',
      component: 'users-page',
      loader: async () => {
        return { users: await fetchUsers() };
      }
    },
    {
      path: '/users/:id',
      component: 'user-detail-page',
      loader: async ({ id }) => {
        return { user: await fetchUser(id) };
      }
    },
    {
      path: '/about',
      component: 'about-page'
    }
  ]
});

console.log('BedrockJS Router Demo started!');
