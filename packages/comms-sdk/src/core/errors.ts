export class CommsError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'CommsError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConnectionError extends CommsError {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message, 'CONNECTION_ERROR');
    this.name = 'ConnectionError';
  }
}

export class TicketExpiredError extends CommsError {
  constructor(message: string = 'Staff comms ticket has expired') {
    super(message, 'TICKET_EXPIRED');
    this.name = 'TicketExpiredError';
  }
}

export class DeliveryTimeoutError extends CommsError {
  constructor(message: string = 'Message delivery unconfirmed within retention window') {
    super(message, 'DELIVERY_TIMEOUT');
    this.name = 'DeliveryTimeoutError';
  }
}

export class AttachmentValidationError extends CommsError {
  constructor(message: string) {
    super(message, 'ATTACHMENT_VALIDATION_FAILED');
    this.name = 'AttachmentValidationError';
  }
}

export { AttachmentValidationError as AttachmentError };
