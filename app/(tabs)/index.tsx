import { cacheData, getCachedData } from '@/lib/cache';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Routine } from '../../types/routines';

type WorkoutSet = {
  weight: number;
  reps: number;
  setNumber: number;
};

type WorkoutExercise = {
  name: string;
  category: 'Gym' | 'Calisthenics';
  sets: WorkoutSet[];
};

type RecentWorkout = {
  id: string;
  start_time: string;
  end_time: string | null;
  exerciseCount: number;
  totalSets: number;
  totalVolume: number;
  exercises: WorkoutExercise[];
};

export default function HomeScreen() {
  const router = useRouter();
  const [recentWorkouts, setRecentWorkouts] = useState<RecentWorkout[]>([]);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [workoutsLast7Days, setWorkoutsLast7Days] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [expandedWorkouts, setExpandedWorkouts] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedWorkouts(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRoutineLongPress = (routine: Routine) => {
    Alert.alert(
      'Routine Options',
      `What would you like to do with "${routine.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Edit', 
          onPress: () => {
            setIsModalVisible(false);
            // @ts-ignore - Expo router types will regenerate on start
            router.push({ pathname: '/create-routine', params: { routineId: routine.id } });
          } 
        },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('routines').delete().eq('id', routine.id);
              if (error) throw error;
              setRoutines(prev => prev.filter(r => r.id !== routine.id));
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete routine');
            }
          }
        },
      ]
    );
  };


  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchDashboardData();
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
    }, [])
  );

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const cached = await getCachedData<{
        recentWorkouts: RecentWorkout[];
        currentStreak: number;
        longestStreak: number;
        workoutsLast7Days: number;
      }>('home_dashboard_data');

      if (cached) {
        setRecentWorkouts(cached.recentWorkouts);
        setCurrentStreak(cached.currentStreak);
        setLongestStreak(cached.longestStreak);
        setWorkoutsLast7Days(cached.workoutsLast7Days);
        setIsLoading(false);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let finalStreak = 0;
      let finalLongestStreak = 0;
      let finalWorkoutsLast7Days = 0;

      // Fetch all workout times to calculate streaks & 7 day volume
      const { data: allWorkouts } = await supabase
        .from('workouts')
        .select('start_time')
        .eq('user_id', user.id)
        .not('end_time', 'is', null)
        .order('start_time', { ascending: false });

      if (allWorkouts && allWorkouts.length > 0) {
        const today = new Date();
        const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        const yesterdayNormalized = todayNormalized - 86400000;

        const dates = allWorkouts.map(w => {
          const d = new Date(w.start_time);
          return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        });

        const uniqueDatesDesc = Array.from(new Set(dates));
        uniqueDatesDesc.sort((a, b) => b - a);

        let streak = 0;
        let expectedDate = todayNormalized;

        if (uniqueDatesDesc[0] === todayNormalized) {
          streak = 1;
          expectedDate = yesterdayNormalized;
        } else if (uniqueDatesDesc[0] === yesterdayNormalized) {
          streak = 1;
          expectedDate = yesterdayNormalized - 86400000;
        }

        if (streak > 0) {
          for (let i = 1; i < uniqueDatesDesc.length; i++) {
            if (uniqueDatesDesc[i] === expectedDate) {
              streak++;
              expectedDate -= 86400000;
            } else {
              break;
            }
          }
        }
        finalStreak = streak;
        setCurrentStreak(streak);

        let maxStreak = 0;
        if (uniqueDatesDesc.length > 0) {
          let currentLoopStreak = 1;
          for (let i = 0; i < uniqueDatesDesc.length - 1; i++) {
            if (uniqueDatesDesc[i] - uniqueDatesDesc[i + 1] === 86400000) {
              currentLoopStreak++;
            } else {
              if (currentLoopStreak > maxStreak) maxStreak = currentLoopStreak;
              currentLoopStreak = 1;
            }
          }
          if (currentLoopStreak > maxStreak) maxStreak = currentLoopStreak;
          finalLongestStreak = maxStreak;
          setLongestStreak(maxStreak);
        } else {
          setLongestStreak(0);
        }

        const sevenDaysAgo = today.getTime() - (7 * 86400000);
        const last7DaysCount = allWorkouts.filter(w => new Date(w.start_time).getTime() >= sevenDaysAgo).length;
        finalWorkoutsLast7Days = last7DaysCount;
        setWorkoutsLast7Days(last7DaysCount);
      } else {
        setCurrentStreak(0);
        setLongestStreak(0);
        setWorkoutsLast7Days(0);
      }

      const { data: workouts } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user.id)
        .not('end_time', 'is', null)
        .order('start_time', { ascending: false })
        .limit(5);

      if (workouts && workouts.length > 0) {
        const enriched: RecentWorkout[] = [];
        for (const w of workouts) {
          const { data: sets } = await supabase
            .from('workout_sets')
            .select('exercise_id, weight, reps, set_number, exercises(name, category)')
            .eq('workout_id', w.id)
            .order('id', { ascending: true });

          const uniqueExercises = new Set((sets || []).map((s: any) => s.exercise_id));
          const totalVolume = (sets || []).reduce((sum: number, s: any) => sum + (Number(s.weight) * Number(s.reps)), 0);

          // Group sets by exercise name
          const exerciseMap = new Map<string, WorkoutExercise>();
          for (const s of (sets || []) as any[]) {
            const exName: string = s.exercises?.name || 'Unknown Exercise';
            const exCategoryRaw = s.exercises?.category || 'Gym';
            const exCategory: 'Gym' | 'Calisthenics' = (exCategoryRaw === 'Gym' || exCategoryRaw === 'Calisthenics') ? exCategoryRaw : 'Gym';
            if (!exerciseMap.has(exName)) {
              exerciseMap.set(exName, { name: exName, category: exCategory, sets: [] });
            }
            exerciseMap.get(exName)!.sets.push({
              weight: Number(s.weight),
              reps: Number(s.reps),
              setNumber: Number(s.set_number),
            });
          }

          enriched.push({
            id: w.id,
            start_time: w.start_time,
            end_time: w.end_time,
            exerciseCount: uniqueExercises.size,
            totalSets: (sets || []).length,
            totalVolume,
            exercises: Array.from(exerciseMap.values()),
          });
        }
        setRecentWorkouts(enriched);
        await cacheData('home_dashboard_data', {
          recentWorkouts: enriched,
          currentStreak: finalStreak,
          longestStreak: finalLongestStreak,
          workoutsLast7Days: finalWorkoutsLast7Days,
        });
      } else {
        setRecentWorkouts([]);
        await cacheData('home_dashboard_data', {
          recentWorkouts: [],
          currentStreak: finalStreak,
          longestStreak: finalLongestStreak,
          workoutsLast7Days: finalWorkoutsLast7Days,
        });
      }

      const { data: routinesData } = await supabase
        .from('routines')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (routinesData) {
        setRoutines(routinesData);
      }
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return '--';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleDeleteWorkout = (workoutId: string) => {
    Alert.alert(
      "Delete Workout",
      "Are you sure you want to delete this workout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase.from('workouts').delete().eq('id', workoutId);
              if (error) throw error;
              setRecentWorkouts(prev => prev.filter(w => w.id !== workoutId));
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to delete workout.");
            }
          }
        }
      ]
    );
  };

  const renderWorkoutItem = ({ item }: { item: RecentWorkout }) => {
    const isExpanded = !!expandedWorkouts[item.id];
    const visibleExercises = isExpanded ? item.exercises : item.exercises.slice(0, 3);
    const hiddenCount = item.exercises.length - visibleExercises.length;

    return (
      <Pressable 
        style={styles.workoutCard}
        onPress={() => router.push({ pathname: '/workout', params: { editWorkoutId: item.id } })}
        onLongPress={() => handleDeleteWorkout(item.id)}
      >
        {/* Header Row */}
        <View className="flex-row justify-between items-start mb-2">
          <View>
            <Text className="text-base font-semibold text-white">{formatDate(item.start_time)}</Text>
            <Text className="text-[13px] text-[#888888] mt-1">
              {item.exerciseCount} exercise{item.exerciseCount !== 1 ? 's' : ''} · {item.totalSets} set{item.totalSets !== 1 ? 's' : ''}
            </Text>
          </View>

        </View>

        {/* Exercise Details */}
        {visibleExercises.length > 0 && (
          <View style={styles.exerciseList}>
            {visibleExercises.map((ex, idx) => (
              <View key={idx} style={[styles.exerciseRow, { marginBottom: idx < visibleExercises.length - 1 ? 10 : 0 }]}>
                <Text style={styles.exerciseName}>{ex.name}</Text>
                <View style={styles.setsRow}>
                  {ex.sets.map((set, si) => (
                    <View key={si} style={styles.setChip}>
                      <Text style={styles.setChipText}>
                        {set.weight > 0 ? `${set.weight}kg` : 'BW'} × {set.reps}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
            {item.exercises.length > 3 && (
              <Pressable 
                onPress={() => toggleExpand(item.id)} 
                style={{ marginTop: 8, paddingVertical: 4 }}
              >
                <Text style={styles.moreBadge}>
                  {isExpanded ? '- Show less' : `+${hiddenCount} more exercise${hiddenCount !== 1 ? 's' : ''}`}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={refreshing} tintColor="#39FF14" />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Home</Text>
      </View>

      {/* Stats Row */}
      <View className="flex-row gap-3 mb-6">
        <View className="flex-1 bg-[#1A1A1A] rounded-2xl p-4 items-center border border-[#1E1E1E]">
          <Text className="text-[22px] font-bold text-[#39FF14]">{currentStreak}</Text>
          <Text className="text-xs text-[#888888] mt-1 text-center">Current Streak</Text>
        </View>
        <View className="flex-1 bg-[#1A1A1A] rounded-2xl p-4 items-center border border-[#1E1E1E]">
          <Text className="text-[22px] font-bold text-[#39FF14]">{longestStreak}</Text>
          <Text className="text-xs text-[#888888] mt-1 text-center">Longest Streak</Text>
        </View>
        <View className="flex-1 bg-[#1A1A1A] rounded-2xl p-4 items-center border border-[#1E1E1E]">
          <Text className="text-[22px] font-bold text-[#39FF14]">{workoutsLast7Days}</Text>
          <Text className="text-[11px] text-[#888888] mt-1 text-center leading-tight">Workouts in last 7 days</Text>
        </View>
      </View>

      {/* Log a Workout Button */}
      <Pressable
        style={({ pressed }) => pressed ? [styles.addWorkoutBtn, styles.addWorkoutBtnPressed] : styles.addWorkoutBtn}
        onPress={() => setIsModalVisible(true)}
      >
        <View style={styles.addWorkoutInner}>
          <View>
            <Text style={styles.addWorkoutText}>Log a Workout</Text>
            <Text style={styles.addWorkoutSub}>Start a session or pick a routine</Text>
          </View>
          <View style={styles.chevronCircle}>
            <Text style={styles.chevronIcon}>›</Text>
          </View>
        </View>
      </Pressable>

      {/* Create a Routine Button */}
      <Pressable
        style={({ pressed }) => pressed ? [styles.addWorkoutBtn, styles.addWorkoutBtnPressed] : styles.addWorkoutBtn}
        // @ts-ignore - Expo router types will regenerate on start
        onPress={() => router.push('/create-routine')}
      >
        <View style={styles.addWorkoutInner}>
          <View>
            <Text style={styles.addWorkoutText}>Create a Routine</Text>
            <Text style={styles.addWorkoutSub}>Build a new custom template</Text>
          </View>
          <View style={styles.chevronCircle}>
            <Text style={styles.chevronIcon}>+</Text>
          </View>
        </View>
      </Pressable>

      {/* Recent Workouts */}
      <View style={styles.recentSection}>
        <Text style={styles.sectionTitle}>Recent Workouts</Text>
        {isLoading ? (
          <ActivityIndicator color="#39FF14" style={{ marginTop: 20 }} />
        ) : recentWorkouts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateEmoji}>🏋️</Text>
            <Text style={styles.emptyStateText}>
              No workouts yet.{'\n'}Tap 'Add a Workout' above to begin!
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {recentWorkouts.map(item => (
              <View key={item.id}>
                {renderWorkoutItem({ item })}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Log Workout Modal */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View className="flex-1 bg-black/90 justify-end">
          <View className="bg-[#141414] rounded-t-[32px] p-6 pb-12 border-t border-[#222222]">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-bold text-white">Log a Workout</Text>
              <Pressable onPress={() => setIsModalVisible(false)} className="p-2">
                <Text className="text-gray-400 text-lg font-bold">✕</Text>
              </Pressable>
            </View>
            
            <Pressable
              className="bg-[#39FF14] p-4 rounded-2xl flex-row items-center justify-center mb-6"
              onPress={() => {
                setIsModalVisible(false);
                router.push('/workout');
              }}
            >
              <Text className="text-black font-bold text-lg">+ Start Empty Workout</Text>
            </Pressable>

            {routines.length > 0 && (
              <View className="mb-4">
                <Text className="text-gray-400 text-sm font-bold uppercase tracking-wider mt-4 mb-4 ml-1">Your Routines</Text>
                {routines.map(routine => (
                  <Pressable
                    key={routine.id}
                    className="bg-[#222222] p-4 rounded-2xl flex-row items-center justify-between mb-3"
                    onPress={() => {
                      setIsModalVisible(false);
                      router.push({ pathname: '/workout', params: { routineId: routine.id } });
                    }}
                    onLongPress={() => handleRoutineLongPress(routine)}
                  >
                    <Text className="text-white text-lg font-bold">{routine.name}</Text>
                    <Text className="text-gray-500 text-xl">›</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },

  addWorkoutBtn: {
    backgroundColor: '#141414',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#39FF14',
    marginBottom: 32,
    shadowColor: '#39FF14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  addWorkoutBtnPressed: {
    backgroundColor: '#0D1A0D',
    transform: [{ scale: 0.98 }],
  },
  addWorkoutInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 22,
    paddingHorizontal: 24,
  },
  addWorkoutText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  addWorkoutSub: {
    fontSize: 14,
    color: '#888888',
    marginTop: 4,
  },
  chevronCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#39FF14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronIcon: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0A0A0A',
    marginTop: -2,
  },
  recentSection: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  workoutCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222222',
  },

  exerciseList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
    gap: 10,
  },
  exerciseRow: {
    gap: 6,
  },
  exerciseName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CCCCCC',
  },
  setsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  setChip: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#333333',
  },
  setChipText: {
    fontSize: 12,
    color: '#39FF14',
    fontWeight: '500',
  },
  moreBadge: {
    fontSize: 12,
    color: '#666666',
    fontStyle: 'italic',
    marginTop: 2,
  },
  emptyState: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222222',
  },
  emptyStateEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: '#141414',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#888888',
    marginBottom: 24,
  },
  categoryCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  categoryCardPressed: {
    borderColor: '#39FF14',
    backgroundColor: '#0D1A0D',
  },
  categoryEmoji: {
    fontSize: 36,
    marginRight: 16,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  categoryDesc: {
    fontSize: 13,
    color: '#888888',
    marginTop: 3,
  },
  categoryChevron: {
    fontSize: 26,
    color: '#39FF14',
    fontWeight: 'bold',
  },
  cancelBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  cancelBtnText: {
    fontSize: 16,
    color: '#AAAAAA',
    fontWeight: '600',
  },
});
