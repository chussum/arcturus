import { describe, expect, test } from 'bun:test';
import type { AppSummary } from '@arcturus/shared';
import { parseAppRef, pickCrossAccountCandidates } from './app-ref';

describe('parseAppRef', () => {
  test('bare name → own account (no owner)', () => {
    expect(parseAppRef('blog')).toEqual({ name: 'blog' });
  });

  test('owner/app → cross-account', () => {
    expect(parseAppRef('bob/blog')).toEqual({ owner: 'bob', name: 'blog' });
  });

  test('empty owner or name is rejected', () => {
    expect(() => parseAppRef('/blog')).toThrow();
    expect(() => parseAppRef('bob/')).toThrow();
  });

  test('more than one slash is rejected', () => {
    expect(() => parseAppRef('a/b/c')).toThrow();
  });
});

describe('pickCrossAccountCandidates', () => {
  const app = (over: Partial<AppSummary>): AppSummary =>
    ({
      id: 'x',
      ownerUsername: 'bob',
      name: 'blog',
      viewerRole: 'manage',
      ...over,
    }) as AppSummary;

  test('keeps other-owner apps with the same name I manage', () => {
    const apps = [app({ ownerUsername: 'bob', viewerRole: 'manage' })];
    expect(pickCrossAccountCandidates(apps, 'blog', 'alice')).toHaveLength(1);
  });

  test('excludes my own apps', () => {
    const apps = [app({ ownerUsername: 'alice', viewerRole: 'owner' })];
    expect(pickCrossAccountCandidates(apps, 'blog', 'alice')).toHaveLength(0);
  });

  test('excludes view-only and admin-visibility (only manage qualifies)', () => {
    const apps = [
      app({ ownerUsername: 'bob', viewerRole: 'view' }),
      app({ ownerUsername: 'carol', viewerRole: 'admin' }),
    ];
    expect(pickCrossAccountCandidates(apps, 'blog', 'alice')).toHaveLength(0);
  });

  test('excludes apps with a different name', () => {
    const apps = [app({ ownerUsername: 'bob', name: 'other', viewerRole: 'manage' })];
    expect(pickCrossAccountCandidates(apps, 'blog', 'alice')).toHaveLength(0);
  });
});
