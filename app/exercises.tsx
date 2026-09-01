import { cacheData, getCachedData } from '@/lib/cache';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView, Platform,
  Pressable,
  ScrollView,
  StyleSheet, Text,
  TextInput,
  View,
  Modal
} from 'react-native';
import { supabase } from '../lib/supabase';

type Exercise = {
  id: string;
  name: string;
  category: string;
  target?: string;
  muscle_group?: string;
  equipment?: string;
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

const CATEGORIES = ['All', 'chest', 'back', 'upper legs', 'waist', 'shoulders', 'cardio', 'upper arms', 'lower legs', 'lower arms', 'neck', 'Gym', 'Calisthenics'];

const isDefaultExercise = (name: string) => DEFAULT_GYM.includes(name) || DEFAULT_CALISTHENICS.includes(name);

export default function ExerciseManagementScreen() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseCategory, setNewExerciseCategory] = useState<'Gym' | 'Calisthenics'>('Gym');
  const [newExerciseMuscleGroups, setNewExerciseMuscleGroups] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Editing state
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<'Gym' | 'Calisthenics'>('Gym');
  const [editMuscleGroups, setEditMuscleGroups] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        fetchExercises(user.id);
      }
    };
    init();
  }, []);

  const fetchExercises = async (uid: string) => {
    setIsLoading(true);
    try {
      const cacheKey = `exercises_library_data_v3_${uid}_all`;
      const cached = await getCachedData<Exercise[]>(cacheKey);
      if (cached) {
        setExercises(cached);
        setIsLoading(false);
      }

      let allData: Exercise[] = [];
      let from = 0;
      const step = 1000;
      let fetchMore = true;

      while (fetchMore) {
        const { data, error } = await supabase
          .from('exercises')
          .select('*')
          .or(`user_id.eq.${uid},user_id.is.null`)
          .order('name', { ascending: true })
          .range(from, from + step - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          if (data.length < step) {
            fetchMore = false;
          } else {
            from += step;
          }
        } else {
          fetchMore = false;
        }
      }

      if (allData.length === 0) {
        const rowsGym = DEFAULT_GYM.map(name => ({ user_id: uid, name, category: 'Gym' }));
        const rowsCali = DEFAULT_CALISTHENICS.map(name => ({ user_id: uid, name, category: 'Calisthenics' }));
        const rows = [...rowsGym, ...rowsCali];
        const { data: inserted } = await supabase
          .from('exercises')
          .insert(rows)
          .select('*');
        setExercises(inserted || []);
        await cacheData(cacheKey, inserted || []);
      } else {
        setExercises(allData);
        await cacheData(cacheKey, allData);
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

      await fetchExercises(userId);
      Alert.alert("Sync Complete", `Successfully added ${toInsert.length} new exercises.`);
    } catch (err: any) {
      Alert.alert("Sync Error", err.message || "Failed to sync exercises.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleForceSync = async () => {
    if (!userId) return;
    setIsSyncing(true);
    try {
      await fetchExercises(userId);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddExercise = async () => {
    if (!newExerciseName.trim() || !userId) return;

    const nameLower = newExerciseName.trim().toLowerCase();
    if (exercises.some(e => e.name.toLowerCase() === nameLower)) {
      Alert.alert('Duplicate', 'An exercise with this name already exists.');
      return;
    }

    setIsSubmitting(true);
    try {
      const name = newExerciseName.trim();
      const { data, error } = await supabase
        .from('exercises')
        .insert({
          user_id: userId,
          name: name,
          category: newExerciseCategory,
          muscle_group: newExerciseMuscleGroups.length > 0 ? newExerciseMuscleGroups.join(', ') : null,
        })
        .select('*')
        .single();

      if (error) throw error;
      if (data) {
        setExercises(prev => {
          const next = [...prev, data].sort((a, b) => a.name.localeCompare(b.name));
          if (userId) cacheData(`exercises_library_data_v3_${userId}_all`, next);
          return next;
        });
        setNewExerciseName('');
        setNewExerciseMuscleGroups([]);
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
              setExercises(prev => {
                const next = prev.filter(e => e.id !== ex.id);
                if (userId) cacheData(`exercises_library_data_v3_${userId}_all`, next);
                return next;
              });
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete exercise.');
            }
          },
        },
      ]
    );
  };

  const handleOpenEditModal = (ex: Exercise) => {
    setEditingExercise(ex);
    setEditName(ex.name);
    // Ensure category matches a valid chip, or fallback to Gym so it's not unselected
    const validCategory = (ex.category === 'Gym' || ex.category === 'Calisthenics') ? ex.category : 'Gym';
    setEditCategory(validCategory as 'Gym' | 'Calisthenics');

    const predefined = ['Chest', 'Back', 'Legs', 'Arms', 'Shoulders', 'Core', 'Full Body'];
    
    const rawString = ex.muscle_group || ex.target || '';
    let parts = rawString.split(',').map(s => s.trim()).filter(Boolean);
    if (ex.category && ex.category !== 'Gym' && ex.category !== 'Calisthenics') {
      parts.push(ex.category);
    }
    
    if (parts.length > 0) {
      let parsedGroups = parts.map(pg => {
        const match = predefined.find(p => p.toLowerCase() === pg.toLowerCase());
        return match || pg;
      });
      setEditMuscleGroups(Array.from(new Set(parsedGroups)));
    } else {
      setEditMuscleGroups([]);
    }
  };

  const handleUpdateExercise = async () => {
    if (!editingExercise || !userId) return;
    
    // If name changed, check for duplicates
    const nameLower = editName.trim().toLowerCase();
    if (nameLower !== editingExercise.name.toLowerCase() && exercises.some(e => e.name.toLowerCase() === nameLower)) {
      Alert.alert('Duplicate', 'An exercise with this name already exists.');
      return;
    }

    setIsUpdating(true);
    try {
      const { data, error } = await supabase
        .from('exercises')
        .update({
          name: editName.trim(),
          category: editCategory,
          muscle_group: editMuscleGroups.length > 0 ? editMuscleGroups.join(', ') : null,
        })
        .eq('id', editingExercise.id)
        .select('*')
        .single();

      if (error) throw error;
      if (data) {
        setExercises(prev => {
          const next = prev.map(e => e.id === data.id ? data : e).sort((a, b) => a.name.localeCompare(b.name));
          cacheData(`exercises_library_data_v3_${userId}_all`, next);
          return next;
        });
        setEditingExercise(null);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update exercise.');
    } finally {
      setIsUpdating(false);
    }
  };

  const renderExerciseItem = ({ item }: { item: Exercise }) => {
    const displayCat = (item.category === 'Gym' || item.category === 'Calisthenics') ? item.category : 'Gym';
    
    const rawString = item.muscle_group || item.target || '';
    let parts = rawString.split(',').map(s => s.trim()).filter(Boolean);
    if (item.category && item.category !== 'Gym' && item.category !== 'Calisthenics') {
      parts.push(item.category);
    }
    const displayMuscles = Array.from(new Set(parts)).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' • ');

    return (
      <Pressable style={styles.exerciseCard} onPress={() => handleOpenEditModal(item)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.exerciseName}>{item.name}</Text>
          <Text style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
            {displayCat}{displayMuscles ? ` • ${displayMuscles}` : ''}
          </Text>
        </View>
      </Pressable>
    );
  };

  const filteredExercises = useMemo(() => {
    // 1. Deduplicate by name (prefer well-formed categories)
    const uniqueMap = new Map<string, Exercise>();
    for (const e of exercises) {
      const key = e.name.toLowerCase().trim();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, e);
      } else {
        if (e.category === 'Gym' || e.category === 'Calisthenics') {
          uniqueMap.set(key, e); // Overwrite with better version
        }
      }
    }
    const uniqueExercises = Array.from(uniqueMap.values());

    // 2. Filter based on user search and tabs
    const normalizedSearch = searchQuery.toLowerCase().replace(/[\s-]/g, '');

    return uniqueExercises.filter(e => {
      const normalizedName = e.name.toLowerCase().replace(/[\s-]/g, '');
      if (!normalizedName.includes(normalizedSearch)) return false;
      
      if (selectedCategory === 'All') return true;
      if (selectedCategory === 'Calisthenics') return e.equipment === 'body weight' || e.category === 'Calisthenics';
      if (selectedCategory === 'Gym') return (e.equipment && e.equipment !== 'body weight') || e.category === 'Gym';
      return e.category?.toLowerCase() === selectedCategory.toLowerCase();
    });
  }, [exercises, searchQuery, selectedCategory]);

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

      <FlatList
        data={filteredExercises}
        keyExtractor={item => item.id}
        renderItem={renderExerciseItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        ListHeaderComponent={
          <>
            {/* Sync Button */}
            <View className="px-5 mt-4">
              <Pressable
                className="bg-[#1A1A1A] border border-[#222222] flex-row items-center justify-center py-3 rounded-xl"
                onPress={handleForceSync}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <ActivityIndicator color="#39FF14" size="small" />
                ) : (
                  <>
                    <Text className="text-white font-bold mr-2">🔄</Text>
                    <Text className="text-white font-bold">Sync Defaults from Cloud</Text>
                  </>
                )}
              </Pressable>
            </View>

            {/* Search */}
            <View className="px-5 mt-4">
              <TextInput
                className="bg-[#1A1A1A] border border-[#1E1E1E] text-white px-4 py-3 rounded-xl placeholder-[#888888]"
                placeholder="Search..."
                placeholderTextColor="#888888"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Category Chips */}
            <View className="mt-4 mb-4">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat}
                    onPress={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 rounded-full mr-2 ${selectedCategory === cat ? 'bg-[#39FF14]' : 'bg-[#1A1A1A] border border-[#222222]'}`}
                  >
                    <Text className={`font-bold ${selectedCategory === cat ? 'text-black' : 'text-white'}`}>
                      {cat === 'All' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Input Section */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Add Custom {selectedCategory === 'All' ? 'Exercise' : selectedCategory}</Text>
              <View className="mb-2">
                <TextInput
                  style={styles.textInput}
                  placeholder={`Exercise Name (e.g. Incline Dumbbell Press)`}
                  placeholderTextColor="#555555"
                  value={newExerciseName}
                  onChangeText={setNewExerciseName}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                <Pressable
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: newExerciseCategory === 'Gym' ? '#39FF14' : '#222222',
                    backgroundColor: newExerciseCategory === 'Gym' ? 'rgba(57, 255, 20, 0.1)' : '#1A1A1A',
                  }}
                  onPress={() => setNewExerciseCategory('Gym')}
                >
                  <Text style={{ color: newExerciseCategory === 'Gym' ? '#39FF14' : '#888888', fontWeight: 'bold' }}>
                    🏋️ Gym
                  </Text>
                </Pressable>

                <Pressable
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: newExerciseCategory === 'Calisthenics' ? '#39FF14' : '#222222',
                    backgroundColor: newExerciseCategory === 'Calisthenics' ? 'rgba(57, 255, 20, 0.1)' : '#1A1A1A',
                  }}
                  onPress={() => setNewExerciseCategory('Calisthenics')}
                >
                  <Text style={{ color: newExerciseCategory === 'Calisthenics' ? '#39FF14' : '#888888', fontWeight: 'bold' }}>
                    🤸 Calisthenics
                  </Text>
                </Pressable>
              </View>

              <Text style={{ color: '#888', marginBottom: 8, fontSize: 14 }}>Muscle Groups (Optional)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {['Chest', 'Back', 'Legs', 'Arms', 'Shoulders', 'Core', 'Full Body'].map((mg) => {
                  const isSelected = newExerciseMuscleGroups.includes(mg);
                  return (
                    <Pressable
                      key={mg}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: isSelected ? '#39FF14' : '#333',
                        backgroundColor: isSelected ? 'rgba(57, 255, 20, 0.1)' : '#1A1A1A',
                      }}
                      onPress={() => {
                        setNewExerciseMuscleGroups(prev => 
                          prev.includes(mg) ? prev.filter(g => g !== mg) : [...prev, mg]
                        );
                      }}
                    >
                      <Text style={{ color: isSelected ? '#39FF14' : '#888', fontSize: 12 }}>
                        {mg}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                className="bg-[#39FF14] px-4 py-3 rounded-xl items-center"
                onPress={handleAddExercise}
                disabled={isSubmitting || !newExerciseName.trim()}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#0A0A0A" size="small" />
                ) : (
                  <Text className="text-black font-bold text-base">Add Exercise</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.listSection}>
              <Text style={styles.listHeader}>Your Exercises ({filteredExercises.length})</Text>
            </View>
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator color="#39FF14" size="large" />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {searchQuery ? 'No matching exercises found.' : `No exercises found in this category.\nAdd one above to get started!`}
              </Text>
            </View>
          )
        }
      />

      {/* Edit Exercise Modal */}
      <Modal
        visible={editingExercise !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditingExercise(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Exercise</Text>
              <Pressable onPress={() => setEditingExercise(null)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: '#888', marginBottom: 8, fontSize: 14 }}>Exercise Name</Text>
                <TextInput
                  style={[styles.textInput, editingExercise && isDefaultExercise(editingExercise.name) && { backgroundColor: '#1A1A1A', color: '#555' }]}
                  value={editName}
                  onChangeText={setEditName}
                  editable={editingExercise ? !isDefaultExercise(editingExercise.name) : true}
                  placeholder="Exercise Name"
                  placeholderTextColor="#555"
                />
                {editingExercise && isDefaultExercise(editingExercise.name) && (
                  <Text style={{ color: '#555', fontSize: 12, marginTop: 4 }}>Default exercises cannot be renamed.</Text>
                )}
              </View>

              <Text style={{ color: '#888', marginBottom: 8, fontSize: 14 }}>Category</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                <Pressable
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: editCategory === 'Gym' ? '#39FF14' : '#222222',
                    backgroundColor: editCategory === 'Gym' ? 'rgba(57, 255, 20, 0.1)' : '#1A1A1A',
                  }}
                  onPress={() => setEditCategory('Gym')}
                >
                  <Text style={{ color: editCategory === 'Gym' ? '#39FF14' : '#888888', fontWeight: 'bold' }}>
                    🏋️ Gym
                  </Text>
                </Pressable>
                
                <Pressable
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: editCategory === 'Calisthenics' ? '#39FF14' : '#222222',
                    backgroundColor: editCategory === 'Calisthenics' ? 'rgba(57, 255, 20, 0.1)' : '#1A1A1A',
                  }}
                  onPress={() => setEditCategory('Calisthenics')}
                >
                  <Text style={{ color: editCategory === 'Calisthenics' ? '#39FF14' : '#888888', fontWeight: 'bold' }}>
                    🤸 Calisthenics
                  </Text>
                </Pressable>
              </View>

              <Text style={{ color: '#888', marginBottom: 8, fontSize: 14 }}>Muscle Groups</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                {Array.from(new Set(['Chest', 'Back', 'Legs', 'Arms', 'Shoulders', 'Core', 'Full Body', ...editMuscleGroups])).map((mg) => {
                  const isSelected = editMuscleGroups.includes(mg);
                  return (
                    <Pressable
                      key={mg}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: isSelected ? '#39FF14' : '#333',
                        backgroundColor: isSelected ? 'rgba(57, 255, 20, 0.1)' : '#1A1A1A',
                      }}
                      onPress={() => {
                        setEditMuscleGroups(prev => 
                          prev.includes(mg) ? prev.filter(g => g !== mg) : [...prev, mg]
                        );
                      }}
                    >
                      <Text style={{ color: isSelected ? '#39FF14' : '#888', fontSize: 12, textTransform: 'capitalize' }}>
                        {mg}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={{
                  backgroundColor: '#39FF14',
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: 'center',
                  marginBottom: 16
                }}
                onPress={handleUpdateExercise}
                disabled={isUpdating || !editName.trim()}
              >
                {isUpdating ? (
                  <ActivityIndicator color="#0A0A0A" />
                ) : (
                  <Text style={{ color: '#0A0A0A', fontWeight: 'bold', fontSize: 16 }}>Save Changes</Text>
                )}
              </Pressable>

              {editingExercise && !isDefaultExercise(editingExercise.name) && (
                <Pressable
                  style={{
                    backgroundColor: 'rgba(255, 59, 48, 0.1)',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 59, 48, 0.3)',
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: 'center',
                  }}
                  onPress={() => {
                    handleDeleteExercise(editingExercise);
                    setEditingExercise(null);
                  }}
                >
                  <Text style={{ color: '#FF3B30', fontWeight: 'bold', fontSize: 16 }}>Delete Exercise</Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0F0F0F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalCloseText: {
    color: '#888',
    fontSize: 24,
    fontWeight: '300',
  },
});
