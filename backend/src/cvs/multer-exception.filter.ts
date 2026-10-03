import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { MulterError } from 'multer';
import { Response } from 'express';

// Multer failures (e.g. LIMIT_FILE_SIZE) otherwise surface as opaque
// 500s; map them to a clear 400 the client can display.
@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const message =
      exception.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large'
        : 'Upload failed';
    res.status(400).json({ message });
  }
}
