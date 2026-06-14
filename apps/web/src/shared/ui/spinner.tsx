import { styled } from '@linaria/react';

/** 14px ring spinner that inherits currentColor — drops into any button or label. */
export const Spinner = styled.span`
  display: inline-block;
  width: 14px;
  height: 14px;
  flex: none;
  border-radius: 9999px;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  opacity: 0.9;
  animation: arcturus-spin 600ms linear infinite;

  @keyframes arcturus-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;
