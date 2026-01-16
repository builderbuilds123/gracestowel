// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductActions } from './ProductActions';

// Mock dependencies
const mockPostHog = {
  capture: vi.fn(),
};

vi.mock('../utils/posthog', () => ({
  default: mockPostHog,
}));

// Mock Contexts
const mockAddToCart = vi.fn();
vi.mock('../context/CartContext', () => ({
  useCart: () => ({ addToCart: mockAddToCart }),
}));

vi.mock('../context/LocaleContext', () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));



describe('ProductActions Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockProduct = {
    id: 'prod_123',
    title: 'Test Towel',
    formattedPrice: '$25.00',
    images: ['image1.jpg'],
    colors: ['Cloud White', 'Sage'],
    disableEmbroidery: false,
    variants: [{ id: 'variant_1', title: 'Variant 1' }] // Added variants structure to match interface minimally
  };

  // Wrapper to handle authentic controlled state behavior
  const TestWrapper = () => {
    const [color, setColor] = useState('Cloud White');
    return (
      <ProductActions
        product={mockProduct}
        isOutOfStock={false}
        selectedVariant={{ id: 'variant_1' }}
        selectedColor={color}
        onColorChange={setColor}
      />
    );
  };

  it('should capture product_added_to_cart event when adding to cart', async () => {
    const user = userEvent.setup();
    render(<TestWrapper />);

    const addButton = screen.getByRole('button', { name: /product.add/i });
    await user.click(addButton);

    expect(mockAddToCart).toHaveBeenCalled();

    await waitFor(() => {
      expect(mockPostHog.capture).toHaveBeenCalledWith('product_added_to_cart', expect.objectContaining({
        product_id: mockProduct.id,
        product_name: mockProduct.title,
        product_price: mockProduct.formattedPrice,
        quantity: 1,
        color: 'Cloud White',
        variant_id: 'variant_1',
      }));
    });
  });

  it('should capture correct quantity and color', async () => {
    const user = userEvent.setup();
    render(<TestWrapper />);

    // Change Color
    const sageButton = screen.getByTitle('Sage');
    await user.click(sageButton);

    // Increase Quantity
    const plusButton = screen.getByRole('button', { name: /Increase quantity/i });
    await user.click(plusButton);

    // Add to Cart
    const addButton = screen.getByRole('button', { name: /product.add/i });
    await user.click(addButton);

    expect(mockPostHog.capture).toHaveBeenCalledWith('product_added_to_cart', expect.objectContaining({
        quantity: 2,
        color: 'Sage',
    }));
  });
});
