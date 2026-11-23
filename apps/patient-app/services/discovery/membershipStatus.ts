import type { MembershipWireStatus } from '../api/wireEnums';

export type LocalMembershipStatus = 'pending' | 'active' | 'rejected';

const LOCAL_BY_WIRE: Record<MembershipWireStatus, LocalMembershipStatus> = {
    Pending: 'pending',
    Active: 'active',
    Rejected: 'rejected',
};

/** Maps the API's PascalCase membership status to the local database vocabulary. */
export function localMembershipStatus(
    wire: MembershipWireStatus | null | undefined,
): LocalMembershipStatus | undefined {
    return wire ? LOCAL_BY_WIRE[wire] : undefined;
}