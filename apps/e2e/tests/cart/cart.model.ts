export interface CartItem {
  variant_id: string;
  quantity: number;
  unit_price: number;
}

export interface CartState {
  items: CartItem[];
}

// Cart operation types imported here for type safety if needed,
// but circular dependency with arbitraries if we import full type from there?
// We defined CartOperation type in arbitraries.ts. Let's redefine or import it.
// To avoid circular dependency issues (though type import is usually fine), I'll redefine or move types to a shared file.
// For simplicity, I will copy the type definition here as it is small.

export type CartOperation =
  | { type: 'add'; item: { variant_id: string; quantity: number; unit_price: number } }
  | { type: 'update'; index: number; quantity: number }
  | { type: 'remove'; index: number };

/**
 * Apply a cart operation to the state
 */
export function applyOperation(
  state: CartState,
  operation: CartOperation
): CartState {
  const items = [...state.items];

  switch (operation.type) {
    case 'add':
      // Check if item already exists
      const existingIndex = items.findIndex(
        i => i.variant_id === operation.item.variant_id
      );
      if (existingIndex >= 0) {
        items[existingIndex] = {
          ...items[existingIndex],
          quantity: items[existingIndex].quantity + operation.item.quantity,
        };
      } else {
        items.push(operation.item);
      }
      break;

    case 'update':
      if (operation.index < items.length) {
        items[operation.index] = {
          ...items[operation.index],
          quantity: operation.quantity,
        };
      }
      break;

    case 'remove':
      if (operation.index < items.length) {
        items.splice(operation.index, 1);
      }
      break;
  }

  return { items };
}

/**
 * Calculate cart total from items
 */
export function calculateCartTotal(items: CartItem[]): number {
  return items.reduce(
    (sum, item) => sum + (item.unit_price * item.quantity),
    0
  );
}

/**
 * Apply a sequence of operations and return final state
 */
export function applyOperations(
  operations: CartOperation[]
): CartState {
  return operations.reduce(
    (state, op) => applyOperation(state, op),
    { items: [] }
  );
}
