import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, Pressable, TextInput, FlatList,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

type Exercise = {
  id: string;
  name: string;
  category: 'Gym' | 'Calisthenics';
};

const DEFAULT_GYM: string[] = [
  'Bench Press', 'Squat', 'Deadlift', 'Overhead Press',
  'Barbell Row', 'Lat Pulldown', 'Leg Press', 'Bicep Curl',
  'Tricep Pushdown', 'Cable Fly',
];

const DEFAULT_CALISTHENICS: string[] = [
  'Push-ups', 'Pull-ups', 'Dips', 'Chin-ups',
  'Bodyweight Squat', 'Lunges', 'Plank', 'Burpees',
  'Mountain Climbers', 'Hanging Leg Raise',
];

export default function ExerciseManagementScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'Gym' | 'Calisthenics'>('Gym');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        fetchExercises(user.id, activeTab);
      }
    };
    init();
  }, [activeTab]);

  const fetchExercises = async (uid: string, cat: 'Gym' | 'Calisthenics') => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('user_id', uid)
        .eq('category', cat)
        .order('name', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        const defaults = cat === 'Gym' ? DEFAULT_GYM : DEFAULT_CALISTHENICS;
        const rows = defaults.map(name => ({ user_id: uid, name, category: cat }));
        const { data: inserted } = await supabase
          .from('exercises')
          .insert(rows)
          .select('*');
        setExercises(inserted || []);
      } else {
        setExercises(data);
      }
    } catch (err: any) {
      console.error('Error loading exercises:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddExercise = async () => {
    const name = newExerciseName.trim();
    if (!name) {
      Alert.alert('Invalid Input', 'Please enter an exercise name.');
      return;
    }
    if (!userId) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('exercises')
        .insert({
          user_id: userId,
          name,
          category: activeTab,
        })
        .select('*')
        .single();

      if (error) throw error;
      if (data) {
        setExercises(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setNewExerciseName('');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add exercise.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExercise = (ex: Exercise) => {
    Alert.alert(
      'Delete Exercise',
      `Are you sure you want to remove "${ex.name}" from your library?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('exercises').delete().eq('id', ex.id);
              if (error) throw error;
              setExercises(prev => prev.filter(e => e.id !== ex.id));
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete exercise.');
            }
          },
        },
      ]
    );
  };

  const renderExerciseItem = ({ item }: { item: Exercise }) => (
    <View style={styles.exerciseCard}>
      <Text style={styles.exerciseName}>{item.name}</Text>
      <Pressable
        style={({ pressed }) => pressed ? [styles.deleteBtn, { opacity: 0.6 }] : styles.deleteBtn}
        onPress={() => handleDeleteExercise(item)}
      >
        <Text style={styles.deleteBtnText}>🗑️</Text>
      </Pressable>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Exercise Library</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Category Tabs */}
      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tabBtn, activeTab === 'Gym' && styles.tabBtnActive]}
          onPress={() => setActiveTab('Gym')}
        >
          <Text style={[styles.tabText, activeTab === 'Gym' && styles.tabTextActive]}>Gym 🏋️</Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === 'Calisthenics' && styles.tabBtnActive]}
          onPress={() => setActiveTab('Calisthenics')}
        >
          <Text style={[styles.tabText, activeTab === 'Calisthenics' && styles.tabTextActive]}>Calisthenics 🤸</Text>
        </Pressable>
      </View>

      {/* Input Section */}
      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>Add Custom {activeTab} Exercise</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            placeholder={`e.g. Incline Dumbbell Press`}
            placeholderTextColor="#555555"
            value={newExerciseName}
            onChangeText={setNewExerciseName}
            onSubmitEditing={handleAddExercise}
          />
          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              (isSubmitting || !newExerciseName.trim()) && { opacity: 0.5 },
              pressed && { transform: [{ scale: 0.96 }] }
            ]}
            onPress={handleAddExercise}
            disabled={isSubmitting || !newExerciseName.trim()}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#0A0A0A" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Add</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* List Section */}
      <View style={styles.listSection}>
        <Text style={styles.listHeader}>Your {activeTab} Exercises ({exercises.length})</Text>
        {isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator color="#39FF14" size="large" />
          </View>
        ) : exercises.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No exercises found in this category.{'\n'}Add one above to get started!</Text>
          </View>
        ) : (
          <FlatList
            data={exercises}
            keyExtractor={item => item.id}
            renderItem={renderExerciseItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnIcon: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: '#141414',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: '#222222',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 11,
  },
  tabBtnActive: {
    backgroundColor: '#39FF14',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#888888',
  },
  tabTextActive: {
    color: '#0A0A0A',
    fontWeight: 'bold',
  },
  inputSection: {
    marginHorizontal: 20,
    marginTop: 24,
    backgroundColor: '#141414',
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#222222',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#AAAAAA',
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
  },
  submitBtn: {
    backgroundColor: '#39FF14',
    paddingHorizontal: 22,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#0A0A0A',
    fontWeight: 'bold',
    fontSize: 15,
  },
  listSection: {
    flex: 1,
    marginTop: 24,
    paddingHorizontal: 20,
  },
  listHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 14,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666666',
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 15,
  },
  listContent: {
    paddingBottom: 40,
  },
  exerciseCard: {
    backgroundColor: '#141414',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#222222',
  },
  exerciseName: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  deleteBtn: {
    padding: 6,
  },
  deleteBtnText: {
    fontSize: 16,
  },
});
