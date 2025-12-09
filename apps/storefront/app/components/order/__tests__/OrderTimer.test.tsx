import React from 'react';
import { render, screen, act } from "@testing-library/react";
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OrderTimer } from "../OrderTimer";

describe("OrderTimer", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("renders formatted time correctly based on server time drift", () => {
        const now = 1000000000000;
        // Server is 5 seconds AHEAD of client (Drift +5000ms)
        const serverTime = new Date(now + 5000).toISOString(); 
        // Expires in 60 seconds from SERVER time
        const expiresAt = new Date(now + 5000 + 60000).toISOString();
        
        // Mock client time
        vi.setSystemTime(now);

        render(
            <OrderTimer 
                expiresAt={expiresAt}
                serverTime={serverTime}
                onExpire={() => {}}
            />
        );

        // Initial render: 60s remaining
        expect(screen.getByText("01:00")).toBeInTheDocument();
        
        // Advance 30s
        act(() => {
            vi.advanceTimersByTime(30000);
        });
        
        expect(screen.getByText("00:30")).toBeInTheDocument();
    });

    it("calls onExpire when time runs out", () => {
        const now = Date.now();
        const serverTime = new Date(now).toISOString();
        const expiresAt = new Date(now + 3000).toISOString(); // 3s
        const onExpire = vi.fn();

        render(
            <OrderTimer 
                expiresAt={expiresAt}
                serverTime={serverTime}
                onExpire={onExpire}
            />
        );

        expect(screen.getByText("00:03")).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(3000);
        });

        expect(onExpire).toHaveBeenCalled();
    });

    it("does not render when already expired", () => {
        const now = Date.now();
        const serverTime = new Date(now).toISOString();
        const expiresAt = new Date(now - 1000).toISOString(); // Expired 1s ago

        const { container } = render(
            <OrderTimer 
                expiresAt={expiresAt}
                serverTime={serverTime}
                onExpire={() => {}}
            />
        );

        expect(container).toBeEmptyDOMElement();
    });

    it("renders urgent styling when less than 5 minutes", () => {
        const now = Date.now();
        const serverTime = new Date(now).toISOString();
        const expiresAt = new Date(now + 299000).toISOString(); // 4m 59s

        render(
            <OrderTimer 
                expiresAt={expiresAt}
                serverTime={serverTime}
                onExpire={() => {}}
            />
        );

        const container = screen.getByRole("timer");
        expect(container).toHaveClass("text-orange-500");
    });
});
