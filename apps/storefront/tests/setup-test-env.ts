/// <reference types="vitest-axe/matchers" />
import '@testing-library/jest-dom';
import 'vitest-axe/extend-expect';
import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { toHaveNoViolations } from 'vitest-axe/matchers';

expect.extend(matchers);
expect.extend({ toHaveNoViolations });
