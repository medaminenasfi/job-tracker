import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// React 18 act() environment flag + RTL cleanup between tests.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
  window.localStorage.clear();
});
