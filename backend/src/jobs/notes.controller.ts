import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { NotesService } from './notes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('jobs/:jobId/notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  findAll(@Request() req: any, @Param('jobId') jobId: string) {
    return this.notesService.findAll(req.user.id, jobId);
  }

  @Post()
  create(
    @Request() req: any,
    @Param('jobId') jobId: string,
    @Body() body: any,
  ) {
    return this.notesService.create(req.user.id, jobId, body);
  }

  @Patch(':noteId')
  update(
    @Request() req: any,
    @Param('jobId') jobId: string,
    @Param('noteId') noteId: string,
    @Body() body: any,
  ) {
    return this.notesService.update(req.user.id, jobId, noteId, body);
  }

  @Delete(':noteId')
  remove(
    @Request() req: any,
    @Param('jobId') jobId: string,
    @Param('noteId') noteId: string,
  ) {
    return this.notesService.remove(req.user.id, jobId, noteId);
  }
}
