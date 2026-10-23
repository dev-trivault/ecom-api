import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { DocumentStatus } from '../../generated/prisma/enums.js';
import { PaginationQueryDto } from './pagination.dto.js';

/** Shared list filters for documents (purchases, packing entries, returns). */
export class DocumentListQueryDto extends PaginationQueryDto {
  /** From date, inclusive (YYYY-MM-DD) */
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  /** To date, inclusive (YYYY-MM-DD) */
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;
}
