import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

interface OrderTimerProps {
    expiresAt: string;
    serverTime: string;
    onExpire: () => void;
    className?: string;
}

export function OrderTimer({ expiresAt, serverTime, onExpire, className = "" }: OrderTimerProps) {
    const [timeLeft, setTimeLeft] = useState(0);
    const [lastAnnouncedMinute, setLastAnnouncedMinute] = useState(-1);
    // Calculate initial offset: Server Time - Client Time
    // We assume this component mounts roughly when response is received
    const [offset] = useState(() => new Date(serverTime).getTime() - Date.now());

    useEffect(() => {
        const targetTime = new Date(expiresAt).getTime();

        const updateTimer = () => {
            const now = Date.now() + offset; // Corrected current time
            const diff = Math.max(0, Math.floor((targetTime - now) / 1000));
            
            setTimeLeft(diff);

            // Update announced minute for screen readers (only when minute changes)
            const currentMinute = Math.floor(diff / 60);
            if (currentMinute !== lastAnnouncedMinute) {
                setLastAnnouncedMinute(currentMinute);
            }

            if (diff <= 0) {
                onExpire();
                return true; // Expired
            }
            return false;
        };

        // Initial check
        if (updateTimer()) return;

        const timer = setInterval(() => {
            const isExpired = updateTimer();
            if (isExpired) clearInterval(timer);
        }, 1000);

        return () => clearInterval(timer);
    }, [expiresAt, offset, onExpire]);

    // Format time as MM:SS
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const formattedTime = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    // Accessibility
    const isUrgent = timeLeft < 300; 
    const isCritical = timeLeft < 60;

    if (timeLeft <= 0) {
        return null; // or expiration message if desired (usually parent hides it)
    }

    return (
        <div 
            role="timer" 
            aria-live="off"
            className={`flex items-center gap-2 ${
                isCritical ? "text-red-600" : isUrgent ? "text-orange-500" : "text-accent-earthy"
            } ${className}`}
        >
            <Clock className={`w-5 h-5 ${isCritical ? "animate-pulse" : ""}`} />
            <div>
                <span className="font-medium">{formattedTime}</span>
                <span className="text-sm ml-2 opacity-80 sr-only sm:not-sr-only">
                    {isUrgent ? "left to modify" : "remaining to modify order"}
                </span>
            </div>
            {/* Separate live region for screen reader announcements - updates only when minute changes */}
            <span className="sr-only" aria-live="polite" aria-atomic="true">
                {minutes} minute{minutes !== 1 ? 's' : ''} remaining to modify order
            </span>
    );
}

