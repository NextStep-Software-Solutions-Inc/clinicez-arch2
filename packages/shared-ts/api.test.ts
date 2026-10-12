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

describe('ApiError class', () => {
  it('constructor sets status, message, and defaults errorCode and traceId to undefined', () => {
    const error = new ApiError('Default error', 400);
    expect(error.message).toBe('Default error');
    expect(error.status).toBe(400);
    expect(error.errorCode).toBeUndefined();
    expect(error.traceId).toBeUndefined();
    expect(error.errors).toHaveLength(1);
    expect(error.errors[0]).toEqual({ field: null, code: 'API_ERROR', message: 'Default error' });
  });

  it('constructor sets errorCode and traceId when provided', () => {
    const error = new ApiError(
      'Duplicate resource',
      409,
      [{ field: 'patientCode', code: 'DUPLICATE_RESOURCE', message: 'Patient code exists' }],
      'DUPLICATE_RESOURCE',
      '00-trace-abc-01'
    );
    expect(error.message).toBe('Duplicate resource');
    expect(error.status).toBe(409);
    expect(error.errorCode).toBe('DUPLICATE_RESOURCE');
    expect(error.traceId).toBe('00-trace-abc-01');
    expect(error.errors).toHaveLength(1);
    expect(error.errors[0].field).toBe('patientCode');
  });

  it('constructor uses errorCode as fallback code for default error entry when errors array is empty', () => {
    const error = new ApiError('Not found', 404, [], 'NOT_FOUND', 'trace-999');
    expect(error.errorCode).toBe('NOT_FOUND');
    expect(error.traceId).toBe('trace-999');
    expect(error.errors).toHaveLength(1);
    expect(error.errors[0]).toEqual({ field: null, code: 'NOT_FOUND', message: 'Not found' });
  });

  describe('field error helper methods', () => {
    const error = new ApiError('Validation failure', 400, [
      { field: 'PatientCode', code: 'DUPLICATE', message: 'Patient code is already taken' },
      { field: 'patientCode', code: 'FORMAT', message: 'Must match PAT-YYYY-XXXX format' },
      { field: '$.chiefComplaint', code: 'MAX_LENGTH', message: 'Chief complaint exceeds 255 characters' },
      { field: 'contactNumber', code: 'REQUIRED', message: 'Phone number is required' },
    ]);

    it('getFieldErrors returns all matching messages case-insensitively', () => {
      const messages = error.getFieldErrors('patientCode');
      expect(messages).toEqual([
        'Patient code is already taken',
        'Must match PAT-YYYY-XXXX format',
      ]);

      const uppercaseQuery = error.getFieldErrors('PATIENTCODE');
      expect(uppercaseQuery).toEqual([
        'Patient code is already taken',
        'Must match PAT-YYYY-XXXX format',
      ]);
    });

    it('getFieldErrors strips JSON path prefix ($.)', () => {
      const messages = error.getFieldErrors('chiefComplaint');
      expect(messages).toEqual(['Chief complaint exceeds 255 characters']);

      const queryWithPath = error.getFieldErrors('$.chiefComplaint');
      expect(queryWithPath).toEqual(['Chief complaint exceeds 255 characters']);
    });

    it('getFieldErrors returns empty array for non-matching fields or empty inputs', () => {
      expect(error.getFieldErrors('nonExistentField')).toEqual([]);
      expect(error.getFieldErrors('')).toEqual([]);
      // @ts-expect-error test undefined/null safety
      expect(error.getFieldErrors(null)).toEqual([]);
    });

    it('getFieldError returns first error message or undefined', () => {
      expect(error.getFieldError('patientCode')).toBe('Patient code is already taken');
      expect(error.getFieldError('contactNumber')).toBe('Phone number is required');
      expect(error.getFieldError('nonExistentField')).toBeUndefined();
    });

    it('hasFieldError returns true for existing field and false for absent field', () => {
      expect(error.hasFieldError('patientCode')).toBe(true);
      expect(error.hasFieldError('ChiefComplaint')).toBe(true);
      expect(error.hasFieldError('contactNumber')).toBe(true);
      expect(error.hasFieldError('unknownField')).toBe(false);
    });

    it('getFieldErrorsMap returns camelCase normalized dictionary of first field errors', () => {
      const map = error.getFieldErrorsMap();
      expect(map).toEqual({
        patientCode: 'Patient code is already taken',
        chiefComplaint: 'Chief complaint exceeds 255 characters',
        contactNumber: 'Phone number is required',
      });
    });
  });
});

