'use client';

import { styled } from '@linaria/react';
import { type ReactNode, useEffect, useState } from 'react';

const Wrapper = styled.div<{ $visible: boolean; $delay: number }>`
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transform: translateY(${({ $visible }) => ($visible ? '0' : '16px')});
  transition:
    opacity 600ms cubic-bezier(0.21, 0.8, 0.32, 1),
    transform 600ms cubic-bezier(0.21, 0.8, 0.32, 1);
  transition-delay: ${({ $delay }) => $delay}ms;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/**
 * The system's entrance: a quiet fade-and-rise. Stagger lists with
 * index * 70 as delay so pages settle like a constellation appearing.
 */
export function Reveal({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <Wrapper $visible={visible} $delay={delay} style={style}>
      {children}
    </Wrapper>
  );
}
