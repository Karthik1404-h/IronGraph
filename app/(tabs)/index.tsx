import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View, ScrollView, RefreshControl } from 'react-native';
import { supabase } from '../../lib/supabase';

type WorkoutSet = {
  weight: number;
  reps: number;
  setNumber: number;
};

type WorkoutExercise = {
  name: string;
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
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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
        setCurrentStreak(streak);

        let maxStreak = 0;
        if (uniqueDatesDesc.length > 0) {
          let currentLoopStreak = 1;
          for (let i = 0; i < uniqueDatesDesc.length - 1; i++) {
            if (uniqueDatesDesc[i] - uniqueDatesDesc[i+1] === 86400000) {
              currentLoopStreak++;
            } else {
              if (currentLoopStreak > maxStreak) maxStreak = currentLoopStreak;
              currentLoopStreak = 1;
            }
          }
          if (currentLoopStreak > maxStreak) maxStreak = currentLoopStreak;
          setLongestStreak(maxStreak);
        } else {
          setLongestStreak(0);
        }

        const sevenDaysAgo = today.getTime() - (7 * 86400000);
        const last7DaysCount = allWorkouts.filter(w => new Date(w.start_time).getTime() >= sevenDaysAgo).length;
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
            .select('exercise_id, weight, reps, set_number, exercises(name)')
            .eq('workout_id', w.id)
            .order('set_number', { ascending: true });

          const uniqueExercises = new Set((sets || []).map((s: any) => s.exercise_id));
          const totalVolume = (sets || []).reduce((sum: number, s: any) => sum + (Number(s.weight) * Number(s.reps)), 0);

          // Group sets by exercise name
          const exerciseMap = new Map<string, WorkoutExercise>();
          for (const s of (sets || []) as any[]) {
            const exName: string = s.exercises?.name || 'Unknown Exercise';
            if (!exerciseMap.has(exName)) {
              exerciseMap.set(exName, { name: exName, sets: [] });
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
      } else {
        setRecentWorkouts([]);
      }
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategorySelect = (category: 'Gym' | 'Calisthenics') => {
    setShowCategoryPicker(false);
    router.push(`/workout?category=${category}`);
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
    const visibleExercises = item.exercises.slice(0, 3);
    const hiddenCount = item.exercises.length - visibleExercises.length;

    return (
      <View style={styles.workoutCard}>
        {/* Header Row */}
        <View className="flex-row justify-between items-start mb-2">
          <View>
            <Text className="text-base font-semibold text-white">{formatDate(item.start_time)}</Text>
            <Text className="text-[13px] text-[#888888] mt-1">
              {item.exerciseCount} exercise{item.exerciseCount !== 1 ? 's' : ''} · {item.totalSets} set{item.totalSets !== 1 ? 's' : ''}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => router.push({ pathname: '/workout', params: { editWorkoutId: item.id } })}
              className="bg-blue-500/10 p-2 rounded-lg"
            >
              <Text className="text-blue-400 text-sm">✏️</Text>
            </Pressable>
            <Pressable 
              onPress={() => handleDeleteWorkout(item.id)}
              className="bg-red-500/10 p-2 rounded-lg ml-1"
            >
              <Text className="text-red-500 text-sm">🗑️</Text>
            </Pressable>
          </View>
        </View>

        {/* Exercise Details */}
        {visibleExercises.length > 0 && (
          <View style={styles.exerciseList}>
            {visibleExercises.map((ex, idx) => (
              <View key={idx} style={styles.exerciseRow}>
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
            {hiddenCount > 0 && (
              <Text style={styles.moreBadge}>+{hiddenCount} more exercise{hiddenCount > 1 ? 's' : ''}</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={refreshing} tintColor="#39FF14"/>}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Home</Text>
        <Pressable
          style={({ pressed }) => pressed ? [styles.manageLink, { opacity: 0.6 }] : styles.manageLink}
          onPress={() => router.push('/exercises')}
        >
          <Text style={styles.manageLinkText}>Manage Exercises</Text>
          <Text style={styles.manageLinkArrow}>›</Text>
        </Pressable>
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

      {/* Clean, Prominent 'Add a Workout' CTA with directional arrow */}
      <Pressable
        style={({ pressed }) => pressed ? [styles.addWorkoutBtn, styles.addWorkoutBtnPressed] : styles.addWorkoutBtn}
        onPress={() => setShowCategoryPicker(true)}
      >
        <View style={styles.addWorkoutInner}>
          <View>
            <Text style={styles.addWorkoutText}>Add a Workout</Text>
            <Text style={styles.addWorkoutSub}>Select category and start session</Text>
          </View>
          <View style={styles.chevronCircle}>
            <Text style={styles.chevronIcon}>›</Text>
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

      {/* Category Picker Modal */}
      <Modal
        visible={showCategoryPicker}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Choose Category</Text>
            <Text style={styles.modalSubtitle}>What are you training today?</Text>

            <Pressable
              style={({ pressed }) => pressed ? [styles.categoryCard, styles.categoryCardPressed] : styles.categoryCard}
              onPress={() => handleCategorySelect('Gym')}
            >
              <Text style={styles.categoryEmoji}>🏋️</Text>
              <View style={styles.categoryInfo}>
                <Text style={styles.categoryName}>Gym</Text>
                <Text style={styles.categoryDesc}>Weights, machines & cables</Text>
              </View>
              <Text style={styles.categoryChevron}>›</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => pressed ? [styles.categoryCard, styles.categoryCardPressed] : styles.categoryCard}
              onPress={() => handleCategorySelect('Calisthenics')}
            >
              <Text style={styles.categoryEmoji}>🤸</Text>
              <View style={styles.categoryInfo}>
                <Text style={styles.categoryName}>Calisthenics</Text>
                <Text style={styles.categoryDesc}>Bodyweight & functional</Text>
              </View>
              <Text style={styles.categoryChevron}>›</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => pressed ? [styles.cancelBtn, { opacity: 0.7 }] : styles.cancelBtn}
              onPress={() => setShowCategoryPicker(false)}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
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
    paddingHorizontal: 24,
    paddingTop: 60,
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
  manageLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  manageLinkText: {
    fontSize: 13,
    color: '#39FF14',
    fontWeight: '600',
  },
  manageLinkArrow: {
    fontSize: 16,
    color: '#39FF14',
    fontWeight: 'bold',
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
