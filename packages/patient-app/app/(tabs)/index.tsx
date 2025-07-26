



import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView } from 'react-native';

export default function HomeScreen() {
  // Notification count
  const notificationCount = 3;
  // Mock data
  const appointment = {
    date: 'Mon, July 28, 2025',
    time: '10:30 AM',
    clinic: 'Downtown Medical Center',
    doctor: 'Dr. Jane Smith',
    type: 'General Checkup',
  };
  const healthOverview = [
    { id: 1, label: 'Lab Results', value: '2 New', color: 'text-green-600 dark:text-green-400' },
    { id: 2, label: 'Prescriptions', value: '1 Update', color: 'text-blue-600 dark:text-blue-300' },
    { id: 3, label: 'Alerts', value: 'None', color: 'text-slate-500 dark:text-slate-400' },
  ];

  return (
    <ThemedView className="flex-1 bg-gradient-to-b from-blue-100/60 dark:from-slate-900 to-white dark:to-slate-950 px-0 py-0">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <ThemedView className="flex-1 w-full max-w-2xl mx-auto pt-10 pb-4">
          {/* Greeting */}
          <ThemedView className='px-4 mt-8'>
            <ThemedView className="flex-row items-center mb-4 w-full justify-between">
              <ThemedView className="flex-row items-center">
                <MaterialCommunityIcons name="hand-wave" size={36} color="#2563eb" style={{ marginRight: 12 }} />
                <ThemedText className="text-5xl font-black text-blue-700 dark:text-blue-300 leading-tight">Wave</ThemedText>
              </ThemedView>
              <ThemedView className="relative">
                <MaterialCommunityIcons name="bell-outline" size={30} color="#2563eb" />
                {notificationCount > 0 && (
                  <ThemedView className="absolute -top-1 -right-1 rounded-full w-6 h-6 px-1 items-center justify-center border-2 border-white dark:border-slate-900" style={{ backgroundColor: '#ef4444' }}>
                    <ThemedText className="text-sm font-bold" style={{ color: '#fff' }}>{notificationCount}</ThemedText>
                  </ThemedView>
                )}
              </ThemedView>
            </ThemedView>
            <ThemedText className="text-3xl font-extrabold text-blue-900 dark:text-blue-200 mb-2 text-left w-full leading-tight">
              Good morning
            </ThemedText>
            <ThemedText className="text-xl text-slate-600 dark:text-slate-300 mb-10 text-left w-full">
              Here’s what’s happening with your health today.
            </ThemedText>
          </ThemedView>

          {/* Health Overview Card */}
          <ThemedView className="mx-4 flex-1 bg-white/90 dark:bg-slate-900/80 rounded-2xl shadow-lg p-6 mb-6" style={{ elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6 }}>
            <ThemedView className="flex-row items-center mb-3">
              <MaterialCommunityIcons name="heart-pulse" size={26} color="#059669" style={{ marginRight: 10 }} />
              <ThemedText className="text-2xl font-extrabold text-blue-900 dark:text-blue-100">Health Overview</ThemedText>
            </ThemedView>
            <ThemedView className="flex-row justify-between gap-3">
              {healthOverview.map(item => (
                <ThemedView key={item.id} className="items-center flex-1">
                  <ThemedText className={`text-3xl font-black ${item.color}`}>{item.value}</ThemedText>
                  <ThemedText className="text-base text-slate-500 dark:text-slate-400 mt-2 font-semibold">{item.label}</ThemedText>
                </ThemedView>
              ))}
            </ThemedView>
          </ThemedView>

          {/* Next Appointment Card */}
          <ThemedView className="mx-4 flex-1 bg-blue-50 dark:bg-blue-900/40 rounded-2xl shadow-lg p-6 " style={{ elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6 }}>
            <ThemedView className="flex-row items-center mb-3">
              <MaterialCommunityIcons name="calendar-clock" size={28} color="#2563eb" style={{ marginRight: 10 }} />
              <ThemedText className="text-2xl font-extrabold text-blue-900 dark:text-blue-100">Next Appointment</ThemedText>
            </ThemedView>
            <ThemedText className="text-xl text-blue-700 dark:text-blue-200 font-black mb-1">{appointment.type}</ThemedText>
            <ThemedText className="text-lg text-blue-900 dark:text-blue-100 font-bold mb-1">with {appointment.doctor}</ThemedText>
            <ThemedText className="text-base text-slate-600 dark:text-slate-300 mb-1">{appointment.clinic}</ThemedText>
            <ThemedText className="text-base text-blue-500 dark:text-blue-300 mb-2 font-bold">{appointment.date} at {appointment.time}</ThemedText>
            <ThemedView className="mt-2 flex-row justify-end">
              <ThemedText className="text-lg text-blue-700 dark:text-blue-300 font-bold underline">View Details</ThemedText>
            </ThemedView>
          </ThemedView>

          {/* Quick Links */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, alignItems: 'flex-start' }}
            className="p-4"
          >
            <ThemedView
              className="min-w-[130px] max-w-[150px] h-40 bg-blue-100 dark:bg-blue-900/60 rounded-xl p-4 items-center justify-center shadow-md"
              style={{ elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.16, shadowRadius: 5, height: 160 }}
            >
              <MaterialCommunityIcons name="calendar" size={20} color="#2563eb" style={{ marginBottom: 4 }} />
              <ThemedText className="text-lg text-blue-900 dark:text-blue-100 font-extrabold mb-1 text-center">Appointments</ThemedText>
              <ThemedText className="text-sm text-slate-500 dark:text-slate-400 text-center">See and manage your upcoming visits</ThemedText>
            </ThemedView>
            <ThemedView
              className="min-w-[130px] max-w-[150px] h-40 bg-green-100 dark:bg-green-900/60 rounded-xl p-4 items-center justify-center shadow-md mx-1"
              style={{ elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.16, shadowRadius: 5, height: 160 }}
            >
              <MaterialCommunityIcons name="file-document" size={20} color="#059669" style={{ marginBottom: 4 }} />
              <ThemedText className="text-lg text-green-900 dark:text-green-100 font-extrabold mb-1 text-center">Health</ThemedText>
              <ThemedText className="text-sm text-slate-500 dark:text-slate-400 text-center">View your records and results</ThemedText>
            </ThemedView>
            <ThemedView
              className="min-w-[130px] max-w-[150px] h-40 bg-slate-100 dark:bg-slate-800/60 rounded-xl p-4 items-center justify-center shadow-md mx-1"
              style={{ elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.16, shadowRadius: 5, height: 160 }}
            >
              <MaterialCommunityIcons name="account-circle" size={20} color="#334155" style={{ marginBottom: 4 }} />
              <ThemedText className="text-lg text-slate-900 dark:text-slate-100 font-extrabold mb-1 text-center">Profile</ThemedText>
              <ThemedText className="text-sm text-slate-500 dark:text-slate-400 text-center">Manage your account</ThemedText>
            </ThemedView>
          </ScrollView>

          <ThemedText className="text-base text-slate-400 dark:text-slate-500 text-center mt-auto mb-2">
            Powered by NextStep Software Solutions
          </ThemedText>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

// No styles needed
