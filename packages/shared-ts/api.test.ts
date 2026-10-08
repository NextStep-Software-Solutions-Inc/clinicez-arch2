import { describe, expect, it } from 'bun:test';
import { ApiError, extractApiError } from './api';

describe('extractApiError', () => {
  it('passes through an existing ApiError without modification', () => {
    const existing = new ApiError('Existing error', 400);
    const result = extractApiError(existing);
    expect(result).toBe(existing);
  });

  it('unpacks ASP.NET Core RFC 7807/9110 ValidationProblemDetails with enum conversion failure', () => {
    const rfcError = {
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: {
          type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
          title: 'One or more validation errors occurred.',
          status: 400,
          errors: {
            command: ['The command field is required.'],
            '$.role': [
              'The JSON value could not be converted to ClinicEz.Clinic.Domain.Enums.StaffRole. Path: $.role | LineNumber: 0 | BytePositionInLine: 35.',
            ],
          },
          traceId: '00-trace-01',
        },
      },
    };

    const result = extractApiError(rfcError);

    expect(result.status).toBe(400);
    // Should filter out the redundant command wrapper and surface the informative role conversion message
    expect(result.message).toContain('The JSON value could not be converted to ClinicEz.Clinic.Domain.Enums.StaffRole');
    expect(result.message).not.toContain('The command field is required');
    expect(result.errors.length).toBe(2);
    expect(result.errors.find((e) => e.field === 'role')?.message).toContain('StaffRole');
  });

  it('unpacks standard ApiResponse envelope failure with specific message and field errors', () => {
    const apiError = {
      response: {
        status: 422,
        data: {
          succeeded: false,
          message: 'PRC License Number is mandatory for Doctors.',
          data: null,
          errors: [
            {
              field: 'PrcLicenseNumber',
              code: 'VALIDATION_ERROR',
              message: 'PRC License Number is mandatory for Doctors.',
            },
          ],
        },
      },
    };

    const result = extractApiError(apiError);

    expect(result.status).toBe(422);
    expect(result.message).toBe('PRC License Number is mandatory for Doctors.');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('PrcLicenseNumber');
    expect(result.errors[0].message).toBe('PRC License Number is mandatory for Doctors.');
  });

  it('extracts detail or title from RFC ProblemDetails when message is absent', () => {
    const problemDetails = {
      response: {
        status: 403,
        data: {
          type: 'https://tools.ietf.org/html/rfc9110#section-15.5.4',
          title: 'Forbidden',
          status: 403,
          detail: 'You do not have permission to manage clinic staff.',
        },
      },
    };

    const result = extractApiError(problemDetails);

    expect(result.status).toBe(403);
    expect(result.message).toBe('You do not have permission to manage clinic staff.');
  });

  it('translates network or connection failures to user-friendly offline message', () => {
    const networkError = {
      message: 'Network Error',
      response: undefined,
    };

    const result = extractApiError(networkError);

    expect(result.status).toBe(0);
    expect(result.message).toBe('Cannot reach the clinic server. Check your connection and the server address.');
  });

  it('handles string payload responses gracefully', () => {
    const rawStringError = {
      response: {
        status: 502,
        data: 'Bad Gateway: upstream clinic server unreachable',
      },
    };

    const result = extractApiError(rawStringError);

    expect(result.status).toBe(502);
    expect(result.message).toBe('Bad Gateway: upstream clinic server unreachable');
  });
});
