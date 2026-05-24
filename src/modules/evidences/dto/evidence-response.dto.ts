import { EvidenceFileType, EvidenceType } from '../entities/evidence.entity';

export interface EtiquetaInEvidence {
  id: string;
  name: string;
  clasificacion: {
    id: string;
    name: string;
    color: string;
    retentionDays: number | null;
  };
}

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
  etiquetaId?: string | null;
  etiqueta?: EtiquetaInEvidence | null;
  etiquetaAssignedAt?: string | null;
  expiresAt?: string | null;
  fileType?: EvidenceFileType | null;
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
