import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, Pressable, TextInput, FlatList,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { getCachedData, cacheData } from '../lib/cache';

type Exercise = {
  id: string;
  name: string;
  category: 'Gym' | 'Calisthenics';
};

const DEFAULT_GYM: string[] = [
  'Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Barbell Row',
  'Lat Pulldown', 'Leg Press', 'Bicep Curl', 'Tricep Pushdown', 'Cable Fly',
  'Incline Bench Press', 'Decline Bench Press', 'Front Squat', 'Romanian Deadlift', 'Sumo Deadlift',
  'Dumbbell Shoulder Press', 'Lateral Raise', 'Front Raise', 'Shrugs', 'T-Bar Row',
  'Seated Cable Row', 'Pull-over', 'Hack Squat', 'Lying Leg Curl', 'Seated Leg Curl',
  'Leg Extension', 'Calf Raise', 'Hammer Curl', 'Preacher Curl', 'Concentration Curl',
  'Skull Crusher', 'Tricep Kickback', 'Overhead Tricep Extension', 'Pec Deck Fly', 'Chest Press Machine',
  'Shoulder Press Machine', 'Smith Machine Squat', 'Hip Thrust', 'Glute Bridge', 'Cable Crunch',
  'Woodchopper', 'Face Pull', 'Upright Row', 'Reverse Pec Deck', 'Good Morning',
  'Dumbbell Pullover', 'Zottman Curl', 'Incline Dumbbell Curl', 'Hex Press', 'Step-up',
];

const DEFAULT_CALISTHENICS: string[] = [
  'Push-ups', 'Pull-ups', 'Dips', 'Chin-ups', 'Bodyweight Squat',
  'Lunges', 'Plank', 'Burpees', 'Mountain Climbers', 'Hanging Leg Raise',
  'Muscle-up', 'Front Lever', 'Back Lever', 'Pistol Squat', 'Handstand Push-up',
  'Planche', 'Human Flag', 'L-Sit', 'V-Sit', 'Dragon Flag',
  'Hollow Body Hold', 'Arch Body Hold', 'Diamond Push-up', 'Wide Push-up', 'Archer Push-up',
  'Typewriter Push-up', 'Pseudo Planche Push-up', 'Incline Push-up', 'Decline Push-up', 'Commando Pull-up',
  'Archer Pull-up', 'One Arm Pull-up', 'Ring Dips', 'Straight Bar Dip', 'Bulgarian Split Squat',
  'Shrimp Squat', 'Cossack Squat', 'Glute Ham Raise', 'Calf Raise (Bodyweight)', 'Bear Crawl',
  'Crab Walk', 'Wall Walk', 'Handstand Hold', 'Tuck Planche', 'Straddle Planche',
  'Full Planche', 'Front Lever Raises', 'Toes to Bar', 'Windshield Wipers', 'Skin the Cat',
];

const isDefaultExercise = (name: string) => DEFAULT_GYM.includes(name) || DEFAULT_CALISTHENICS.includes(name);

export default function ExerciseManagementScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'Gym' | 'Calisthenics'>('Gym');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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
      const cacheKey = `exercises_library_data_${uid}_${cat}`;
      const cached = await getCachedData<Exercise[]>(cacheKey);
      if (cached) {
        setExercises(cached);
        setIsLoading(false);
      }

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
        await cacheData(cacheKey, inserted || []);
      } else {
        setExercises(data);
        await cacheData(cacheKey, data);
      }
    } catch (err: any) {
      console.error('Error loading exercises:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const syncMissingExercises = async () => {
    if (!userId) return;
    setIsSyncing(true);
    try {
      const { data: existingData, error: fetchErr } = await supabase
        .from('exercises')
        .select('name, category')
        .eq('user_id', userId);
        
      if (fetchErr) throw fetchErr;
      
      const existingGym = new Set(existingData?.filter(e => e.category === 'Gym').map(e => e.name) || []);
      const existingCali = new Set(existingData?.filter(e => e.category === 'Calisthenics').map(e => e.name) || []);
      
      const missingGym = DEFAULT_GYM.filter(name => !existingGym.has(name)).map(name => ({ user_id: userId, name, category: 'Gym' }));
      const missingCali = DEFAULT_CALISTHENICS.filter(name => !existingCali.has(name)).map(name => ({ user_id: userId, name, category: 'Calisthenics' }));
      
      const toInsert = [...missingGym, ...missingCali];
      
      if (toInsert.length === 0) {
        Alert.alert("Up to Date", "No new exercises to sync!");
        setIsSyncing(false);
        return;
      }
      
      const { error: insertErr } = await supabase
        .from('exercises')
        .insert(toInsert);
        
      if (insertErr) throw insertErr;
      
      await fetchExercises(userId, activeTab);
      Alert.alert("Sync Complete", `Successfully added ${toInsert.length} new exercises.`);
    } catch (err: any) {
      Alert.alert("Sync Error", err.message || "Failed to sync exercises.");
    } finally {
      setIsSyncing(false);
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
      {!isDefaultExercise(item.name) && (
        <Pressable
          style={({ pressed }) => pressed ? [styles.deleteBtn, { opacity: 0.6 }] : styles.deleteBtn}
          onPress={() => handleDeleteExercise(item)}
        >
          <Text style={styles.deleteBtnText}>🗑️</Text>
        </Pressable>
      )}
    </View>
  );

  const filteredExercises = exercises.filter(e => 
    e.name.toLowerCase().includes(searchQuery.toLowerCase())
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

      {/* Sync Button */}
      <View className="px-5 mt-4">
        <Pressable 
          onPress={syncMissingExercises}
          disabled={isSyncing}
          className={`bg-[#1A1A1A] border border-[#39FF14] p-3 rounded-xl flex-row justify-center items-center ${isSyncing ? 'opacity-50' : ''}`}
        >
          {isSyncing ? (
            <ActivityIndicator color="#39FF14" size="small" />
          ) : (
            <Text className="text-[#39FF14] font-bold text-[15px]">Sync New Exercises</Text>
          )}
        </Pressable>
      </View>

      {/* Search Bar */}
      <View className="px-5 mt-4">
        <TextInput
          className="bg-[#1A1A1A] border border-[#1E1E1E] text-white px-4 py-3 rounded-xl placeholder-[#888888]"
          placeholder="Search exercises..."
          placeholderTextColor="#888888"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
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
            className={`bg-[#39FF14] px-4 py-3 rounded-xl items-center ml-2 ${(isSubmitting || !newExerciseName.trim()) ? 'opacity-50' : ''}`}
            onPress={handleAddExercise}
            disabled={isSubmitting || !newExerciseName.trim()}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#0A0A0A" size="small" />
            ) : (
              <Text className="text-black font-bold text-base">Add</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* List Section */}
      <View style={styles.listSection}>
        <Text style={styles.listHeader}>Your {activeTab} Exercises ({filteredExercises.length})</Text>
        {isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator color="#39FF14" size="large" />
          </View>
        ) : filteredExercises.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {searchQuery ? 'No matching exercises found.' : `No exercises found in this category.\nAdd one above to get started!`}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredExercises}
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
