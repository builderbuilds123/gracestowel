
import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface AccordionItemProps {
  title: string;
  children: React.ReactNode;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onToggle?: () => void;
}

export function AccordionItem({ title, children, isOpen: forcedOpen, defaultOpen = false, onToggle }: AccordionItemProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);
  const isOpen = forcedOpen !== undefined ? forcedOpen : internalIsOpen;
  
  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    }
    // Always toggle internal state ensuring "uncontrolled but respecting default" works
    // AND if controlled (onToggle provided), we usually expect parent to update `isOpen`.
    // However, for mixed usage (optional control), we should update internal state if `forcedOpen` is undefined.
    if (forcedOpen === undefined) {
      setInternalIsOpen(!internalIsOpen);
    }
  };

  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="border-b border-card-earthy/20 last:border-0">
      <button
        onClick={handleToggle}
        className="w-full py-4 flex items-center justify-between text-left group"
      >
        <span className="font-serif text-lg text-text-earthy group-hover:text-accent-earthy transition-colors">
          {title}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-text-earthy/60 transition-transform duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        ref={contentRef}
        className={`overflow-hidden transition-all duration-300 ease-in-out`}
        style={{
          maxHeight: isOpen ? contentRef.current?.scrollHeight : 0,
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="pb-4 text-text-earthy/80 text-sm leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Accordion({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-card-earthy/20 mt-8">{children}</div>;
}
