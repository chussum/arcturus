'use client';

import { styled } from '@linaria/react';
import { useEffect, useRef } from 'react';
import { colors, fontStack, spacing } from '../../shared/styles/tokens';

interface LogConsoleProps {
  lines: string[];
  placeholder: string;
  /** When true the viewer fills its container (used inside the fullscreen overlay). */
  fullscreen?: boolean;
}

const LogViewer = styled.pre<{ fullscreen?: boolean }>`
  background: ${colors.black};
  color: ${colors.textMuted};
  font-family: ${fontStack.mono};
  font-size: 12px;
  line-height: 1.7;
  border: 1px solid ${colors.hairline};
  border-radius: 10px;
  padding: ${spacing.md};
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  /* inline mode: fixed height; fullscreen mode: fills remaining panel space */
  height: var(--log-height, 320px);
  flex: var(--log-flex, unset);
`;

/**
 * Renders a list of log lines inside a fixed-height scrollable pre element.
 * Sticks to the bottom when new lines arrive — unless the user has scrolled up.
 */
export function LogConsole({ lines, placeholder, fullscreen = false }: LogConsoleProps) {
  const ref = useRef<HTMLPreElement>(null);
  const stickRef = useRef(true);

  // Scroll to bottom whenever lines change, if we're still stuck there.
  useEffect(() => {
    const el = ref.current;
    if (el && stickRef.current) el.scrollTo({ top: el.scrollHeight });
  });

  const style = fullscreen
    ? ({ '--log-height': '100%', '--log-flex': '1' } as React.CSSProperties)
    : undefined;

  return (
    <LogViewer
      ref={ref}
      style={style}
      onScroll={(event) => {
        const el = event.currentTarget;
        stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      {lines.length > 0 ? lines.join('\n') : placeholder}
    </LogViewer>
  );
}
