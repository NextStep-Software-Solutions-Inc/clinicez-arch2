import { AppointmentData } from "@app-types/appointment";
import Each from "@components/Each";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@components/ThemedCard";

interface AppointmentsTodayProps {
  appointments: AppointmentData[];
}

export default function AppointmentsToday({ appointments }: AppointmentsTodayProps) {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-3xl">Appointments Today</CardTitle>
        <CardDescription className="text-lg">
          A list of your patients today
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Each
          items={appointments}
          render={(appointment, index) => (
            <>
            </>
          )}
        />
      </CardContent>
    </Card>
  );
}
