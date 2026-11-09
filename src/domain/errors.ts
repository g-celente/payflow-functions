// Why a dependency (merchant-service or the store's webhook URL) gave no usable answer.
export type DependencyFailure = 'timeout' | 'unreachable' | 'bad-response' | 'rejected';

// A delivery step failed in a way that may pass on a new attempt. deliver-webhook lets it escape, so the
// Service Bus delivers the message again; after MaxDeliveryCount (5) it goes to the dead-letter queue.
export class DependencyUnavailableError extends Error {
  constructor(
    readonly dependency: string,
    readonly reason: DependencyFailure,
    message: string,
  ) {
    super(message);
    this.name = 'DependencyUnavailableError';
  }
}

// The message is not a payment event this Function understands. Retrying cannot fix it, but it still
// fails the invocation so the message ends in the dead-letter queue, where it can be inspected.
export class InvalidEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEventError';
  }
}
