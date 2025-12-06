// @vitest-environment jsdom
import React from 'react';
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

// Mock simple components used inside
vi.mock('./EmbroideryCustomizer', () => ({
    EmbroideryCustomizer: () => <div data-testid="embroidery-customizer">Embroidery Customizer</div>
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
  };

  it('should capture product_added_to_cart event when adding to cart', async () => {
    const user = userEvent.setup();
    render(
      <ProductActions
        product={mockProduct}
        isOutOfStock={false}
        selectedVariant={{ id: 'variant_1' }}
      />
    );

    const addButton = screen.getByRole('button', { name: /product.add/i }); // t('product.add') returns key
    await user.click(addButton);

    expect(mockAddToCart).toHaveBeenCalled();

    await waitFor(() => {
      expect(mockPostHog.capture).toHaveBeenCalledWith('product_added_to_cart', expect.objectContaining({
        product_id: mockProduct.id,
        product_name: mockProduct.title,
        product_price: mockProduct.formattedPrice,
        quantity: 1,
        color: 'Cloud White', // Default selected
        has_embroidery: false,
        variant_id: 'variant_1',
      }));
    });
  });

  it('should capture correct quantity and color', async () => {
    const user = userEvent.setup();
    render(
      <ProductActions
        product={mockProduct}
        isOutOfStock={false}
        selectedVariant={{ id: 'variant_1' }}
      />
    );

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
