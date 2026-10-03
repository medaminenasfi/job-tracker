import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { Response } from 'express';
import { CvsService, cvMaxBytes } from './cvs.service';
import { MulterExceptionFilter } from './multer-exception.filter';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@UseFilters(new MulterExceptionFilter())
@Controller('cvs')
export class CvsController {
  constructor(private readonly cvsService: CvsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: cvMaxBytes() } }),
  )
  create(
    @Request() req: { user: { id: string } },
    @UploadedFile() file: Express.Multer.File,
    // The label travels as a multipart form field alongside the file.
    @Body('label') label: string,
  ) {
    return this.cvsService.upload(req.user.id, file, label);
  }

  @Get()
  findAll(@Request() req: { user: { id: string } }) {
    return this.cvsService.findAll(req.user.id);
  }

  @Patch(':id')
  update(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.cvsService.update(req.user.id, id, body);
  }

  @Delete(':id')
  remove(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.cvsService.remove(req.user.id, id);
  }

  @Post(':id/parse')
  parse(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('method') method: string,
  ) {
    return this.cvsService.parseCv(req.user.id, id, method);
  }

  @Get(':id/file')
  async download(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    // Ownership-checked: throws 404 for missing rows or other users' CVs.
    await this.cvsService.findOne(req.user.id, id);
    // The storage name is <id>.<kind>; try both extensions.
    for (const ext of ['pdf', 'docx']) {
      const filePath = join(this.cvsService.uploadsDir, `${id}.${ext}`);
      if (existsSync(filePath)) {
        res.setHeader(
          'Content-Type',
          ext === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="cv-${id}.${ext}"`,
        );
        createReadStream(filePath).pipe(res);
        return;
      }
    }
    res.status(404).json({ message: 'File not found' });
  }
}
