import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from '@/hooks/useColorScheme';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
    const colorScheme = useColorScheme();
    // Notification count
    const notificationCount = 3;
    // Current clinic context (mocked for now)
    const currentClinic = {
        name: 'Downtown Medical Center',
        address: '123 Main St, Cityville',
        // logo: '...' // could add logo uri here
    };
    // Mock data for multiple appointments
    const appointments = [
        {
            id: 1,
            date: 'Mon, July 28, 2025',
            time: '10:30 AM',
            doctor: 'Dr. Jane Smith',
            specialization: 'General Practitioner',
            type: 'General Checkup',
        },
        {
            id: 2,
            date: 'Wed, July 30, 2025',
            time: '2:00 PM',
            doctor: 'Dr. John Doe',
            specialization: 'Dentist',
            type: 'Dental Cleaning',
        },
        {
            id: 3,
            date: 'Fri, Aug 1, 2025',
            time: '9:00 AM',
            doctor: 'Dr. Emily Lee',
            specialization: 'Ophthalmologist',
            type: 'Eye Exam',
        },
    ];
    const healthOverview = [
        { id: 1, label: 'Lab Results', value: '2 New', color: 'text-green-600 dark:text-green-400' },
        { id: 2, label: 'Prescriptions', value: '1 Update', color: 'text-blue-600 dark:text-blue-300' },
        { id: 3, label: 'Alerts', value: 'None', color: 'text-slate-500 dark:text-slate-400' },
    ];

    const quickLinks = [
        {
            key: 'appointments',
            icon: { name: 'calendar', color: '#2563eb' },
            bg: 'bg-blue-100 dark:bg-blue-900/60',
            title: 'Appointments',
            titleClass: 'text-blue-900 dark:text-blue-100',
            desc: 'See and manage your upcoming visits',
        },
        {
            key: 'health',
            icon: { name: 'file-document', color: '#059669' },
            bg: 'bg-green-100 dark:bg-green-900/60',
            title: 'Health',
            titleClass: 'text-green-900 dark:text-green-100',
            desc: 'View your records and results',
        },
        {
            key: 'profile',
            icon: { name: 'account-circle', color: '#334155' },
            bg: 'bg-slate-100 dark:bg-slate-800/60',
            title: 'Profile',
            titleClass: 'text-slate-900 dark:text-slate-100',
            desc: 'Manage your account',
        },
    ];
    return (
        <SafeAreaView
            edges={['top', 'left', 'right']}
            className="flex-1 px-0 py-0"
        >
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
                <ThemedView className="flex-1 w-full">
                    {/* Greeting */}
                    <ThemedView className='px-4'>
                        <ThemedView className="flex-row items-center mb-4 w-full justify-between">
                            <ThemedView className="flex-row items-center">
                                <MaterialCommunityIcons name="hand-wave" size={36} color="#2563eb" style={{ marginRight: 12 }} />
                                <ThemedText className="text-4xl font-black text-blue-700 dark:text-blue-300 leading-tight">Wave</ThemedText>
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
                        <ThemedText className="text-2xl font-extrabold text-blue-900 dark:text-blue-200 mb-2 text-left w-full leading-tight">
                            Good morning
                        </ThemedText>
                        <ThemedText className="text-lg text-slate-600 dark:text-slate-300 mb-4 text-left w-full">
                            Here’s what’s happening with your health today.
                        </ThemedText>
                        {/* Current Clinic Context */}
                        <ThemedView className="flex-row items-center gap-2 mb-6 mt-1">
                            <MaterialCommunityIcons name="hospital-building" size={22} color="#2563eb" style={{ marginRight: 4 }} />
                            <ThemedText className="text-base font-bold text-blue-800 dark:text-blue-200 mr-2">{currentClinic.name}</ThemedText>
                            {/* <ThemedText className="text-xs text-slate-500 dark:text-slate-400">{currentClinic.address}</ThemedText> */}
                        </ThemedView>
                    </ThemedView>

                    {/* Health Overview Card - Modernized */}
                    <ThemedView className="mx-4  flex-1  rounded-3xl shadow-xl shadow-blue-200 p-0 mb-7 overflow-hidden bg-white/90 dark:bg-slate-800" style={{ elevation: 4, shadowColor: "#2563eb", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.13, shadowRadius: 12 }}>
                        <ThemedView className=" w-full h-full absolute left-0 top-0" style={{ zIndex: 0 }}>
                            <MaterialCommunityIcons name="heart-pulse" size={120} color="#bae5fd83" style={{ position: 'absolute', right: -30, top: -30, zIndex: 0 }} />
                            <LinearGradient
                                colors={colorScheme === 'dark' ? ["#1e293b", "#334155"] : ["#f0f9ff", "#e0e7ff"]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, opacity: 0.70 }}
                            />
                        </ThemedView>
                        <ThemedView className="flex-row items-center mb-4 px-6 pt-6" style={{ zIndex: 1 }}>
                            <MaterialCommunityIcons name="heart-pulse" size={28} color="#649199ff" style={{ marginRight: 12 }} />
                            <ThemedText className="font-extrabold text-blue-900 dark:text-blue-100">Health Overview</ThemedText>
                        </ThemedView>
                        <ThemedView className="flex-row justify-between gap-4 px-6 pb-6 " style={{ zIndex: 1 }}>
                            {healthOverview.map(item => (
                                <ThemedView key={item.id} className="items-center flex-1">
                                    <ThemedView className={`mb-2 px-4 py-2 rounded-full bg-white/80 dark:bg-slate-800/80 shadow-sm`} style={{ minWidth: 70, maxWidth: 90, alignItems: 'center' }}>
                                        <ThemedText
                                            className={`text-sm font-black ${item.color}`}
                                            numberOfLines={1}
                                            ellipsizeMode="tail"
                                            style={{ textAlign: 'center' }}
                                        >
                                            {item.value}
                                        </ThemedText>
                                    </ThemedView>
                                    <ThemedText className="text-slate-500 dark:text-slate-400 font-semibold mt-1 text-center">{item.label}</ThemedText>
                                </ThemedView>
                            ))}
                        </ThemedView>
                    </ThemedView>

                    {/* Upcoming Appointments - Modern Glassmorphism Cards */}
                    <ThemedText className="text-lg font-bold text-blue-900 dark:text-blue-200 mb-2 px-6">Upcoming Appointments</ThemedText>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 16, paddingHorizontal: 16, paddingBottom: 8 }}
                        style={{ overflow: 'visible' }}
                    >
                        {appointments.length === 0 ? (
                            <ThemedView
                                className="min-w-[270px] max-w-[320px] rounded-2xl overflow-hidden shadow-md bg-white/90 dark:bg-slate-900/80 items-center justify-center p-8"
                                style={{ elevation: 2, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 8 }}
                            >
                                <MaterialCommunityIcons name="calendar-remove" size={48} color="#2563eb" style={{ marginBottom: 12 }} />
                                <ThemedText className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-2 text-center">No upcoming appointments</ThemedText>
                                <ThemedText className="text-base text-slate-500 dark:text-slate-400 text-center mb-4">You're all caught up! Schedule your next visit when you're ready.</ThemedText>
                                <ThemedView className="flex-row justify-center">
                                    <ThemedText className="text-base font-semibold text-blue-700 dark:text-blue-300 mr-1">Book Now</ThemedText>
                                    <MaterialCommunityIcons name="chevron-right" size={20} color="#2563eb" />
                                </ThemedView>
                            </ThemedView>
                        ) : (
                            appointments.map((appt) => (
                                <ThemedView
                                    key={appt.id}
                                    className="min-w-[270px] max-w-[320px] rounded-2xl overflow-hidden shadow-md bg-white dark:bg-slate-900/80"
                                    style={{ elevation: 2, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 8 }}
                                >
                                    <ThemedView className="flex-1 px-5 py-5 justify-between" style={{ zIndex: 1 }}>
                                        {/* Avatar and info row */}
                                        <ThemedView className="flex-row items-center mb-2">
                                            <ThemedView className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 items-center justify-center mr-3 shadow-md" style={{ elevation: 2 }}>
                                                <MaterialCommunityIcons name="account-circle" size={32} color="#2563eb" />
                                            </ThemedView>
                                            <ThemedView className="flex-1">
                                                <ThemedText className="font-extrabold text-blue-900 dark:text-blue-100 mb-0.5" numberOfLines={1}>{appt.doctor}</ThemedText>
                                                <ThemedText className="text-xs text-slate-600 dark:text-slate-300 mb-0.5" numberOfLines={1}>{appt.specialization}</ThemedText>
                                            </ThemedView>
                                        </ThemedView>
                                        {/* Date/time pill */}
                                        <ThemedView className="mb-2 px-3 py-1 rounded-full bg-blue-600/90 dark:bg-blue-700/90 self-start">
                                            <ThemedText className="text-xs font-bold text-white tracking-wide">{appt.date} {appt.time}</ThemedText>
                                        </ThemedView>
                                        {/* Details section at bottom */}
                                        <ThemedView className="w-full mt-2">
                                            <ThemedText className="font-semibold text-blue-800 dark:text-blue-200 mb-1">{appt.type}</ThemedText>
                                            <ThemedView className="flex-row items-center">
                                                <ThemedText className="text-xs text-blue-700 dark:text-blue-300 mr-1">Details</ThemedText>
                                                <MaterialCommunityIcons name="chevron-right" size={20} color="#2563eb" />
                                            </ThemedView>
                                        </ThemedView>
                                    </ThemedView>
                                </ThemedView>
                            ))
                        )}
                    </ScrollView>

                    {/* Quick Links */}
                    {/* Quick Links - Refactored to use array and map */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 16, paddingHorizontal: 16, alignItems: 'flex-start', marginBlock: 8 }}
                    >
                        {quickLinks.map(link => (
                            <ThemedView
                                key={link.key}
                                className={`min-w-[130px] max-w-[150px] h-40 ${link.bg} rounded-xl p-4 items-center justify-center shadow-md`}
                                style={{ elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.10, shadowRadius: 3, height: 160 }}
                            >
                                <MaterialCommunityIcons name={link.icon.name as any} size={20} color={link.icon.color} style={{ marginBottom: 4 }} />
                                <ThemedText className={`text-lg font-extrabold mb-1 text-center ${link.titleClass}`}>{link.title}</ThemedText>
                                <ThemedText className="text-sm text-slate-500 dark:text-slate-400 text-center">{link.desc}</ThemedText>
                            </ThemedView>
                        ))}
                    </ScrollView>

                    <ThemedText className="text-base text-slate-400 dark:text-slate-500 text-center mt-auto mb-2">
                        Powered by NextStep Software Solutions
                    </ThemedText>
                </ThemedView>
            </ScrollView>
        </SafeAreaView>
    );
}
