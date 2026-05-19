import { EvidenceType } from '../entities/evidence.entity';

export interface EvidenceResponseDto {
  id: string;
  type: EvidenceType;
  streamId?: string;
  streamName?: string;
  eventId?: string;
  uploadedById?: string;
  uploadedByName?: string;
  hashSha256: string;
  fileSizeBytes: string;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
  recordedAt?: string;
  createdAt: string;
  integrityStatus: 'pending' | 'verified' | 'failed' | 'unknown';
  downloadUrl?: string;
}

export interface IntegrityVerificationResult {
  isValid: boolean;
  computedHash: string;
  expectedHash: string;
  verifiedAt: string;
}

export interface SnapshotCreateDto {
  streamId: string;
  imageBase64: string;
  metadata?: {
    cameraName?: string;
    location?: string;
    operator?: string;
    notes?: string;
    [key: string]: unknown;
  };
}

export interface PaginatedEvidencesResponse {
  data: EvidenceResponseDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
