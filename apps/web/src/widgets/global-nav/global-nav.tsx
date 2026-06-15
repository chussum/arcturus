'use client';

import { styled } from '@linaria/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '../../features/auth/session-context';
import { useI18n } from '../../shared/i18n/locale-context';
import { colors, font, motion, typography } from '../../shared/styles/tokens';
import { GlobalNavBar } from '../../shared/ui';

const Wordmark = styled(Link)`
  ${font(typography.navStrong)}
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: ${colors.text} !important;

  span {
    color: ${colors.accent};
    font-size: 12px;
  }
`;

const NavLinks = styled.nav`
  display: flex;
  align-items: center;
  gap: 26px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  @media (max-width: 640px) {
    gap: 14px;
  }
`;

const NavItem = styled(Link)<{ $active: boolean }>`
  ${font(typography.nav)}
  white-space: nowrap;
  color: ${({ $active }) => ($active ? colors.text : colors.textMuted)} !important;
  transition: color ${motion.color};

  &:hover {
    color: ${colors.text} !important;
  }
`;

/** External nav link (docs/guide) — same type as NavItem, with a ↗ glyph signalling a new tab. */
const NavExternalItem = styled.a`
  ${font(typography.nav)}
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  color: ${colors.textMuted} !important;
  transition: color ${motion.color};

  svg {
    color: ${colors.textFaint};
    transition: color ${motion.color}, transform ${motion.fast};
  }

  &:hover {
    color: ${colors.text} !important;
  }
  &:hover svg {
    color: ${colors.accent};
    transform: translate(1px, -1px);
  }
`;

const RightCluster = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;

  @media (max-width: 640px) {
    gap: 6px;
  }
`;

/** Quiet hairline chip for chrome-level actions (locale, sign out). */
const NavChip = styled.button`
  ${font(typography.nav)}
  font-size: 12px;
  white-space: nowrap;
  height: 28px;
  padding: 0 11px;
  border-radius: 7px;
  border: 1px solid ${colors.hairline};
  color: ${colors.textMuted};
  transition: color ${motion.color}, border-color ${motion.color}, background ${motion.color};

  &:hover {
    color: ${colors.text};
    border-color: ${colors.hairlineStrong};
    background: rgba(237, 233, 224, 0.04);
  }

  @media (max-width: 640px) {
    padding: 0 8px;
  }
`;

/** Username text — on phones only the avatar initial remains. */
const UserName = styled.span`
  @media (max-width: 640px) {
    display: none;
  }
`;

/** Who's signed in: initial in a warm wash, name beside it. Clicks through to account settings. */
const UserBadge = styled(Link)`
  ${font(typography.nav)}
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: ${colors.textMuted} !important;
  margin: 0 4px;
  transition: color ${motion.color};

  &:hover {
    color: ${colors.text} !important;
  }

  &::before {
    content: attr(data-initial);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 9999px;
    background: ${colors.accentWash};
    border: 1px solid rgba(217, 130, 59, 0.3);
    color: ${colors.accent};
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
  }
`;

export function GlobalNav() {
  const { user, signOut } = useSession();
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();

  const links = [
    { href: '/apps', label: t.nav.apps },
    ...(user.role === 'admin' ? [{ href: '/team', label: t.nav.team }] : []),
    { href: '/settings/tokens', label: t.nav.tokens },
  ];

  // Project docs (GitHub Pages), locale-matched, opened in a new tab.
  const docsUrl =
    locale === 'ko'
      ? 'https://chussum.github.io/arcturus/ko/'
      : 'https://chussum.github.io/arcturus/';

  return (
    <GlobalNavBar>
      <NavLinks>
        <Wordmark href="/apps">
          <span>✦</span>Arcturus
        </Wordmark>
        {links.map((link) => (
          <NavItem key={link.href} href={link.href} $active={pathname.startsWith(link.href)}>
            {link.label}
          </NavItem>
        ))}
        <NavExternalItem href={docsUrl} target="_blank" rel="noreferrer">
          {t.nav.docs}
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M4.5 2.5h5v5M9.5 2.5L3 9"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </NavExternalItem>
      </NavLinks>
      <RightCluster>
        <NavChip type="button" onClick={() => setLocale(locale === 'ko' ? 'en' : 'ko')}>
          {locale === 'ko' ? 'EN' : '한국어'}
        </NavChip>
        <UserBadge
          href="/settings/account"
          aria-label={t.nav.account}
          data-initial={user.username.slice(0, 1)}
        >
          <UserName>{user.username}</UserName>
        </UserBadge>
        <NavChip type="button" onClick={() => void signOut()}>
          {t.nav.signOut}
        </NavChip>
      </RightCluster>
    </GlobalNavBar>
  );
}
