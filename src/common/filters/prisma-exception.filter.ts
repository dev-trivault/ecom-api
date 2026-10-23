import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

/**
 * Turns database errors that slip past service-level checks into clean HTTP errors,
 * so the UI never shows a raw Prisma message.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    const [status, message] = ((): [number, string] => {
      switch (exception.code) {
        case 'P2002': {
          const fields = uniqueFields(exception);
          return [
            HttpStatus.CONFLICT,
            fields.length ? `A record with this ${fields.join(', ')} already exists` : 'This record already exists',
          ];
        }
        case 'P2025':
          return [HttpStatus.NOT_FOUND, 'Record not found'];
        case 'P2003':
          return [HttpStatus.BAD_REQUEST, 'A related record does not exist'];
        default:
          this.logger.error(`Unhandled Prisma error ${exception.code}: ${exception.message}`);
          return [HttpStatus.INTERNAL_SERVER_ERROR, 'Something went wrong, please try again'];
      }
    })();

    response.status(status).json({ statusCode: status, message, error: HttpStatus[status] });
  }
}

function uniqueFields(exception: Prisma.PrismaClientKnownRequestError): string[] {
  const meta = exception.meta as Record<string, any> | undefined;
  const target = meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields;
  const fields: string[] = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
  // Depending on the driver, these are Prisma field names or snake_case column names.
  return fields.filter((f) => f !== 'organizationId' && f !== 'organization_id').map((f) => f.replaceAll('_', ' '));
}
