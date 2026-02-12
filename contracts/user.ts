/**
 * Exemple de contrat utilisateur
 */
export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  isActive: boolean;
  createdAt: string;
}

/**
 * Exemple de contrat produit
 */
export interface Product {
  id: number;
  title: string;
  description: string;
  price: number;
  inStock: boolean;
  category: string;
  tags: string[];
}

/**
 * Exemple de contrat avec types imbriqués
 */
export interface Order {
  id: number;
  userId: number;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: string;
  shippingAddress: Address;
}

export interface OrderItem {
  productId: number;
  quantity: number;
  price: number;
}

export interface Address {
  street: string;
  city: string;
  zipCode: number;
  country: string;
}