describe('extractApiError with structured responses and safety net', () => {
  it('extracts errorCode and traceId from structured backend responses', () => {
    const error = {
      response: {
        status: 409,
        data: {
          succeeded: false,
          errorCode: 'DUPLICATE_RESOURCE',
          message: 'Patient code already exists in clinic records',
          traceId: '00-trace-dup-456',
          errors: [
            { field: 'patientCode', code: 'DUPLICATE_RESOURCE', message: 'Code already assigned' },
          ],
        },
      },
    };

    const result = extractApiError(error);
    expect(result.status).toBe(409);
    expect(result.errorCode).toBe('DUPLICATE_RESOURCE');
    expect(result.traceId).toBe('00-trace-dup-456');
    expect(result.message).toBe('Patient code already exists in clinic records');
    expect(result.getFieldErrors('patientCode')).toEqual(['Code already assigned']);
  });

  it('extracts errorCode from code or title property if errorCode is not present', () => {
    const codeError = {
      response: {
        status: 400,
        data: {
          code: 'FIELD_TOO_LONG',
          message: 'Field exceeds maximum permitted length',
        },
      },
    };
    const resCode = extractApiError(codeError);
    expect(resCode.errorCode).toBe('FIELD_TOO_LONG');

    const titleError = {
      response: {
        status: 403,
        data: {
          title: 'FORBIDDEN_ACCESS',
          detail: 'Access denied to this resource',
        },
      },
    };
    const resTitle = extractApiError(titleError);
    expect(resTitle.errorCode).toBe('FORBIDDEN_ACCESS');
  });

  it('extracts traceId from HTTP response headers (x-trace-id) when absent from body', () => {
    const error = {
      response: {
        status: 500,
        headers: {
          'x-trace-id': 'header-trace-789',
        },
        data: {
          message: 'Internal server error occurred',
        },
      },
    };

    const result = extractApiError(error);
    expect(result.traceId).toBe('header-trace-789');
    expect(result.message).toBe('Internal server error occurred');
  });

  it('extracts traceId from HTTP headers with .get() method (AxiosHeaders / Fetch Headers)', () => {
    const mockHeaders = new Map([['x-trace-id', 'get-header-trace-321']]);
    const error = {
      response: {
        status: 500,
        headers: {
          get: (key: string) => mockHeaders.get(key.toLowerCase()) || null,
        },
        data: {
          message: 'Server error',
        },
      },
    };

    const result = extractApiError(error);
    expect(result.traceId).toBe('get-header-trace-321');
  });

  it('extracts traceId from traceparent header if x-trace-id is absent', () => {
    const error = {
      response: {
        status: 500,
        headers: {
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        },
        data: {
          message: 'Server failure',
        },
      },
    };

    const result = extractApiError(error);
    expect(result.traceId).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
  });

  describe('Client-Side Safety Net', () => {
    it('intercepts EF Core "An error occurred while saving the entity changes" with traceId', () => {
      const rawOrmError = {
        response: {
          status: 500,
          data: {
            succeeded: false,
            message: 'An error occurred while saving the entity changes. See the inner exception for details.',
            traceId: '00-trace-db-001',
          },
        },
      };

      const result = extractApiError(rawOrmError);
      expect(result.message).toBe(
        'A database error occurred while saving changes. Please contact support with reference ID: 00-trace-db-001'
      );
      expect(result.errorCode).toBe('DATABASE_ERROR');
      expect(result.traceId).toBe('00-trace-db-001');
    });

    it('intercepts EF Core leak with fallback reference ID "N/A" when traceId is absent', () => {
      const rawOrmError = {
        response: {
          status: 500,
          data: {
            message: 'An error occurred while saving the entity changes. See the inner exception for details.',
          },
        },
      };

      const result = extractApiError(rawOrmError);
      expect(result.message).toBe(
        'A database error occurred while saving changes. Please contact support with reference ID: N/A'
      );
      expect(result.errorCode).toBe('DATABASE_ERROR');
      expect(result.traceId).toBeUndefined();
    });

    it('intercepts unhandled PostgreSQL exception strings and stack traces', () => {
      const npgsqlLeak = {
        response: {
          status: 500,
          data: 'Npgsql.PostgresException (0x80004005): 23505: duplicate key value violates unique constraint "IX_ClinicPatients_ClinicId_PatientCode"',
          headers: {
            'x-trace-id': 'trace-npgsql-99',
          },
        },
      };

      const result = extractApiError(npgsqlLeak);
      expect(result.message).toBe(
        'A database error occurred while saving changes. Please contact support with reference ID: trace-npgsql-99'
      );
      expect(result.errorCode).toBe('DATABASE_ERROR');
      expect(result.traceId).toBe('trace-npgsql-99');
    });

    it('preserves existing errorCode when sanitizing ORM leak if errorCode was provided', () => {
      const errorWithCode = {
        response: {
          status: 500,
          data: {
            errorCode: 'PERSISTENCE_FAILURE',
            message: 'See the inner exception for details.',
            traceId: 'trace-exist-code',
          },
        },
      };

      const result = extractApiError(errorWithCode);
      expect(result.message).toBe(
        'A database error occurred while saving changes. Please contact support with reference ID: trace-exist-code'
      );
      expect(result.errorCode).toBe('PERSISTENCE_FAILURE');
    });

    it('does NOT alter normal user-facing or validation error messages', () => {
      const validError = {
        response: {
          status: 400,
          data: {
            errorCode: 'VALIDATION_ERROR',
            message: 'First name, last name, and date of birth are required.',
            traceId: 'trace-clean-1',
          },
        },
      };

      const result = extractApiError(validError);
      expect(result.message).toBe('First name, last name, and date of birth are required.');
      expect(result.errorCode).toBe('VALIDATION_ERROR');
      expect(result.traceId).toBe('trace-clean-1');
    });
  });
});

