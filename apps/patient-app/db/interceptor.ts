import { syncQueue } from './schema/syncQueue';
import { randomUUID } from 'expo-crypto';
import { toBackendBloodType } from '../services/api/patientApi';

export const TABLE_TO_ENTITY_TYPE: Record<string, string> = {
  patients: 'patient',
  patient_government_ids: 'patient_government_ids',
  patient_addresses: 'patient_addresses',
  emergency_contacts: 'emergency_contacts',
  patient_healthcare_providers: 'patient_healthcare_providers',
  patient_allergies: 'patient_allergies',
  patient_medications: 'patient_medications',
  patient_surgical_history: 'patient_surgical_history',
  patient_past_illnesses: 'patient_past_illnesses',
  patient_chronic_conditions: 'patient_chronic_conditions',
  patient_disabilities: 'patient_disabilities',
  patient_immunizations_self: 'patient_immunizations_self',
  patient_social_history: 'patient_social_history',
  patient_family_history: 'patient_family_history',
  patient_occupation: 'patient_occupation',
  patient_travel_history: 'patient_travel_history',
  patient_obstetric_profile: 'patient_obstetric_profile',
  patient_pregnancies: 'patient_pregnancies',
  patient_contraceptive_history: 'patient_contraceptive_history',
  patient_male_reproductive: 'patient_male_reproductive',
  patient_dental_vision: 'patient_dental_vision',
  patient_mental_health_profile: 'patient_mental_health_profile',
  patient_ncd_questionnaire: 'patient_ncd_questionnaire',
};

let globalSyncTrigger: (() => void) | null = null;
export function registerSyncTrigger(trigger: (() => void) | null) {
  globalSyncTrigger = trigger;
}

function extractIdFromCondition(cond: any): string | null {
  if (!cond || !Array.isArray(cond.queryChunks)) return null;
  const paramChunk = cond.queryChunks.find((chunk: any) => chunk && chunk.constructor && chunk.constructor.name === 'Param');
  if (paramChunk && paramChunk.value) {
    return String(paramChunk.value);
  }
  for (const chunk of cond.queryChunks) {
    if (chunk && chunk.value !== undefined && typeof chunk.value === 'string') {
      return chunk.value;
    }
  }
  return null;
}

