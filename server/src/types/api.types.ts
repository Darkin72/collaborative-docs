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

export enum DocumentRole {
  OWNER = 'owner',
  EDITOR = 'editor',
  VIEWER = 'viewer',
  GUEST = 'guest'
}

export interface DocumentPermission {
  userId: string;
  role: DocumentRole;
}

export interface UpdateRoleRequest {
  documentId: string;
  username: string;
  role: DocumentRole;
}

export interface UpdateRoleResponse {
  success: boolean;
  error?: string;
}

export interface PermissionCheckResponse {
  success: boolean;
  role?: DocumentRole;
  canView?: boolean;
  canEdit?: boolean;
  error?: string;
}
