import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly service: CompaniesService) {}

  @Get()
  list(@Request() req: { user: { id: string } }) {
    return this.service.list(req.user.id);
  }

  @Get(':name/jobs')
  jobs(@Request() req: { user: { id: string } }, @Param('name') name: string) {
    return this.service.jobsFor(req.user.id, name);
  }
}
