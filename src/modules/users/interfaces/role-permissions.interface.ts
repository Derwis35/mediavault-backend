export interface RolePermissions {
  canViewStreams: boolean;
  canManageDevices: boolean;
  canViewEvidences: boolean;
  canManageUsers: boolean;
  canConfigureWowza: boolean;
  canViewAuditLog: boolean;
}

export const DEFAULT_PERMISSIONS: Record<string, RolePermissions> = {
  admin: {
    canViewStreams: true,
    canManageDevices: true,
    canViewEvidences: true,
    canManageUsers: true,
    canConfigureWowza: true,
    canViewAuditLog: true,
  },
  supervisor: {
    canViewStreams: true,
    canManageDevices: true,
    canViewEvidences: true,
    canManageUsers: false,
    canConfigureWowza: false,
    canViewAuditLog: false,
  },
  operator: {
    canViewStreams: true,
    canManageDevices: true,
    canViewEvidences: false,
    canManageUsers: false,
    canConfigureWowza: false,
    canViewAuditLog: false,
  },
  viewer: {
    canViewStreams: true,
    canManageDevices: false,
    canViewEvidences: false,
    canManageUsers: false,
    canConfigureWowza: false,
    canViewAuditLog: false,
  },
};
