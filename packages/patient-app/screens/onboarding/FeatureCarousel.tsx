import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { FlatList, View, Text, Dimensions } from 'react-native';
import RoundedButton from '../../components/RoundedButton';
import { SafeAreaView } from 'react-native-safe-area-context';

type FeatureCarouselProps = {
    onNext: () => void;
    onBack?: () => void;
};

const features = [
    {
        icon: { name: 'hospital-building', color: '#2563eb' },
        title: 'Your Clinic, Anywhere',
        description: 'Connect to your clinic, book appointments, and access care from your phone.'
    },
    {
        icon: { name: 'account-heart', color: '#059669' },
        title: 'Personal Health',
        description: 'View your health records, prescriptions, and lab results securely.'
    },
    {
        icon: { name: 'calendar-check', color: '#f59e42' },
        title: 'Easy Scheduling',
        description: 'Book, reschedule, and get reminders for your appointments.'
    }
];

export default function FeatureCarousel({ onNext, onBack }: FeatureCarouselProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const flatListRef = useRef<FlatList>(null);

    const handleViewableItemsChanged = useRef(({ viewableItems }: any) => {
        if (viewableItems && viewableItems.length > 0) {
            setCurrentIndex(viewableItems[0].index ?? 0);
        }
    });

    const scrollToIndex = (index: number) => {
        flatListRef.current?.scrollToIndex({ index, animated: true });
    };

    return (
        <View className="flex-1 bg-white">
            {/* Tracking dots at the very top, in safe area */}
            <SafeAreaView edges={["top"]}>
                <View className="flex-row justify-center items-center mt-8 mb-4">
                    {features.map((_, idx) => (
                        <View
                            key={idx}
                            className={
                                `mx-1 w-2 h-2 rounded-full ` +
                                (currentIndex === idx ? 'bg-blue-600' : 'bg-slate-300')
                            }
                            style={{ opacity: currentIndex === idx ? 1 : 0.5 }}
                        />
                    ))}
                </View>
            </SafeAreaView>
            {/* Centered feature card in available space */}
            <View className="flex-1 items-center justify-center">
                <View className="items-center w-full">
                    <FlatList
                        ref={flatListRef}
                        data={features}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        keyExtractor={item => item.title}
                        renderItem={({ item }) => (
                            <View style={{ width: Dimensions.get('window').width }} className="flex-1 items-center justify-center p-8">
                                <View className="bg-white rounded-3xl py-10 px-6 shadow-md items-center mb-8 w-full max-w-xl justify-center">
                                    <MaterialCommunityIcons name={item.icon.name} size={96} color={item.icon.color} style={{ marginBottom: 24 }} />
                                    <Text className="text-4xl font-extrabold text-[#1a365d] mb-6 text-center">{item.title}</Text>
                                    <Text className="text-xl text-[#4a5568] text-center leading-8">{item.description}</Text>
                                </View>
                            </View>
                        )}
                        onViewableItemsChanged={handleViewableItemsChanged.current}
                        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 60 }}
                    />
                </View>
            </View>

            {/* Navigation/CTA pinned to very bottom, spaced left/right, icon and text, balanced size */}
            <View className="flex-row justify-between items-end px-12 mb-12">
                <View className="flex-1 items-start">
                    {currentIndex > 0 ? (
                        <RoundedButton onPress={() => scrollToIndex(currentIndex - 1)} color="bg-white" rippleColor="#e2e8f0" className="py-2 px-2 flex-row items-center">
                            <MaterialCommunityIcons name="chevron-left" size={28} color="#2563eb" style={{ marginRight: 4 }} />
                            <Text className="text-blue-600 font-extrabold text-lg">Back</Text>
                        </RoundedButton>
                    ) : (
                        onBack && (
                            <RoundedButton onPress={onBack} color="bg-white" rippleColor="#e2e8f0" className="py-2 px-2 flex-row items-center">
                                <MaterialCommunityIcons name="close-circle" size={24} color="#ef4444" style={{ marginRight: 4 }} />
                                <Text className="text-red-500 font-extrabold text-lg">Exit</Text>
                            </RoundedButton>
                        )
                    )}
                </View>
                <View className="flex-1 items-end">
                    {currentIndex < features.length - 1 ? (
                        <RoundedButton onPress={() => scrollToIndex(currentIndex + 1)} color="bg-white" rippleColor="#e2e8f0" className="py-2 px-2 flex-row items-center">
                            <Text className="text-blue-600 font-extrabold text-lg">Next</Text>
                            <MaterialCommunityIcons name="chevron-right" size={28} color="#2563eb" style={{ marginLeft: 4 }} />
                        </RoundedButton>
                    ) : (
                        <RoundedButton onPress={onNext} color="bg-white" rippleColor="#e2e8f0" className="py-2 px-2 flex-row items-center">
                            <Text className="text-cyan-600 font-extrabold text-lg">Get Started</Text>
                            <MaterialCommunityIcons name="check-circle" size={24} color="#06b6d4" style={{ marginLeft: 4 }} />
                        </RoundedButton>
                    )}
                </View>
            </View>
        </View>
    );
}

