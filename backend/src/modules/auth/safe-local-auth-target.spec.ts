import { describe, expect, it } from 'vitest';
import { parseAuthSmokeOrigin, parseAuthTestDatabaseUrl } from '../../../scripts/safe-local-auth-target.mjs';

describe('auth local verifier target guards', () => {
  it.each([
    'postgresql://user:secret@db.example/auth_rbac_audit_test',
    'postgresql://user:secret@localhost/auth_rbac_audit_test-copy',
    'postgresql://user:secret@localhost/other?dbname=auth_rbac_audit_test',
    'postgresql://user:secret@localhost/auth_rbac_audit_test?host=remote.example',
    'postgresql://user:secret@localhost/auth_rbac_audit_test?port=6432',
    'not a URL',
  ])('rejects unsafe DB destination before connecting: %s', (value) => {
    expect(() => parseAuthTestDatabaseUrl(value)).toThrow();
  });

  it.each([
    'https://example.com',
    'http://127.0.0.1:4173/path',
    'http://user:pass@localhost:4173',
    'http://localhost:4173?redirect=remote',
    'invalid URL',
  ])('rejects unsafe smoke origin before HTTP: %s', (value) => {
    expect(() => parseAuthSmokeOrigin(value)).toThrow();
  });

  it('accepts only exact loopback destinations', () => {
    expect(parseAuthTestDatabaseUrl('postgresql://u:p@127.0.0.1:5432/auth_rbac_audit_test').pathname).toBe('/auth_rbac_audit_test');
    expect(parseAuthTestDatabaseUrl('postgresql://u:p@[::1]:5432/auth_rbac_audit_test').hostname).toBe('[::1]');
    expect(parseAuthSmokeOrigin('http://localhost:4173')).toBe('http://localhost:4173');
  });
});
