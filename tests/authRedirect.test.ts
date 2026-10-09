// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { authErrorMessage, parseAuthRedirect } from '../src/lib/authRedirect';

describe('parseAuthRedirect', () => {
  it('ignores URLs without an auth marker', () => {
    expect(parseAuthRedirect('')).toEqual({ status: null, reason: null });
    expect(parseAuthRedirect('?foo=bar')).toEqual({ status: null, reason: null });
  });

  it('parses success and error markers', () => {
    expect(parseAuthRedirect('?auth=success')).toEqual({ status: 'success', reason: null });
    expect(parseAuthRedirect('?auth=error&reason=invalid_state')).toEqual({
      status: 'error',
      reason: 'invalid_state',
    });
  });
});

describe('authErrorMessage', () => {
  it('maps known reasons to friendly messages', () => {
    expect(authErrorMessage('access_denied')).toMatch(/cancelled/i);
    expect(authErrorMessage('invalid_state')).toMatch(/expired/i);
    expect(authErrorMessage('token_400')).toMatch(/rejected/i);
  });

  it('falls back to a generic message', () => {
    expect(authErrorMessage(null)).toMatch(/failed/i);
    expect(authErrorMessage('something_odd')).toMatch(/failed/i);
  });
});
