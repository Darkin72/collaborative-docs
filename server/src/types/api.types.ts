export interface User {
  id: string;
  username: string;
  displayName: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: User;
  error?: string;
}

export interface DocumentsResponse {
  success: boolean;
  documents?: any[];
  error?: string;
}
