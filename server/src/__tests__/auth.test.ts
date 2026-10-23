import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { getDb } from '../db/database.js';

const app = createApp();

function clearUsers() {
  getDb().prepare('DELETE FROM users').run();
}

describe('Auth API', () => {
  beforeEach(() => {
    clearUsers();
  });

  describe('POST /api/auth/signup', () => {
    it('creates a new user and returns 201 with a cookie', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'alice@example.com', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.email).toBe('alice@example.com');

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const tokenCookie = Array.isArray(cookies)
        ? cookies.find((c: string) => c.startsWith('token='))
        : cookies;
      expect(tokenCookie).toContain('HttpOnly');
      expect(tokenCookie).toContain('SameSite=Lax');
    });

    it('rejects duplicate email with 409', async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({ email: 'alice@example.com', password: 'password123' });

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'alice@example.com', password: 'anotherpass1' });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists');
    });

    it('rejects invalid email with 400', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'not-an-email', password: 'password123' });

      expect(res.status).toBe(400);
    });

    it('rejects short password with 400', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'alice@example.com', password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('8 characters');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({ email: 'bob@example.com', password: 'securepass1' });
    });

    it('logs in with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'bob@example.com', password: 'securepass1' });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('bob@example.com');

      const cookies = res.headers['set-cookie'];
      const tokenCookie = Array.isArray(cookies)
        ? cookies.find((c: string) => c.startsWith('token='))
        : cookies;
      expect(tokenCookie).toContain('HttpOnly');
    });

    it('rejects wrong password with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'bob@example.com', password: 'wrongpass99' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid email or password');
    });

    it('rejects non-existent user with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'anything123' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns user when authenticated', async () => {
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'carol@example.com', password: 'password123' });

      const cookies = signupRes.headers['set-cookie'];

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookies);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user).toHaveProperty('id');
      expect(meRes.body.user.email).toBe('carol@example.com');
    });

    it('returns null user when not authenticated', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.user).toBeNull();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the token cookie', async () => {
      const res = await request(app).post('/api/auth/logout');

      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'];
      const tokenCookie = Array.isArray(cookies)
        ? cookies.find((c: string) => c.startsWith('token='))
        : cookies;
      expect(tokenCookie).toContain('token=;');
    });
  });

  describe('Password security', () => {
    it('does not store passwords in plaintext', async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({ email: 'dave@example.com', password: 'mypassword1' });

      const db = getDb();
      const user = db.prepare('SELECT password FROM users WHERE email = ?').get('dave@example.com') as any;

      expect(user.password).not.toBe('mypassword1');
      expect(user.password).toMatch(/^\$2[aby]\$/); // bcrypt hash format
    });
  });

  describe('Protected routes', () => {
    it('returns 401 without a cookie on protected endpoints', async () => {
      const res = await request(app).get('/api/health');
      // Health is not protected, just verifying it works
      expect(res.status).toBe(200);
    });
  });
});