async function handleInterceptWrite(
  originalDb: any,
  tableName: string,
  operation: 'create' | 'update' | 'delete',
  values: any,
  condition?: any
) {
  const entityType = TABLE_TO_ENTITY_TYPE[tableName];
  if (!entityType) return;

  let entityId = values?.id || values?.clientId;

  if (!entityId && condition) {
    entityId = extractIdFromCondition(condition);
  }

  if (!entityId) {
    if (tableName === 'patients') {
      entityId = values?.id || (condition ? extractIdFromCondition(condition) : null);
    } else {
      entityId = values?.patientId || (condition ? extractIdFromCondition(condition) : null);
    }
  }

  if (!entityId) {
    console.warn(`[DB Interceptor] Could not extract entityId for table ${tableName}, operation ${operation}`);
    return;
  }

  try {
    const now = new Date();
    const effectiveOperation = values?.deletedAt ? 'delete' : operation;
    const syncPayload: Record<string, any> = {
      ...values,
      clientId: entityId,
      updatedAt: now.toISOString(),
    };

    if (tableName === 'patient_government_ids') {
      const targetPatientId = values?.patientId || extractIdFromCondition(condition) || entityId;
      let idMap: Record<string, { id: string; clientId: string }> = {};
      try {
        let mapStr = values?.serverId;
        if (!mapStr && originalDb.query?.patientGovernmentIds?.findFirst) {
          const existingRow = await originalDb.query.patientGovernmentIds.findFirst({
            where: (t: any, { eq }: any) => eq(t.patientId, targetPatientId),
          });
          mapStr = existingRow?.serverId;
        }
        if (mapStr) {
          idMap = typeof mapStr === 'string' ? JSON.parse(mapStr) : mapStr;
        }
      } catch (err) {
        console.warn('[DB Interceptor] Failed to read existing serverId map for government IDs:', err);
      }

      const idDefs: Array<{
        idType: 'PhilHealth' | 'SSS' | 'GSIS' | 'PagIbig' | 'TIN' | 'SeniorCitizen' | 'PWD' | 'HMO';
        idNumber: string | null | undefined;
        extra?: Record<string, any>;
      }> = [
        {
          idType: 'PhilHealth',
          idNumber: values.philhealthId,
          extra: {
            philhealthCategory: values.philhealthCategory || null,
            sponsorPin: values.sponsorPin || null,
            sponsorLastName: values.sponsorLastName || null,
            sponsorFirstName: values.sponsorFirstName || null,
            sponsorMiddleName: values.sponsorMiddleName || null,
            sponsorSuffix: values.sponsorSuffix || null,
            sponsorDob: values.sponsorDob || null,
            sponsorRelationship: values.sponsorRelationship || null,
          },
        },
        { idType: 'SSS', idNumber: values.sssNumber },
        { idType: 'GSIS', idNumber: values.gsisNumber },
        { idType: 'PagIbig', idNumber: values.pagibigId },
        { idType: 'TIN', idNumber: values.tin },
        { idType: 'SeniorCitizen', idNumber: values.seniorCitizenId },
        { idType: 'PWD', idNumber: values.pwdIdNumber },
        { idType: 'HMO', idNumber: values.hmoPolicyNumber },
      ];

      let queuedCount = 0;
      for (const def of idDefs) {
        const existingServer = idMap[def.idType] || idMap[def.idType.toLowerCase()];
        const trimmedNumber = typeof def.idNumber === 'string' ? def.idNumber.trim() : (def.idNumber ? String(def.idNumber) : '');

        if (trimmedNumber) {
          const isUpdate = Boolean(existingServer?.id);
          const itemPayload = {
            patientId: targetPatientId,
            idType: def.idType,
            idNumber: trimmedNumber,
            clientId: existingServer?.clientId || randomUUID(),
            updatedAt: now.toISOString(),
            ...(def.extra || {}),
          };

          const syncItem = {
            id: randomUUID(),
            entityType: 'patient_government_ids' as const,
            entityId: existingServer?.id || itemPayload.clientId,
            operation: isUpdate ? ('update' as const) : ('create' as const),
            payloadJson: JSON.stringify(itemPayload),
            status: 'pending' as const,
            retryCount: 0,
            createdAt: now,
          };
          await originalDb.insert(syncQueue).values(syncItem);
          queuedCount++;
        } else if (existingServer?.id) {
          const syncItem = {
            id: randomUUID(),
            entityType: 'patient_government_ids' as const,
            entityId: existingServer.id,
            operation: 'delete' as const,
            payloadJson: null,
            status: 'pending' as const,
            retryCount: 0,
            createdAt: now,
          };
          await originalDb.insert(syncQueue).values(syncItem);
          queuedCount++;
        }
      }

      console.log(`[DB Interceptor] Successfully queued ${queuedCount} typed items for patient_government_ids (${targetPatientId})`);
      if (globalSyncTrigger) {
        globalSyncTrigger();
      }
      return;
    }

    if (tableName === 'patients') {
      if (values?.dob !== undefined && syncPayload.dateOfBirth === undefined) {
        syncPayload.dateOfBirth = values.dob;
      }
      if (values?.bloodType !== undefined) {
        syncPayload.bloodType = toBackendBloodType(values.bloodType);
      }
    } else {
      const targetPatientId = values?.patientId || extractIdFromCondition(condition) || (tableName.startsWith('patient_') ? entityId : undefined);
      if (targetPatientId) {
        syncPayload.patientId = targetPatientId;
      }
    }

    const syncItem = {
      id: randomUUID(),
      entityType: entityType as any,
      entityId,
      operation: effectiveOperation,
      payloadJson: effectiveOperation === 'delete' ? null : JSON.stringify(syncPayload),
      status: 'pending' as const,
      retryCount: 0,
      createdAt: now,
    };

    await originalDb.insert(syncQueue).values(syncItem);
    console.log(`[DB Interceptor] Successfully queued ${effectiveOperation} for ${entityType} (${entityId})`);

    if (globalSyncTrigger) {
      globalSyncTrigger();
    }
  } catch (err) {
    console.error(`[DB Interceptor] Failed to queue write for ${entityType}:`, err);
  }
}

