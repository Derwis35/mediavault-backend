export interface ReportSummaryDto {
  totalUploaded: number;
  totalUploadedVideos: number;
  totalUploadedImages: number;
  totalAutoDeleted: number;
  totalAutoDeletedVideos: number;
  totalAutoDeletedImages: number;
  storageBytesFreed: string;
  storageCurrentBytes: string;
}

export interface ReportDeletedItemDto {
  id: string;
  evidenceId: string;
  fileName: string;
  fileType: string;
  clasificacionName: string;
  etiquetaName: string;
  retentionDays: number;
  expiresAt: string;
  deletedAt: string;
  fileSizeBytes: string;
}

export interface ReportActiveItemDto {
  id: string;
  fileName: string;
  fileType: string | null;
  etiquetaName: string | null;
  clasificacionName: string | null;
  clasificacionColor: string | null;
  expiresAt: string | null;
  diasRestantes: number | null;
  fileSizeBytes: string;
  createdAt: string;
}

export interface PaginatedReportResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
