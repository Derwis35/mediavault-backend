import { WowzaServer } from '../entities/wowza-server.entity';

export class WowzaServerResponseDto {
  id!: string;
  name!: string;
  ip!: string;
  portStream!: number;
  portHls!: number;
  portApi!: number;
  appName!: string;
  apiUser!: string;
  go2rtcUrl?: string;
  isDefault!: boolean;
  isActive!: boolean;
  lastTestedAt?: Date;
  lastTestOk?: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(e: WowzaServer): WowzaServerResponseDto {
    const dto = new WowzaServerResponseDto();
    dto.id = e.id;
    dto.name = e.name;
    dto.ip = e.ip;
    dto.portStream = e.portStream;
    dto.portHls = e.portHls;
    dto.portApi = e.portApi;
    dto.appName = e.appName;
    dto.apiUser = e.apiUser;
    // apiPassword is intentionally excluded from responses
    dto.go2rtcUrl = e.go2rtcUrl;
    dto.isDefault = e.isDefault;
    dto.isActive = e.isActive;
    dto.lastTestedAt = e.lastTestedAt;
    dto.lastTestOk = e.lastTestOk;
    dto.createdAt = e.createdAt;
    dto.updatedAt = e.updatedAt;
    return dto;
  }
}