function createQueryProxy(
  originalDb: any,
  builder: any,
  table: any,
  operation: 'create' | 'update' | 'delete',
  values: any,
  condition?: any
): any {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'then') {
        return function (onfulfilled?: any, onrejected?: any) {
          return target.then(
            async (result: any) => {
              const nameSymbol = Object.getOwnPropertySymbols(table).find(
                (s) => s.description === 'drizzle:Name'
              );
              const tableName = nameSymbol ? table[nameSymbol] : null;
              if (tableName && TABLE_TO_ENTITY_TYPE[tableName]) {
                await handleInterceptWrite(originalDb, String(tableName), operation, values, condition);
              }
              if (onfulfilled) return onfulfilled(result);
              return result;
            },
            (err: any) => {
              if (onrejected) return onrejected(err);
              throw err;
            }
          );
        };
      }

      if (prop === 'where') {
        return function (cond: any) {
          const nextBuilder = target.where(cond);
          return createQueryProxy(originalDb, nextBuilder, table, operation, values, cond);
        };
      }

      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'function') {
        return function (...args: any[]) {
          const result = val.apply(target, args);
          // onConflictDoUpdate means the row already exists → this is an update,
          // not a fresh create. Flip the operation so the sync queue sends the
          // correct verb to the backend.
          const effectiveOperation = prop === 'onConflictDoUpdate' ? 'update' : operation;
          if (result && typeof result === 'object' && typeof result.then === 'function') {
            return createQueryProxy(originalDb, result, table, effectiveOperation, values, condition);
          }
          return result;
        };
      }
      return val;
    }
  });
}

function wrapUpdateBuilder(originalDb: any, builder: any, table: any) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'set') {
        return function (values: any) {
          const nextBuilder = target.set(values);
          return createQueryProxy(originalDb, nextBuilder, table, 'update', values);
        };
      }
      const val = Reflect.get(target, prop, receiver);
      return typeof val === 'function' ? val.bind(target) : val;
    }
  });
}

function wrapInsertBuilder(originalDb: any, builder: any, table: any) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'values') {
        return function (values: any) {
          const nextBuilder = target.values(values);
          return createQueryProxy(originalDb, nextBuilder, table, 'create', values);
        };
      }
      const val = Reflect.get(target, prop, receiver);
      return typeof val === 'function' ? val.bind(target) : val;
    }
  });
}

function wrapDeleteBuilder(originalDb: any, builder: any, table: any) {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'where') {
        return function (cond: any) {
          const nextBuilder = target.where(cond);
          return createQueryProxy(originalDb, nextBuilder, table, 'delete', {}, cond);
        };
      }
      const val = Reflect.get(target, prop, receiver);
      return typeof val === 'function' ? val.bind(target) : val;
    }
  });
}

export function createDbWithInterceptor<T extends object>(originalDb: T): T {
  return new Proxy(originalDb, {
    get(target, prop, receiver) {
      if (prop === 'insert') {
        return function (table: any) {
          const builder = (target as any).insert(table);
          return wrapInsertBuilder(target, builder, table);
        };
      }
      if (prop === 'update') {
        return function (table: any) {
          const builder = (target as any).update(table);
          return wrapUpdateBuilder(target, builder, table);
        };
      }
      if (prop === 'delete') {
        return function (table: any) {
          const builder = (target as any).delete(table);
          return wrapDeleteBuilder(target, builder, table);
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  }) as T;
}
