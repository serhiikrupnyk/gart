import type {
  CreateProductRequest,
  ProductStatusFilter,
  PublicProduct,
  UpdateProductRequest,
} from '@gart/shared';

import { apiFetch } from './api';

export async function listProducts(status: ProductStatusFilter): Promise<PublicProduct[]> {
  return apiFetch<PublicProduct[]>(`/products?status=${status}`);
}

export async function createProduct(body: CreateProductRequest): Promise<PublicProduct> {
  return apiFetch<PublicProduct>('/products', { method: 'POST', body: JSON.stringify(body) });
}

export async function updateProduct(
  id: string,
  body: UpdateProductRequest,
): Promise<PublicProduct> {
  return apiFetch<PublicProduct>(`/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteProduct(id: string): Promise<void> {
  await apiFetch<void>(`/products/${id}`, { method: 'DELETE' });
}
