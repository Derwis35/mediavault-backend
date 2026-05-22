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
  idType?: string | null;
  idNumber?: string | null;
  cargo?: string | null;
  zoneId?: string | null;
  quadrantId?: string | null;
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
