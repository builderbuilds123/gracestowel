import { useState, useEffect, useRef } from "react";
import { Clock } from "../lib/icons";

interface CountdownTimerProps {
    /** Remaining time in seconds */
    remainingSeconds: number;
    /** Callback when timer expires */
    onExpire?: () => void;
    /** Optional className for styling */
    className?: string;
}

/**
 * Countdown timer component for the 1-hour modification window.
 * Shows time remaining in MM:SS format with visual styling.
 */
export function CountdownTimer({ remainingSeconds, onExpire, className = "" }: CountdownTimerProps) {
    const [timeLeft, setTimeLeft] = useState(remainingSeconds);
    // Issue #40: Use useRef to stabilize callback and avoid unnecessary effect re-runs
    const onExpireRef = useRef(onExpire);

    // Update ref when callback changes
    useEffect(() => {
        onExpireRef.current = onExpire;
    }, [onExpire]);

    useEffect(() => {
        // Reset timer when remainingSeconds prop changes
        setTimeLeft(remainingSeconds);
    }, [remainingSeconds]);

    useEffect(() => {
        if (timeLeft <= 0) {
            onExpireRef.current?.();
            return;
        }

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    onExpireRef.current?.();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [timeLeft]); // Issue #40: Removed onExpire from dependencies

    // Format time as MM:SS
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    // Determine urgency level for styling
    const isUrgent = timeLeft < 300; // Less than 5 minutes
    const isCritical = timeLeft < 60; // Less than 1 minute

    if (timeLeft <= 0) {
        return (
            <div className={`flex items-center gap-2 text-gray-500 ${className}`}>
                <Clock className="w-5 h-5" />
                <span className="font-medium">Modification window expired</span>
            </div>
        );
    }

    return (
        <div
            className={`flex items-center gap-2 ${
                isCritical
                    ? "text-red-600"
                    : isUrgent
                    ? "text-orange-500"
                    : "text-accent-earthy"
            } ${className}`}
        >
            <Clock className={`w-5 h-5 ${isCritical ? "animate-pulse" : ""}`} />
            <div>
                <span className="font-medium">{formattedTime}</span>
                <span className="text-sm ml-2 opacity-80">
                    {isUrgent ? "left to modify" : "remaining to modify order"}
                </span>
            </div>
        </div>
    );
}

export default CountdownTimer;

