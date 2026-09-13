namespace PatientAppBE.Domain.Enums;

public enum SyncOperation { Create, Update, Delete }

public enum SyncStatus { Pending, Applied, Rejected, ConflictResolved }
