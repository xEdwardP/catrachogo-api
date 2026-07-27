import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let extra: Record<string, unknown> = {};
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const bodyRecord = body as Record<string, unknown>;
        message =
          (bodyRecord.message as string | string[] | undefined) ??
          exception.message;
        // Preserve extra machine-readable fields (e.g. `code`) that a
        // service may attach to an HttpException response body.
        extra = { ...bodyRecord };
        delete extra.message;
        delete extra.statusCode;
        delete extra.error;
      }
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    response.status(status).json({
      ...extra,
      statusCode: status,
      message,
      error: HttpStatus[status],
    });
  }
}
