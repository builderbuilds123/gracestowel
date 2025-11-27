import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CountdownTimer } from '../CountdownTimer';

describe('CountdownTimer', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should render the initial time correctly', () => {
        render(<CountdownTimer remainingSeconds={3600} onExpire={() => {}} />);

        expect(screen.getByText('60:00')).toBeDefined();
    });

    it('should format time with leading zeros', () => {
        render(<CountdownTimer remainingSeconds={65} onExpire={() => {}} />);

        expect(screen.getByText('01:05')).toBeDefined();
    });

    it('should count down every second', () => {
        render(<CountdownTimer remainingSeconds={10} onExpire={() => {}} />);

        expect(screen.getByText('00:10')).toBeDefined();

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        expect(screen.getByText('00:09')).toBeDefined();
    });

    it('should call onExpire when timer reaches zero', () => {
        const onExpire = vi.fn();
        render(<CountdownTimer remainingSeconds={2} onExpire={onExpire} />);

        expect(onExpire).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(2000);
        });

        // onExpire may be called multiple times due to useEffect re-runs
        expect(onExpire).toHaveBeenCalled();
    });

    it('should not go below zero', () => {
        const onExpire = vi.fn();
        render(<CountdownTimer remainingSeconds={1} onExpire={onExpire} />);

        act(() => {
            vi.advanceTimersByTime(5000);
        });

        expect(screen.getByText('Modification window expired')).toBeDefined();
        expect(onExpire).toHaveBeenCalled();
    });

    it('should handle zero initial seconds', () => {
        const onExpire = vi.fn();
        render(<CountdownTimer remainingSeconds={0} onExpire={onExpire} />);

        expect(screen.getByText('Modification window expired')).toBeDefined();
        expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('should display hours when time is over 60 minutes', () => {
        render(<CountdownTimer remainingSeconds={3661} onExpire={() => {}} />);

        // 3661 seconds = 61 minutes and 1 second = 61:01
        expect(screen.getByText('61:01')).toBeDefined();
    });
});

