'use client';

import { styled } from '@linaria/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { colors, font, motion, typography } from '../styles/tokens';
import { Spinner } from './spinner';

type Variant = 'primary' | 'ghost' | 'danger';

const Base = styled.button<{ $variant: Variant }>`
  ${font(typography.button)}
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 36px;
  padding: 0 16px;
  border-radius: 8px;
  white-space: nowrap;
  transition:
    background ${motion.color},
    border-color ${motion.color},
    color ${motion.color},
    transform ${motion.fast};

  background: ${({ $variant }) => ($variant === 'primary' ? colors.accent : 'transparent')};
  color: ${({ $variant }) =>
    $variant === 'primary'
      ? colors.onCream
      : $variant === 'danger'
        ? colors.statusFailed
        : colors.text};
  border: 1px solid
    ${({ $variant }) =>
      $variant === 'primary'
        ? colors.accent
        : $variant === 'danger'
          ? 'rgba(229, 86, 74, 0.4)'
          : colors.hairlineStrong};

  &:hover:not(:disabled) {
    background: ${({ $variant }) =>
      $variant === 'primary'
        ? colors.accentBright
        : $variant === 'danger'
          ? 'rgba(229, 86, 74, 0.12)'
          : 'rgba(237, 233, 224, 0.07)'};
    border-color: ${({ $variant }) =>
      $variant === 'primary'
        ? colors.accentBright
        : $variant === 'danger'
          ? colors.statusFailed
          : 'rgba(237, 233, 224, 0.34)'};
  }
  &:active:not(:disabled) {
    transform: ${motion.pressScale};
  }
  &:focus-visible {
    outline: 2px solid
      ${({ $variant }) => ($variant === 'primary' ? colors.cream : colors.accent)};
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Shows an inline spinner and blocks interaction while an action runs. */
  busy?: boolean;
  children: ReactNode;
}

/** Compact action button. `busy` is the system-wide loading affordance. */
export function Button({ variant = 'primary', busy = false, children, ...rest }: ButtonProps) {
  return (
    <Base $variant={variant} disabled={busy || rest.disabled} {...rest}>
      {busy && <Spinner />}
      {children}
    </Base>
  );
}

/** Inline text action; pairs with `busy` for quiet row-level operations. */
const TextBase = styled.button<{ $danger: boolean }>`
  ${font(typography.caption)}
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  color: ${({ $danger }) => ($danger ? colors.statusFailed : colors.accent)};
  transition: color ${motion.color};

  &:hover:not(:disabled) {
    color: ${({ $danger }) => ($danger ? '#ff7b6e' : colors.accentBright)};
  }
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
    border-radius: 4px;
  }
`;

export interface TextButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  busy?: boolean;
  danger?: boolean;
  children: ReactNode;
}

export function TextButton({ busy = false, danger = false, children, ...rest }: TextButtonProps) {
  return (
    <TextBase $danger={danger} disabled={busy || rest.disabled} {...rest}>
      {busy && <Spinner style={{ width: 11, height: 11 }} />}
      {children}
    </TextBase>
  );
}
