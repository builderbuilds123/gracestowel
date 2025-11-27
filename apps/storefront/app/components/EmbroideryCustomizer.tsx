import { useState, useRef, useEffect } from 'react';
import { X, Pencil, Type, Eraser, Check } from 'lucide-react';

interface EmbroideryData {
    type: 'text' | 'drawing';
    data: string;
    font?: string;
    color: string;
}

interface EmbroideryCustomizerProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (embroideryData: EmbroideryData | null) => void;
}

const EMBROIDERY_FONTS = [
    { name: 'Script', value: "'Tangerine', cursive" },
    { name: 'Serif', value: "'Playfair Display', serif" },
    { name: 'Sans', value: "'Montserrat', sans-serif" },
    { name: 'Mono', value: "'Courier New', monospace" }
];

const EMBROIDERY_COLORS = [
    { name: 'Navy', value: '#202A44' },
    { name: 'Burgundy', value: '#800020' },
    { name: 'Forest', value: '#228B22' },
    { name: 'Gold', value: '#FFD700' },
    { name: 'White', value: '#FFFFFF' },
    { name: 'Black', value: '#000000' }
];

export function EmbroideryCustomizer({ isOpen, onClose, onConfirm }: EmbroideryCustomizerProps) {
    const [mode, setMode] = useState<'text' | 'drawing'>('text');
    const [text, setText] = useState('');
    const [selectedFont, setSelectedFont] = useState(EMBROIDERY_FONTS[0]);
    const [selectedColor, setSelectedColor] = useState(EMBROIDERY_COLORS[0]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hoverDrawMode, setHoverDrawMode] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (mode === 'drawing' && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#FAFAFA';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }
    }, [mode]);

    const handleClear = () => {
        if (mode === 'text') {
            setText('');
        } else {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (ctx && canvas) {
                ctx.fillStyle = '#FAFAFA';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }
    };

    const handleConfirm = () => {
        if (mode === 'text' && text.trim()) {
            onConfirm({
                type: 'text',
                data: text,
                font: selectedFont.value,
                color: selectedColor.value
            });
        } else if (mode === 'drawing' && canvasRef.current) {
            const dataUrl = canvasRef.current.toDataURL();
            onConfirm({
                type: 'drawing',
                data: dataUrl,
                color: selectedColor.value
            });
        } else {
            onConfirm(null);
        }
        handleClose();
    };

    const handleClose = () => {
        setText('');
        handleClear();
        onClose();
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        setIsDrawing(true);
        draw(e);
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
            ctx.beginPath();
        }
    };

    const handleHoverDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!hoverDrawMode) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        const { x, y } = getCoordinates(e);

        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = selectedColor.value;

        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();

        // Get the actual canvas dimensions
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        let clientX: number;
        let clientY: number;

        if ('touches' in e) {
            // Touch event
            if (e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else if (e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
            } else {
                return { x: 0, y: 0 };
            }
        } else {
            // Mouse event
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;

        return { x, y };
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        // In hover draw mode, use handleHoverDraw for mouse movements
        if (hoverDrawMode && e.type === 'mousemove') {
            handleHoverDraw(e as React.MouseEvent<HTMLCanvasElement>);
            return;
        }
        if (!isDrawing && e.type !== 'mousedown' && e.type !== 'touchstart') return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        const { x, y } = getCoordinates(e);

        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = selectedColor.value;

        if (e.type === 'mousedown' || e.type === 'touchstart') {
            ctx.beginPath();
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={handleClose}
                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 transition-opacity duration-300"
                aria-hidden="true"
            />

            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                    {/* Header */}
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                        <h2 className="text-2xl font-serif text-text-earthy">Custom Embroidery</h2>
                        <button
                            onClick={handleClose}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <X className="w-6 h-6 text-text-earthy" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-6">
                        {/* Mode Toggle */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => setMode('text')}
                                className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${mode === 'text'
                                    ? 'border-accent-earthy bg-accent-earthy/10 text-accent-earthy'
                                    : 'border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                <Type className="w-5 h-5" />
                                Text Mode
                            </button>
                            <button
                                onClick={() => setMode('drawing')}
                                className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${mode === 'drawing'
                                    ? 'border-accent-earthy bg-accent-earthy/10 text-accent-earthy'
                                    : 'border-gray-200 hover:border-gray-300'
                                    }`}
                            >
                                <Pencil className="w-5 h-5" />
                                Drawing Mode
                            </button>
                        </div>

                        {/* Font Selector (Text Mode Only) */}
                        {mode === 'text' && (
                            <div>
                                <label className="block text-sm font-medium text-text-earthy mb-2">
                                    Embroidery Font
                                </label>
                                <div className="grid grid-cols-4 gap-3">
                                    {EMBROIDERY_FONTS.map((font) => (
                                        <button
                                            key={font.name}
                                            onClick={() => setSelectedFont(font)}
                                            className={`py-2 px-3 rounded-lg border-2 transition-all ${selectedFont.name === font.name
                                                ? 'border-accent-earthy bg-accent-earthy/10'
                                                : 'border-gray-200 hover:border-gray-300'
                                                }`}
                                            style={{ fontFamily: font.value }}
                                        >
                                            {font.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Color Selector */}
                        <div>
                            <label className="block text-sm font-medium text-text-earthy mb-2">
                                Thread Color
                            </label>
                            <div className="flex gap-3 flex-wrap">
                                {EMBROIDERY_COLORS.map((color) => (
                                    <button
                                        key={color.name}
                                        onClick={() => setSelectedColor(color)}
                                        className={`w-12 h-12 rounded-full border-2 transition-all ${selectedColor.name === color.name
                                            ? 'border-accent-earthy ring-2 ring-accent-earthy/20 ring-offset-2'
                                            : 'border-gray-300 hover:scale-110'
                                            }`}
                                        style={{ backgroundColor: color.value }}
                                        title={color.name}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Canvas Area */}
                        <div>
                            <label className="block text-sm font-medium text-text-earthy mb-2">
                                {mode === 'text' ? 'Preview' : 'Drawing Canvas'}
                            </label>

                            {mode === 'text' ? (
                                <div className="relative">
                                    <textarea
                                        ref={textareaRef}
                                        value={text}
                                        onChange={(e) => setText(e.target.value)}
                                        placeholder="Type your custom text here..."
                                        className="w-full h-48 p-6 bg-gray-50 rounded-lg resize-none text-3xl text-center"
                                        style={{
                                            fontFamily: selectedFont.value,
                                            color: selectedColor.value,
                                            textShadow: `
                                                1px 1px 0 rgba(0,0,0,0.1),
                                                2px 2px 0 rgba(0,0,0,0.05),
                                                -1px -1px 0 rgba(255,255,255,0.3)
                                            `
                                        }}
                                    />
                                </div>
                            ) : (
                                <div>
                                    {/* Hover Draw Toggle */}
                                    <div className="mb-3 flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="hoverDraw"
                                            checked={hoverDrawMode}
                                            onChange={(e) => setHoverDrawMode(e.target.checked)}
                                            className="w-4 h-4 accent-accent-earthy"
                                        />
                                        <label htmlFor="hoverDraw" className="text-sm text-text-earthy cursor-pointer">
                                            Enable hover drawing (no click required)
                                        </label>
                                    </div>

                                    <canvas
                                        ref={canvasRef}
                                        width={600}
                                        height={300}
                                        className="w-full border-2 border-gray-200 rounded-lg cursor-crosshair bg-gray-50"
                                        onMouseDown={hoverDrawMode ? undefined : startDrawing}
                                        onMouseUp={hoverDrawMode ? undefined : stopDrawing}
                                        onMouseMove={draw}
                                        onMouseLeave={stopDrawing}
                                        onTouchStart={startDrawing}
                                        onTouchMove={draw}
                                        onTouchEnd={stopDrawing}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleClear}
                                className="flex-1 py-3 px-6 border-2 border-gray-300 text-text-earthy rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                            >
                                <Eraser className="w-5 h-5" />
                                Clear
                            </button>
                            <button
                                onClick={handleConfirm}
                                className="flex-1 py-3 px-6 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors flex items-center justify-center gap-2 shadow-lg"
                            >
                                <Check className="w-5 h-5" />
                                Confirm & Save
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
