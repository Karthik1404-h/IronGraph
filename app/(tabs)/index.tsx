import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

type RecentWorkout = {
  id: string;
  start_time: string;
  end_time: string | null;
  exerciseCount: number;
  totalSets: number;
  totalVolume: number;
};

export default function HomeScreen() {
  const router = useRouter();
  const [recentWorkouts, setRecentWorkouts] = useState<RecentWorkout[]>([]);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

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

      const { count } = await supabase
        .from('workouts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .not('end_time', 'is', null);

      setTotalWorkouts(count || 0);

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
            .select('exercise_id, weight, reps')
            .eq('workout_id', w.id);

          const uniqueExercises = new Set((sets || []).map(s => s.exercise_id));
          const totalVolume = (sets || []).reduce((sum: number, s: any) => sum + (Number(s.weight) * Number(s.reps)), 0);

          enriched.push({
            id: w.id,
            start_time: w.start_time,
            end_time: w.end_time,
            exerciseCount: uniqueExercises.size,
            totalSets: (sets || []).length,
            totalVolume,
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

  const renderWorkoutItem = ({ item }: { item: RecentWorkout }) => (
    <View style={styles.workoutCard}>
      <View style={styles.workoutCardLeft}>
        <Text style={styles.workoutDate}>{formatDate(item.start_time)}</Text>
        <Text style={styles.workoutMeta}>
          {item.exerciseCount} exercise{item.exerciseCount !== 1 ? 's' : ''} · {item.totalSets} set{item.totalSets !== 1 ? 's' : ''}
        </Text>
      </View>
      <View style={styles.workoutCardRight}>
        <Text style={styles.workoutDuration}>{formatDuration(item.start_time, item.end_time)}</Text>
        <Text style={styles.workoutVolume}>{item.totalVolume.toLocaleString()} kg</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
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
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{totalWorkouts}</Text>
          <Text style={styles.statLabel}>Workouts</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>
            {recentWorkouts.length > 0 ? formatDuration(recentWorkouts[0].start_time, recentWorkouts[0].end_time) : '--'}
          </Text>
          <Text style={styles.statLabel}>Last Duration</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>
            {recentWorkouts.length > 0 ? `${(recentWorkouts[0].totalVolume / 1000).toFixed(1)}k` : '--'}
          </Text>
          <Text style={styles.statLabel}>Last Volume</Text>
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
          <FlatList
            data={recentWorkouts}
            keyExtractor={(item) => item.id}
            renderItem={renderWorkoutItem}
            showsVerticalScrollIndicator={false}
          />
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
    </View>
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
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E1E1E',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#39FF14',
  },
  statLabel: {
    fontSize: 12,
    color: '#888888',
    marginTop: 4,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222222',
  },
  workoutCardLeft: {},
  workoutDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  workoutMeta: {
    fontSize: 13,
    color: '#888888',
    marginTop: 4,
  },
  workoutCardRight: {
    alignItems: 'flex-end',
  },
  workoutDuration: {
    fontSize: 16,
    fontWeight: '600',
    color: '#39FF14',
  },
  workoutVolume: {
    fontSize: 13,
    color: '#888888',
    marginTop: 4,
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
