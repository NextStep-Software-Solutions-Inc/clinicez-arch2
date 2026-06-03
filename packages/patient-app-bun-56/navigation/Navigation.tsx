import { createNativeStackNavigator, createNativeStackScreen } from "@react-navigation/native-stack";
import { createStaticNavigation, StaticParamList } from "@react-navigation/native";
import HomeScreen from "./screens/Home.screen";
import ProfileScreen from "./screens/Profile.screen";
import SettingsScreen from "./screens/Settings.screen";
import FilesScreen from "./screens/Files.screen";
import ExploreClinicsScreen from "./screens/ExploreClinics.screen";
import ExploreOrgsScreen from "./screens/ExploreOrgs.screen";
import AppointmentsScreen from "./screens/Appointments.screen";
import { createBottomTabNavigator, createBottomTabScreen } from "@react-navigation/bottom-tabs";
import { Platform } from "react-native";
import { isLiquidGlassSupported } from "@callstack/liquid-glass";
import LoginScreen from "./screens/Login.screen";
import { useAuth } from "contexts/AuthContext";
import SignupScreen from "./screens/Signup.screen";
import LockScreen from "./screens/Lock.screen";
import WelcomeScreen from "./screens/Welcome.screen";
import OnboardScreen from "./screens/Onboard.screen";
import UnlockScreen from "./screens/Unlock.screen";
import VerifyScreen from "./screens/Verify.screen";
import ForgotPasswordScreen from "./screens/ForgotPassword.screen";
import NotificationScreen from "./screens/Notification.screen";
import { useOnboarding } from "contexts/OnboardingContext";
import BottomTabsHeaderRight from "../components/BottomTabsHeaderRight";

export type RootStackType = typeof RootStack;

declare module "@react-navigation/core" {
    export interface RootNavigator extends RootStackType { }
}

const useUnlocked = () => {
    const auth = useAuth();
    return !auth.isLocked && auth.isAuthenticated
}

const BottomTabs = createBottomTabNavigator({
    screens: {
        HomeScreen: createBottomTabScreen({
            screen: HomeScreen,
            options: {
                title: "Home",
                tabBarIcon: Platform.select({
                    android: {
                        type: "materialSymbol",
                        name: "home"
                    },
                    ios: {
                        type: "sfSymbol",
                        name: "house.fill"
                    }
                })
            }
        }),
        AppointmentsScreen: createBottomTabScreen({
            screen: AppointmentsScreen,
            options: {
                title: "Health",
                tabBarIcon: Platform.select({
                    android: {
                        type: "materialSymbol",
                        name: "health_and_safety"
                    },
                    ios: {
                        type: "sfSymbol",
                        name: "heart.fill"
                    }
                })
            }
        }),
        FilesScreen: createBottomTabScreen({
            screen: FilesScreen,
            options: {
                title: "Files",
                tabBarIcon: Platform.select({
                    android: {
                        type: "materialSymbol",
                        name: "files"
                    },
                    ios: {
                        type: "sfSymbol",
                        name: "doc.fill"
                    }
                })
            }
        }),
        ProfileScreen: createBottomTabScreen({
            screen: ProfileScreen,
            options: {
                title: "Profile",
                tabBarIcon: Platform.select({
                    android: {
                        type: "materialSymbol",
                        name: "person"
                    },
                    ios: {
                        type: "sfSymbol",
                        name: "person.fill"
                    }
                })
            }
        }),
    }
})

const AuthStack = createNativeStackNavigator({
    screens: {
        Lock: createNativeStackScreen({
            screen: LockScreen,
            if: () => useAuth().isLocked,
            options:{
                title: "Locked Screen",
                headerLargeTitleEnabled: true
            },
        }),
        Unlock: createNativeStackScreen({
            screen: UnlockScreen,
            if: () => useAuth().isLocked
        }),
        Login: createNativeStackScreen({
            screen: LoginScreen,
            if: () => !useAuth().isAuthenticated,
            options: {
                title: "Login Auth stack",
            }
        }),
        Signup: createNativeStackScreen({
            screen: SignupScreen,
            if: () => !useAuth().isAuthenticated
        }),
        Verify: createNativeStackScreen({
            screen: VerifyScreen,
        }),
        ForgotPassword: createNativeStackScreen({
            screen: ForgotPasswordScreen,
            options: {
                title: "Forgot Password"
            }
        }),
    }
})

const OnboardingStack = createNativeStackNavigator({
    screenOptions: {},
    screens: {
        Welcome: createNativeStackScreen({
            screen: WelcomeScreen
        }),
        Onboard: createNativeStackScreen({
            screen: OnboardScreen,
            options: {
                headerShown: false,
            }
        }),
        Login: createNativeStackScreen({
            screen: LoginScreen,
            if: () => !useAuth().isAuthenticated,
            options: {
                title: "Login Onboarding stack",
            }
        }),
        Signup: createNativeStackScreen({
            screen: SignupScreen,
            if: () => useAuth().isAuthenticated
        }),
    }
})

const RootStack = createNativeStackNavigator({
    screenOptions: {
        headerStyle: {
            backgroundColor: isLiquidGlassSupported ? "transparent" : undefined
        }
    },
    screens: {
        Onboarding: createNativeStackScreen({
            if: () => !useOnboarding().isComplete,
            screen: OnboardingStack,
            options: {
                headerShown: false,
            }
        }),
        Auth: createNativeStackScreen({
            if: () => useOnboarding().isComplete,
            screen: AuthStack,
            options: {
                headerShown: false,
            }
        }),
        BottomTabs: createNativeStackScreen({
            screen: BottomTabs,
            if: useUnlocked,
            options: (optionProps) => ({
                // headerShown: false,
                title: "Clinic EZ",
                headerLargeTitleEnabled: true,
                headerRight: BottomTabsHeaderRight
            })
        }),
        SettingsScreen: createNativeStackScreen({
            screen: SettingsScreen,
            if: useUnlocked,
            options: {
                title: "Settings",
                headerLargeTitleEnabled: true,

            }
        }),
        NotificationScreen: createNativeStackScreen({
            screen: NotificationScreen,
            if: useUnlocked,
            options: {
                title: "Notifications",
                headerLargeTitleEnabled: true,

            }
        }),
        ExploreClinicsScreen: createNativeStackScreen({
            screen: ExploreClinicsScreen,
            if: useUnlocked,
            options: {
                headerLargeTitleEnabled: true,
            }
        }),
        ExploreOrgsScreen: createNativeStackScreen({
            screen: ExploreOrgsScreen,
            if: useUnlocked,
            options: {
                headerLargeTitleEnabled: true,
            }
        }),
    }
});
export const Navigation = createStaticNavigation(RootStack);
