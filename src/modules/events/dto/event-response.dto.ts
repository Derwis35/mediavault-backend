import { EventStatus } from '../entities/event.entity';

export interface StreamSummary {
  id: string;
  name: string;
  status: string;
  wowzaAppName: string;
}

export interface EventCreatedBy {
  id: string;
  firstName: string;
  lastName: string;
}

export interface EventResponseDto {
  id: string;
  title: string;
  description?: string;
  status: EventStatus;
  location?: string;
  metadata?: Record<string, unknown>;
  createdBy?: EventCreatedBy;
  streams: StreamSummary[];
  evidenceCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedEventsResponse {
  items: EventResponseDto[];
  total: number;
  page: number;
  limit: number;
}
