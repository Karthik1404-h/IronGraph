import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet, Text, View, Pressable, TextInput, FlatList,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, ScrollView
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { getCachedData, cacheData } from '../lib/cache';

// Re-declare local type to avoid circular dependency or missing export
type Exercise = {
  id: string;
  name: string;
  category: string;
  target?: string;
  muscle_group?: string;
  equipment?: string;
};

const CATEGORIES = ['All', 'chest', 'back', 'upper legs', 'waist', 'shoulders', 'cardio', 'upper arms', 'lower legs', 'lower arms', 'neck', 'Gym', 'Calisthenics'];

export default function CreateRoutineScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const editRoutineId = params.routineId as string | undefined;

  const [routineName, setRoutineName] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<Exercise[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Exercise Modal State
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    fetchExercises();
    if (editRoutineId) {
      loadRoutineForEdit(editRoutineId);
    }
  }, [editRoutineId]);

  const loadRoutineForEdit = async (id: string) => {
    try {
      const { data: routine } = await supabase.from('routines').select('*').eq('id', id).single();
      if (routine) setRoutineName(routine.name);

      const { data: routineExercises } = await supabase
        .from('routine_exercises')
        .select('*, exercises(*)')
        .eq('routine_id', id)
        .order('order_index');
      
      if (routineExercises) {
        setSelectedExercises(routineExercises.map((re: any) => re.exercises));
      }
    } catch (e) {
      console.error('Failed to load routine for editing', e);
    }
  };

  const fetchExercises = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const cached = await getCachedData<Exercise[]>('exercises_library_data_v3');
      if (cached) setExercises(cached);

      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .or(`user_id.is.null,user_id.eq.${user.id}`)
        .order('name');
        
      if (error) throw error;
      if (data) {
        setExercises(data);
        await cacheData('exercises_library_data_v3', data);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredExercises = useMemo(() => {
    return exercises.filter(e => {
      if (!e.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (selectedCategory === 'All') return true;
      if (selectedCategory === 'Calisthenics') return e.equipment === 'body weight' || e.category === 'Calisthenics';
      if (selectedCategory === 'Gym') return (e.equipment && e.equipment !== 'body weight') || e.category === 'Gym';
      return e.category?.toLowerCase() === selectedCategory.toLowerCase();
    });
  }, [exercises, searchQuery, selectedCategory]);

  const handleAddExercise = (exercise: Exercise) => {
    setSelectedExercises(prev => [...prev, exercise]);
  };

  const handleRemoveExercise = (index: number) => {
    setSelectedExercises(prev => {
      const copy = [...prev];
      copy.splice(index, 1);
      return copy;
    });
  };

  const handleSaveRoutine = async () => {
    if (!routineName.trim()) {
      Alert.alert('Missing Name', 'Please enter a routine name.');
      return;
    }
    if (selectedExercises.length === 0) {
      Alert.alert('Missing Exercises', 'Please add at least one exercise.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 1. Upsert Routine
      let savedRoutineId;
      if (editRoutineId) {
        const { data: routineData, error: routineErr } = await supabase
          .from('routines')
          .update({ name: routineName.trim() })
          .eq('id', editRoutineId)
          .select('id')
          .single();
        if (routineErr) throw routineErr;
        savedRoutineId = routineData.id;

        // delete existing routine_exercises before re-inserting
        await supabase.from('routine_exercises').delete().eq('routine_id', editRoutineId);
      } else {
        const { data: routineData, error: routineErr } = await supabase
          .from('routines')
          .insert({ user_id: user.id, name: routineName.trim() })
          .select('id')
          .single();
        if (routineErr) throw routineErr;
        savedRoutineId = routineData.id;
      }

      // 2. Insert Routine Exercises
      const routineExercises = selectedExercises.map((ex, index) => ({
        routine_id: savedRoutineId,
        exercise_id: ex.id,
        order_index: index,
      }));

      const { error: exercisesErr } = await supabase
        .from('routine_exercises')
        .insert(routineExercises);
        
      if (exercisesErr) throw exercisesErr;

      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save routine.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Create Routine</Text>
        <Pressable onPress={() => router.back()} style={styles.closeBtnContainer}>
          <Text style={styles.closeBtn}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Routine Name</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g., Pull Day"
            placeholderTextColor="#555"
            value={routineName}
            onChangeText={setRoutineName}
          />
        </View>

        <Text style={styles.sectionTitle}>Exercises</Text>
        
        {selectedExercises.map((ex, index) => (
          <View key={`${ex.id}-${index}`} style={styles.exerciseCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 16 }}>
              <Text style={{ fontSize: 16, marginRight: 12 }}>{index + 1}.</Text>
              <Text className="flex-1 mr-4" style={styles.exerciseName} numberOfLines={2} ellipsizeMode="tail">{ex.name}</Text>
            </View>
            <Pressable onPress={() => handleRemoveExercise(index)} style={{ padding: 8 }}>
              <Text style={{ color: '#FF4444', fontWeight: 'bold' }}>✕</Text>
            </Pressable>
          </View>
        ))}

        <Pressable
          style={styles.addExerciseBtn}
          onPress={() => setShowExerciseModal(true)}
        >
          <Text style={styles.addExerciseText}>+ Add Exercise</Text>
        </Pressable>

        <Pressable
          style={[styles.saveBtn, isSubmitting && { opacity: 0.5 }]}
          onPress={handleSaveRoutine}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#0A0A0A" />
          ) : (
            <Text style={styles.saveBtnText}>Save Routine</Text>
          )}
        </Pressable>
      </ScrollView>

      {/* Exercise Selection Modal */}
      <Modal
        visible={showExerciseModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowExerciseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Exercise</Text>
              <Pressable onPress={() => setShowExerciseModal(false)} style={{ padding: 4 }}>
                <Text style={{ fontSize: 18, color: '#AAAAAA' }}>✕</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder="Search..."
              placeholderTextColor="#888888"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />

            <View style={{ marginBottom: 12 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat}
                    onPress={() => setSelectedCategory(cat)}
                    style={[
                      styles.categoryChip,
                      selectedCategory === cat ? styles.categoryChipActive : {}
                    ]}
                  >
                    <Text style={selectedCategory === cat ? { color: '#000', fontWeight: 'bold' } : { color: '#FFF', fontWeight: 'bold' }}>
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {isLoading && exercises.length === 0 ? (
              <ActivityIndicator color="#39FF14" style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={filteredExercises}
                keyExtractor={item => item.id}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={true}
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.exerciseItem}
                    onPress={() => {
                      handleAddExercise(item);
                      setShowExerciseModal(false);
                      setSearchQuery('');
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 16 }}>
                      <Text style={{ fontSize: 16, marginRight: 8 }}>{item.category === 'Gym' ? '🏋️' : '🤸'}</Text>
                      <Text className="flex-1 mr-4" style={{ color: '#FFF', fontSize: 16, fontWeight: '500' }} numberOfLines={2} ellipsizeMode="tail">{item.name}</Text>
                    </View>
                    <Text style={{ color: '#39FF14', fontSize: 20 }}>+</Text>
                  </Pressable>
                )}
                ListEmptyComponent={<Text style={{ color: '#888', textAlign: 'center', marginTop: 20 }}>No exercises found.</Text>}
              />
            )}
          </View>
        </View>
      </Modal>
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
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
  },
  closeBtnContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    fontSize: 16,
    color: '#AAA',
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  inputSection: {
    marginBottom: 24,
  },
  inputLabel: {
    color: '#888',
    marginBottom: 8,
    fontSize: 14,
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  textInput: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#222',
    color: '#FFF',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
  },
  sectionTitle: {
    color: '#888',
    marginBottom: 12,
    fontSize: 14,
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  exerciseCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  exerciseName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  addExerciseBtn: {
    backgroundColor: '#141414',
    borderWidth: 1.5,
    borderColor: '#39FF14',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 32,
    borderStyle: 'dashed',
  },
  addExerciseText: {
    color: '#39FF14',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveBtn: {
    backgroundColor: '#39FF14',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  searchInput: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#222',
    color: '#FFF',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  categoryChip: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#222',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#39FF14',
    borderColor: '#39FF14',
  },
  exerciseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 12,
    marginBottom: 8,
  }
});
