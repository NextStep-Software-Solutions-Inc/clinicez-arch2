import React from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import dummyHealth from '../HealthScreenData';

export default function LaboratoryResultsSection({ onSelect }: { onSelect?: (item: any) => void }) {
  return (
    <ThemedView style={{ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 12, marginBottom: 14, width: '96%', alignSelf: 'center', shadowColor: Colors.light.tint, shadowOpacity: 0.10, shadowRadius: 8, elevation: 3 }}>
      <ThemedText style={{ fontSize: 16, fontWeight: 'bold', color: Colors.light.tint, marginBottom: 8, letterSpacing: 0.2 }}>
        <Feather name="activity" size={16} color={Colors.light.tint} /> Laboratory Results
      </ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
        {dummyHealth.labs.map((lab, i) => (
          <TouchableOpacity key={i} onPress={() => onSelect && onSelect(lab)}>
            <ThemedView
              style={{
                minWidth: 100,
                maxWidth: 120,
                marginRight: 10,
                backgroundColor: '#f8fafc',
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 8,
                alignItems: 'flex-start',
                justifyContent: 'center',
                shadowColor: Colors.light.tint,
                shadowOpacity: 0.07,
                shadowRadius: 3,
                elevation: 1,
                borderLeftWidth: 4,
                borderLeftColor: lab.result === 'Normal' ? '#059669' : '#e11d48',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', maxWidth: 110 }}>
                <Feather name="activity" size={14} color={Colors.light.tint} style={{ marginRight: 4 }} />
                <ThemedText style={{ fontSize: 13, color: Colors.light.tint, fontWeight: 'bold', letterSpacing: 0.1, flexShrink: 1, flexWrap: 'wrap', maxWidth: 90 }} numberOfLines={2} ellipsizeMode="tail">
                  {lab.test}
                </ThemedText>
              </View>
              <ThemedText style={{ fontSize: 12, color: '#444', marginBottom: 1, flexWrap: 'wrap', maxWidth: 110 }} numberOfLines={2} ellipsizeMode="tail">
                <Feather name="calendar" size={10} color={Colors.light.tint} /> {lab.date}
              </ThemedText>
              <ThemedText style={{ fontSize: 12, color: lab.result === 'Normal' ? '#059669' : '#e11d48', fontWeight: 'bold', flexWrap: 'wrap', maxWidth: 110 }} numberOfLines={2} ellipsizeMode="tail">
                {lab.result}
              </ThemedText>
            </ThemedView>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ThemedView>
  );
}
