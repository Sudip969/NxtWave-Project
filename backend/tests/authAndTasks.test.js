const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const db = require('../src/config/db');

// Mock PG DB pool and Redis Client
jest.mock('../src/config/db', () => {
  return {
    query: jest.fn(),
    pool: {
      connect: jest.fn().mockImplementation(() => ({
        query: jest.fn(),
        release: jest.fn()
      }))
    }
  };
});


describe('Team Task Tracker API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Flow 1: User Authentication & JWT Logic', () => {
    test('Register - Should successfully register new user with hashed password', async () => {
      // Mock db check that user does not exist
      db.query.mockImplementation((text, params) => {
        if (text.includes('SELECT id FROM users')) {
          return Promise.resolve({ rows: [] });
        }
        if (text.includes('SELECT id FROM organizations')) {
          return Promise.resolve({ rows: [{ id: 'org-123' }] });
        }
        if (text.includes('INSERT INTO users')) {
          return Promise.resolve({
            rows: [{
              id: 'user-123',
              email: 'john@test.com',
              name: 'John Test',
              role: 'MEMBER',
              organization_id: 'org-123',
              created_at: new Date()
            }]
          });
        }
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'john@test.com',
          password: 'password123',
          name: 'John Test',
          organizationName: 'Test Org',
          role: 'MEMBER'
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('User registered successfully');
      expect(res.body.data.user.id).toBe('user-123');
      expect(res.body.data.user.role).toBe('MEMBER');
    });

    test('Login - Should issue JWT access and refresh token rotation on valid login credentials', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('password123', 10);

      db.query.mockImplementation((text, params) => {
        if (text.includes('SELECT u.*')) {
          return Promise.resolve({
            rows: [{
              id: 'user-123',
              email: 'john@test.com',
              password_hash: hash,
              name: 'John Test',
              role: 'MEMBER',
              organization_id: 'org-123',
              organization_name: 'Test Org'
            }]
          });
        }
        if (text.includes('INSERT INTO refresh_tokens')) {
          return Promise.resolve({ rows: [] });
        }
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'john@test.com',
          password: 'password123'
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Login successful');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });
  });

  describe('Flow 2: Task Status Transitions & Dynamic RBAC', () => {
    let mockMemberToken;

    beforeAll(() => {
      // Issue a mock member token signed with default test secret
      mockMemberToken = jwt.sign(
        { userId: 'member-123', organizationId: 'org-123', role: 'MEMBER' },
        'access_secret_key',
        { expiresIn: '15m' }
      );
    });

    test('MEMBER - Should allow changing status of a task not assigned to them', async () => {
      // Mock route auth profile fetch and task details check
      db.query.mockImplementation((text, params) => {
        if (text.includes('SELECT id, email, name, role, organization_id FROM users')) {
          return Promise.resolve({
            rows: [{ id: 'member-123', email: 'john@test.com', name: 'John Member', role: 'MEMBER', organization_id: 'org-123' }]
          });
        }
        if (text.includes('organization_id') && text.includes('tasks')) {
          return Promise.resolve({
            rows: [{
              id: 'task-123',
              title: 'Some Task',
              status: 'TODO',
              assignee_id: 'another-user-456', // NOT assigned to member-123
              organization_id: 'org-123'
            }]
          });
        }
        if (text.includes('UPDATE tasks')) {
          return Promise.resolve({
            rows: [{
              id: 'task-123',
              title: 'Some Task',
              status: 'IN_PROGRESS',
              assignee_id: 'another-user-456',
              organization_id: 'org-123'
            }]
          });
        }
        if (text.includes('INSERT INTO task_status_history')) {
          return Promise.resolve({ rows: [] });
        }
      });

      const res = await request(app)
        .patch('/api/tasks/task-123')
        .set('Authorization', `Bearer ${mockMemberToken}`)
        .send({ status: 'IN_PROGRESS' });

      // Should succeed with 200 OK since card status changes are allowed by everyone
      expect(res.status).toBe(200);
      expect(res.body.data.task.status).toBe('IN_PROGRESS');
    });

    test('Transitions - Should succeed when trying to transition state directly (TODO -> DONE)', async () => {
      // Mock authenticated user as the assignee
      db.query.mockImplementation((text, params) => {
        if (text.includes('SELECT id, email, name, role, organization_id FROM users')) {
          return Promise.resolve({
            rows: [{ id: 'member-123', email: 'john@test.com', name: 'John Member', role: 'MEMBER', organization_id: 'org-123' }]
          });
        }
        if (text.includes('organization_id') && text.includes('tasks')) {
          return Promise.resolve({
            rows: [{
              id: 'task-123',
              title: 'Design API Specs',
              status: 'TODO',
              assignee_id: 'member-123', // Assigned to logged in user
              organization_id: 'org-123'
            }]
          });
        }
        if (text.includes('UPDATE tasks')) {
          return Promise.resolve({
            rows: [{
              id: 'task-123',
              title: 'Design API Specs',
              status: 'DONE',
              assignee_id: 'member-123',
              organization_id: 'org-123'
            }]
          });
        }
        if (text.includes('INSERT INTO task_status_history')) {
          return Promise.resolve({ rows: [] });
        }
      });

      const res = await request(app)
        .patch('/api/tasks/task-123')
        .set('Authorization', `Bearer ${mockMemberToken}`)
        .send({ status: 'DONE' });

      expect(res.status).toBe(200);
      expect(res.body.data.task.status).toBe('DONE');
    });

    test('MEMBER - Should succeed when assigning state TODO to IN_PROGRESS on their own task', async () => {
      db.query.mockImplementation((text, params) => {
        if (text.includes('SELECT id, email, name, role, organization_id FROM users')) {
          return Promise.resolve({
            rows: [{ id: 'member-123', email: 'john@test.com', name: 'John Member', role: 'MEMBER', organization_id: 'org-123' }]
          });
        }
        if (text.includes('organization_id') && text.includes('tasks')) {
          return Promise.resolve({
            rows: [{
              id: 'task-123',
              title: 'Design API Specs',
              status: 'TODO',
              assignee_id: 'member-123',
              organization_id: 'org-123'
            }]
          });
        }
        if (text.includes('UPDATE tasks')) {
          return Promise.resolve({
            rows: [{
              id: 'task-123',
              title: 'Design API Specs',
              status: 'IN_PROGRESS',
              assignee_id: 'member-123',
              organization_id: 'org-123'
            }]
          });
        }
        if (text.includes('INSERT INTO task_status_history')) {
          return Promise.resolve({ rows: [] });
        }
      });

      const res = await request(app)
        .patch('/api/tasks/task-123')
        .set('Authorization', `Bearer ${mockMemberToken}`)
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(200);
      expect(res.body.data.task.status).toBe('IN_PROGRESS');
    });
  });
});
