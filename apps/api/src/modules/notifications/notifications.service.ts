import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly db: DatabaseService) {}

  async dispatchNotification(recipientId: string, channel: string, message: string) {
    this.logger.log(`Dispatching notification to ${recipientId} via ${channel}`);
    return { dispatched: true };
  }
}
