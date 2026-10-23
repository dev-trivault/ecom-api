import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PaginationQueryDto {
  /** 1-based page number */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  /** Rows per page (max 100) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  /** Free-text search */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function pageArgs(query: PaginationQueryDto) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function paginated<T>(items: T[], total: number, query: PaginationQueryDto): Paginated<T> {
  return { items, total, page: query.page, pageSize: query.pageSize };
}
