import type { MembershipWireStatus } from '../api/wireEnums';

export type LocalMembershipStatus = 'pending' | 'active';

const LOCAL_BY_WIRE: Record<MembershipWireStatus, LocalMembershipStatus> = {
    Pending: 'pending',
    Active: 'active',
};

/** Maps the API's PascalCase membership status to the local database vocabulary. */
export function localMembershipStatus(
    wire: MembershipWireStatus | null | undefined,
): LocalMembershipStatus | undefined {
    return wire ? LOCAL_BY_WIRE[wire] : undefined;
}