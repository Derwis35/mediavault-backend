export interface RolePermissions {
  canViewStreams: boolean;
  canManageDevices: boolean;
  canViewEvidences: boolean;
  canManageUsers: boolean;
  canConfigureWowza: boolean;
  canViewAuditLog: boolean;
  canDownloadReports: boolean;
  canManagePermissions: boolean;
}

export const DEFAULT_PERMISSIONS: Record<string, RolePermissions> = {
  admin: {
    canViewStreams: true,
    canManageDevices: true,
    canViewEvidences: true,
    canManageUsers: true,
    canConfigureWowza: true,
    canViewAuditLog: true,
    canDownloadReports: true,
    canManagePermissions: true,
  },
  superadmin: {
    canViewStreams: true,
    canManageDevices: true,
    canViewEvidences: true,
    canManageUsers: true,
    canConfigureWowza: true,
    canViewAuditLog: true,
    canDownloadReports: true,
    canManagePermissions: true,
  },
  supervisor: {
    canViewStreams: true,
    canManageDevices: true,
    canViewEvidences: true,
    canManageUsers: false,
    canConfigureWowza: false,
    canViewAuditLog: false,
    canDownloadReports: false,
    canManagePermissions: false,
  },
  operator: {
    canViewStreams: true,
    canManageDevices: true,
    canViewEvidences: false,
    canManageUsers: false,
    canConfigureWowza: false,
    canViewAuditLog: false,
    canDownloadReports: false,
    canManagePermissions: false,
  },
  viewer: {
    canViewStreams: true,
    canManageDevices: false,
    canViewEvidences: false,
    canManageUsers: false,
    canConfigureWowza: false,
    canViewAuditLog: false,
    canDownloadReports: false,
    canManagePermissions: false,
  },
};
