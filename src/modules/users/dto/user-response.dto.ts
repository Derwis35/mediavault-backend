export interface RoleDto {
  id: string;
  name: string;
  description?: string;
}

export interface UserResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role?: RoleDto;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  activeSessionsCount?: number;
}

export interface PaginatedUsersResponse {
  items: UserResponseDto[];
  total: number;
  page: number;
  limit: number;
}
