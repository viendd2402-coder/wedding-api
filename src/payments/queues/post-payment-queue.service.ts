import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  POST_PAYMENT_JOB_PROVISION_INVITATION_RESOURCES,
  POST_PAYMENT_QUEUE_NAME,
} from './post-payment.queue';

@Injectable()
export class PostPaymentQueueService {
  constructor(
    @InjectQueue(POST_PAYMENT_QUEUE_NAME)
    private readonly postPaymentQueue: Queue,
  ) {}

  async enqueueProvisionInvitationResources(
    invitationDetailsId: number,
  ): Promise<void> {
    await this.postPaymentQueue.add(
      POST_PAYMENT_JOB_PROVISION_INVITATION_RESOURCES,
      { invitationDetailsId },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
        removeOnComplete: true,
      },
    );
  }
}
