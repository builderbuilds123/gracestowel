import { useState } from "react";
import { X, Loader2 } from "../lib/icons";

interface Address {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2?: string;
    city: string;
    province?: string;
    postal_code: string;
    country_code: string;
    phone?: string;
}

interface EditAddressDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (address: Address) => Promise<void>;
    currentAddress?: Address;
}

/**
 * Dialog for editing shipping address within the modification window.
 */
export function EditAddressDialog({ isOpen, onClose, onSave, currentAddress }: EditAddressDialogProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [address, setAddress] = useState<Address>(currentAddress || {
        first_name: "",
        last_name: "",
        address_1: "",
        address_2: "",
        city: "",
        province: "",
        postal_code: "",
        country_code: "US",
        phone: "",
    });

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            await onSave(address);
            onClose();
        } catch (err: any) {
            setError(err.message || "Failed to update address. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleChange = (field: keyof Address, value: string) => {
        setAddress(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" onClick={!isLoading ? onClose : undefined} />

            {/* Dialog */}
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
                {/* Close button */}
                <button
                    onClick={onClose}
                    disabled={isLoading}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                    <X className="w-5 h-5" />
                </button>

                <h2 className="text-xl font-serif text-text-earthy mb-6">Edit Shipping Address</h2>

                {error ? (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        {error}
                    </div>
                ) : null}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-text-earthy mb-1">First Name *</label>
                            <input
                                type="text"
                                value={address.first_name}
                                onChange={(e) => handleChange("first_name", e.target.value)}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-earthy focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-earthy mb-1">Last Name *</label>
                            <input
                                type="text"
                                value={address.last_name}
                                onChange={(e) => handleChange("last_name", e.target.value)}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-earthy focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text-earthy mb-1">Address Line 1 *</label>
                        <input
                            type="text"
                            value={address.address_1}
                            onChange={(e) => handleChange("address_1", e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-earthy focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text-earthy mb-1">Address Line 2</label>
                        <input
                            type="text"
                            value={address.address_2 || ""}
                            onChange={(e) => handleChange("address_2", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-earthy focus:border-transparent"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-text-earthy mb-1">City *</label>
                            <input
                                type="text"
                                value={address.city}
                                onChange={(e) => handleChange("city", e.target.value)}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-earthy focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-earthy mb-1">State/Province</label>
                            <input
                                type="text"
                                value={address.province || ""}
                                onChange={(e) => handleChange("province", e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-earthy focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-text-earthy mb-1">Postal Code *</label>
                            <input
                                type="text"
                                value={address.postal_code}
                                onChange={(e) => handleChange("postal_code", e.target.value)}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-earthy focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-earthy mb-1">Country *</label>
                            <select
                                value={address.country_code}
                                onChange={(e) => handleChange("country_code", e.target.value)}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-earthy focus:border-transparent"
                            >
                                <option value="US">United States</option>
                                <option value="CA">Canada</option>
                                <option value="GB">United Kingdom</option>
                                <option value="DE">Germany</option>
                                <option value="FR">France</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text-earthy mb-1">Phone</label>
                        <input
                            type="tel"
                            value={address.phone || ""}
                            onChange={(e) => handleChange("phone", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-earthy focus:border-transparent"
                        />
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-text-earthy hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 px-4 py-3 bg-accent-earthy text-white rounded-lg hover:bg-accent-earthy/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                "Save Address"
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default EditAddressDialog;

