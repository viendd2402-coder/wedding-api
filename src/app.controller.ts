import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      message: 'Wedding API is running',
      docs: '/api/health',
    };
  }
}
