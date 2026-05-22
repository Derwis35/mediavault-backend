import { IsBoolean } from 'class-validator';
import { RolePermissions } from '../interfaces/role-permissions.interface';

export class UpdatePermissionsDto implements RolePermissions {
  @IsBoolean()
  canViewStreams!: boolean;

  @IsBoolean()
  canManageDevices!: boolean;

  @IsBoolean()
  canViewEvidences!: boolean;

  @IsBoolean()
  canManageUsers!: boolean;

  @IsBoolean()
  canConfigureWowza!: boolean;

  @IsBoolean()
  canViewAuditLog!: boolean;

  @IsBoolean()
  canDownloadReports!: boolean;

  @IsBoolean()
  canManagePermissions!: boolean;
}
