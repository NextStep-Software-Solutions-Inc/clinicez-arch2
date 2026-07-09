import { useCallback, useEffect, useState } from 'react';
import { db } from '@db/index';
import { clinics } from '@db/schema/clinics';

type ClinicNameMap = Record<string, string>;

export const useClinicNameMap = () => {
    const [clinicNameMap, setClinicNameMap] = useState<ClinicNameMap>({});

    useEffect(() => {
        let isMounted = true;

        const loadClinics = async () => {
            const rows = await db
                .select({ id: clinics.id, name: clinics.name })
                .from(clinics);

            if (!isMounted) return;

            const nextMap: ClinicNameMap = {};
            for (const row of rows) {
                nextMap[row.id] = row.name;
            }
            setClinicNameMap(nextMap);
        };

        loadClinics().catch((error) => {
            console.error('Failed to load clinic names', error);
        });

        return () => {
            isMounted = false;
        };
    }, []);

    const getClinicName = useCallback(
        (clinicId?: string | null) => (clinicId ? clinicNameMap[clinicId] : undefined),
        [clinicNameMap],
    );

    return { clinicNameMap, getClinicName };
};