import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface DropdownOption {
    label: string;
    value: string;
}

interface DropdownProps {
    value: string;
    onChange: (value: string) => void;
    options: DropdownOption[];
    className?: string;
}

export function Dropdown({ value, onChange, options, className = '' }: DropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value) || options[0];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1 text-sm font-medium focus:outline-none hover:opacity-80 transition-opacity cursor-pointer"
            >
                <span>{selectedOption.label}</span>
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen ? (
                <div className="absolute top-full right-0 mt-2 w-32 bg-white rounded shadow-xl border border-gray-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                    {options.map((option) => (
                        <button
                            key={option.value}
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors cursor-pointer ${option.value === value
                                ? 'bg-accent-earthy/10 text-accent-earthy font-semibold'
                                : 'text-text-earthy hover:bg-gray-50'
                                }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
