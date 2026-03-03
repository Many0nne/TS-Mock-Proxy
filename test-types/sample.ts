// @endpoint
export interface User {
  id: number;
  name: string;
  email: string;
}

// @endpoint
export interface Product {
  id: string;
  title: string;
  price: number;
}

// @endpoint
export interface Badge {
  /** @maxLength 10 */
  label: string;
  /** @min 1 @max 5 */
  level: number;
  /** @enum ACTIVE,INACTIVE,PENDING */
  status: string;
}
