interface SeedProduct {
  handle: string;
  title: string;
  images?: { url: string }[];
  metadata?: Record<string, unknown>;
  collection_id?: string | null;
}

interface ExistingProduct {
  id: string;
  handle: string;
  title?: string | null;
  collection_id?: string | null;
}

export function buildProductUpdate(
  existingProduct: ExistingProduct,
  productsToCreate: SeedProduct[]
): Partial<SeedProduct> {
  const targetProduct = productsToCreate.find(
    (product) => product.handle === existingProduct.handle
  );

  if (!targetProduct) {
    return {};
  }

  const update: Partial<SeedProduct> = {};

  if (targetProduct.title && targetProduct.title !== existingProduct.title) {
    update.title = targetProduct.title;
  }

  if (targetProduct.images) {
    update.images = targetProduct.images;
  }

  if (targetProduct.metadata) {
    update.metadata = targetProduct.metadata;
  }

  if (
    targetProduct.collection_id &&
    targetProduct.collection_id !== existingProduct.collection_id
  ) {
    update.collection_id = targetProduct.collection_id;
  }

  return update;
}
