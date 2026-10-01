import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  create(@Request() req: any, @Body() body: any) {
    return this.jobsService.create(req.user.id, body);
  }

  @Get()
  findAll(@Request() req: any, @Query() query: any) {
    return this.jobsService.findAll(req.user.id, query);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.jobsService.findOne(req.user.id, id);
  }

  @Patch(':id')
  update(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.jobsService.update(req.user.id, id, body);
  }

  @Patch(':id/status')
  updateStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body('status') status: any,
  ) {
    return this.jobsService.updateStatus(req.user.id, id, status);
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.jobsService.remove(req.user.id, id);
  }
}
