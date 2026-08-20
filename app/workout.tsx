import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, Text, View, Pressable, TextInput, FlatList,
  Alert, ActivityIndicator, ScrollView, Modal, KeyboardAvoidingView, Platform, BackHandler
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';

type Exercise = {
  id: string;
  name: string;
  category: 'Gym' | 'Calisthenics';
};

type SetEntry = {
  set_number: number;
  weight: string;
  reps: string;
  logged: boolean;
  loggedAt?: string;
};

type SelectedExercise = {
  exercise: Exercise;
  sets: SetEntry[];
  pr: { weight: number; reps: number } | null;
};

const STANDARD_WEIGHTS = ['0', '2.5', '5', '7.5', '10', '12.5', '15', '17.5', '20', '22.5', '25', '30', '35', '40', '45', '50', '60', '70', '80', '90', '100', '120', '140', '160', '180', '200'];

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

export default function WorkoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const category = (params.category as 'Gym' | 'Calisthenics') || 'Gym';

  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<SelectedExercise[]>([]);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState('');
  const [showWeightPickerModal, setShowWeightPickerModal] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{ exIdx: number; setIdx: number } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [summaryData, setSummaryData] = useState<{
    duration: string;
    totalSets: number;
    totalVolume: number;
    exerciseCount: number;
    newPRs: string[];
    startTime: string;
    exercises: Array<{
      name: string;
      sets: Array<{ set_number: number; weight: number; reps: number; loggedAt?: string }>;
    }>;
  } | null>(null);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        await startWorkoutSession(user.id);
        await loadExercises(user.id, category);
      }
    };
    init();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [category]);



  const startWorkoutSession = async (uid: string) => {
    try {
      const { data: workout, error } = await supabase
        .from('workouts')
        .insert({ user_id: uid })
        .select('*')
        .single();

      if (error || !workout) throw error || new Error('Failed to create workout');
      setWorkoutId(workout.id);

      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to start workout session.');
    }
  };

  const loadExercises = async (uid: string, cat: 'Gym' | 'Calisthenics') => {
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
        const { data: inserted } = await supabase.from('exercises').insert(rows).select('*');
        setAvailableExercises(inserted || []);
      } else {
        setAvailableExercises(data);
      }
    } catch (err: any) {
      console.error('Error loading exercises:', err.message);
    }
  };

  const handleSelectExerciseToAdd = async (ex: Exercise) => {
    setShowExerciseModal(false);
    if (!userId) return;

    // Check if already added
    if (selectedExercises.some(se => se.exercise.id === ex.id)) {
      Alert.alert('Already Added', `${ex.name} is already in your session.`);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch historical PR for this exercise
      const { data: bestSets } = await supabase
        .from('workout_sets')
        .select('weight, reps')
        .eq('exercise_id', ex.id)
        .eq('user_id', userId)
        .order('weight', { ascending: false })
        .limit(1);

      const pr = bestSets && bestSets.length > 0
        ? { weight: Number(bestSets[0].weight), reps: Number(bestSets[0].reps) }
        : null;

      // Automatically generate 2 standard sets by default
      const initialSets: SetEntry[] = [
        { set_number: 1, weight: '', reps: '', logged: false },
        { set_number: 2, weight: '', reps: '', logged: false }
      ];

      setSelectedExercises(prev => [...prev, {
        exercise: ex,
        sets: initialSets,
        pr
      }]);
    } catch (err: any) {
      Alert.alert('Error', 'Could not add exercise.');
    } finally {
      setIsLoading(false);
    }
  };

  const updateSet = (exerciseIdx: number, setIdx: number, field: 'weight' | 'reps', value: string) => {
    setSelectedExercises(prev => {
      const next = [...prev];
      const sets = [...next[exerciseIdx].sets];
      sets[setIdx] = { ...sets[setIdx], [field]: value };
      next[exerciseIdx] = { ...next[exerciseIdx], sets };
      return next;
    });
  };

  const addSet = (exerciseIdx: number) => {
    setSelectedExercises(prev => {
      const next = [...prev];
      const sets = [...next[exerciseIdx].sets];
      sets.push({ set_number: sets.length + 1, weight: '', reps: '', logged: false });
      next[exerciseIdx] = { ...next[exerciseIdx], sets };
      return next;
    });
  };

  const removeSet = (exerciseIdx: number, setIdx: number) => {
    setSelectedExercises(prev => {
      const next = [...prev];
      const sets = next[exerciseIdx].sets.filter((_, i) => i !== setIdx);
      const renumbered = sets.map((s, i) => ({ ...s, set_number: i + 1 }));
      next[exerciseIdx] = { ...next[exerciseIdx], sets: renumbered };
      return next;
    });
  };

  const removeExerciseFromSession = (exerciseIdx: number) => {
    setSelectedExercises(prev => prev.filter((_, i) => i !== exerciseIdx));
  };

  const logSet = (exerciseIdx: number, setIdx: number) => {
    const set = selectedExercises[exerciseIdx].sets[setIdx];
    const w = parseFloat(set.weight) || 0;
    const r = parseInt(set.reps) || 0;
    if (w === 0 && r === 0) {
      Alert.alert('Missing Data', 'Please enter weight or reps before logging this set.');
      return;
    }
    setSelectedExercises(prev => {
      const next = [...prev];
      const sets = [...next[exerciseIdx].sets];
      sets[setIdx] = { ...sets[setIdx], logged: true, loggedAt: new Date().toISOString() };
      next[exerciseIdx] = { ...next[exerciseIdx], sets };
      return next;
    });
  };

  const saveAndExit = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!workoutId || !userId) {
      router.back();
      return;
    }

    const setsToSave: any[] = [];
    for (const se of selectedExercises) {
      for (const s of se.sets) {
        const w = parseFloat(s.weight) || 0;
        const r = parseInt(s.reps) || 0;
        if (s.logged && (w > 0 || r > 0)) {
          setsToSave.push({
            workout_id: workoutId,
            exercise_id: se.exercise.id,
            user_id: userId,
            set_number: s.set_number,
            weight: w,
            reps: r,
          });
        }
      }
    }

    if (setsToSave.length === 0) {
      // Nothing was explicitly logged — discard the empty session
      await supabase.from('workouts').delete().eq('id', workoutId);
      router.back();
      return;
    }

    setIsLoading(true);
    try {
      await supabase.from('workout_sets').insert(setsToSave);
      await supabase.from('workouts').update({ end_time: new Date().toISOString() }).eq('id', workoutId);
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save workout.');
    } finally {
      setIsLoading(false);
    }
  };

  const finishWorkout = async () => {
    if (!workoutId || !userId) return;
    if (selectedExercises.length === 0) {
      Alert.alert('Empty Session', 'Please add at least one exercise and log some sets.');
      return;
    }

    setIsLoading(true);
    try {
      const allSets: any[] = [];
      for (const se of selectedExercises) {
        for (const s of se.sets) {
          const w = parseFloat(s.weight) || 0;
          const r = parseInt(s.reps) || 0;
          if (w > 0 || r > 0) {
            allSets.push({
              workout_id: workoutId,
              exercise_id: se.exercise.id,
              user_id: userId,
              set_number: s.set_number,
              weight: w,
              reps: r,
            });
          }
        }
      }

      if (allSets.length === 0) {
        Alert.alert('No Sets Logged', 'Please enter weight or reps for your sets before finishing.');
        setIsLoading(false);
        return;
      }

      const { error } = await supabase.from('workout_sets').insert(allSets);
      if (error) throw error;

      const { error: updateErr } = await supabase
        .from('workouts')
        .update({ end_time: new Date().toISOString() })
        .eq('id', workoutId);
      if (updateErr) throw updateErr;

      if (timerRef.current) clearInterval(timerRef.current);

      // Compute new PRs
      const newPRs: string[] = [];
      for (const se of selectedExercises) {
        for (const s of se.sets) {
          const w = parseFloat(s.weight) || 0;
          if (se.pr && w > se.pr.weight) {
            if (!newPRs.includes(se.exercise.name)) newPRs.push(se.exercise.name);
            break;
          }
          if (!se.pr && w > 0) {
            if (!newPRs.includes(se.exercise.name)) newPRs.push(se.exercise.name);
            break;
          }
        }
      }

      const totalVolume = allSets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
      const uniqueExercises = new Set(allSets.map(s => s.exercise_id));
      const mins = Math.floor(elapsedSeconds / 60);
      const secs = elapsedSeconds % 60;

      const exerciseBreakdown = selectedExercises.map(se => ({
        name: se.exercise.name,
        sets: se.sets
          .filter(s => (parseFloat(s.weight) || 0) > 0 || (parseInt(s.reps) || 0) > 0)
          .map(s => ({
            set_number: s.set_number,
            weight: parseFloat(s.weight) || 0,
            reps: parseInt(s.reps) || 0,
            loggedAt: s.loggedAt,
          })),
      })).filter(e => e.sets.length > 0);

      setSummaryData({
        duration: `${mins}m ${secs}s`,
        totalSets: allSets.length,
        totalVolume,
        exerciseCount: uniqueExercises.size,
        newPRs,
        startTime: new Date(Date.now() - elapsedSeconds * 1000).toISOString(),
        exercises: exerciseBreakdown,
      });
      setIsFinished(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save workout session.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelWorkout = () => {
    Alert.alert(
      "Cancel Workout?",
      "Are you sure? All unsaved progress will be lost.",
      [
        { text: "Resume", style: "cancel" },
        { 
          text: "Discard", 
          style: "destructive", 
          onPress: async () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (workoutId) {
              await supabase.from('workout_sets').delete().eq('workout_id', workoutId);
              await supabase.from('workouts').delete().eq('id', workoutId);
            }
            router.back();
          } 
        }
      ]
    );
  };

  const handleClose = useCallback(() => {
    Alert.alert(
      'Exit Workout?',
      'What would you like to do?',
      [
        { text: 'Keep Training', style: 'cancel' },
        { text: 'Save & Exit', onPress: saveAndExit },
        {
          text: 'Discard', style: 'destructive', onPress: async () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (workoutId) {
              await supabase.from('workout_sets').delete().eq('workout_id', workoutId);
              await supabase.from('workouts').delete().eq('id', workoutId);
            }
            router.back();
          },
        },
      ]
    );
  }, [workoutId, saveAndExit, router]);

  // Intercept Android hardware back button
  // If workout is already saved (summary showing) → go home directly, no dialog.
  // If still in progress → show the exit dialog.
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isFinished) {
        router.back();
      } else {
        handleClose();
      }
      return true;
    });
    return () => backHandler.remove();
  }, [handleClose, isFinished, router]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatLogTime = (iso: string): string => {
    const d = new Date(iso);
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour12}:${m} ${ampm}`;
  };

  if (isFinished && summaryData) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.summaryContainer} showsVerticalScrollIndicator={false}>
          <Text style={styles.summaryEmoji}>🎉</Text>
          <Text style={styles.summaryTitle}>Workout Complete!</Text>
          <Text style={styles.summarySubtitle}>Started at {formatLogTime(summaryData.startTime)}</Text>

          <View style={styles.summaryStatsRow}>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatValue}>{summaryData.duration}</Text>
              <Text style={styles.summaryStatLabel}>Duration</Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatValue}>{summaryData.exerciseCount}</Text>
              <Text style={styles.summaryStatLabel}>Exercises</Text>
            </View>
          </View>

          <View style={styles.summaryStatsRow}>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatValue}>{summaryData.totalSets}</Text>
              <Text style={styles.summaryStatLabel}>Total Sets</Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryStatValue}>{summaryData.totalVolume.toLocaleString()} kg</Text>
              <Text style={styles.summaryStatLabel}>Total Volume</Text>
            </View>
          </View>

          {summaryData.newPRs.length > 0 && (
            <View style={styles.prSection}>
              <Text style={styles.prSectionTitle}>🏆 New Personal Records!</Text>
              {summaryData.newPRs.map((name, i) => (
                <View key={i} style={styles.prItem}>
                  <Text style={styles.prItemText}>{name}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Per-Exercise Breakdown */}
          {summaryData.exercises.length > 0 && (
            <View style={styles.exercisesSection}>
              <Text style={styles.exercisesSectionTitle}>── Exercises Logged ──</Text>
              {summaryData.exercises.map((ex, exIdx) => (
                <View key={exIdx} style={styles.exerciseSummaryCard}>
                  <Text style={styles.exerciseSummaryName}>📌 {ex.name}</Text>
                  {/* Table Header */}
                  <View style={styles.exerciseSummaryHeaderRow}>
                    <Text style={[styles.exerciseSummaryHeaderCell, { flex: 0.5 }]}>SET</Text>
                    <Text style={[styles.exerciseSummaryHeaderCell, { flex: 1 }]}>WEIGHT</Text>
                    <Text style={[styles.exerciseSummaryHeaderCell, { flex: 0.8 }]}>REPS</Text>
                    <Text style={[styles.exerciseSummaryHeaderCell, { flex: 1 }]}>TIME</Text>
                  </View>
                  {/* Set Rows */}
                  {ex.sets.map((s, sIdx) => (
                    <View key={sIdx} style={[
                      styles.setDetailRow,
                      sIdx % 2 === 0 && styles.setDetailRowAlt
                    ]}>
                      <Text style={[styles.setDetailCell, { flex: 0.5 }]}>{s.set_number}</Text>
                      <Text style={[styles.setDetailCell, { flex: 1 }]}>{s.weight} kg</Text>
                      <Text style={[styles.setDetailCell, { flex: 0.8 }]}>{s.reps}</Text>
                      <Text style={[styles.setDetailCellMuted, { flex: 1 }]}>
                        {s.loggedAt ? formatLogTime(s.loggedAt) : '—'}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}

          <Pressable
            style={({ pressed }) => pressed ? [styles.doneBtn, { opacity: 0.85 }] : styles.doneBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.doneBtnText}>Return to House</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Top Bar */}
      <View className="flex-row justify-between items-center px-4 py-3 border-b border-[#1A1A1A]">
        <Pressable onPress={handleCancelWorkout}>
          <Text className="text-red-500 font-medium text-base">Cancel</Text>
        </Pressable>
        <View style={styles.timerContainer}>
          <Text style={styles.timerText}>⏱️ {formatTimer(elapsedSeconds)}</Text>
        </View>
        <Pressable
          onPress={finishWorkout}
          className="bg-[#39FF14] px-4 py-2 rounded-full"
        >
          <Text className="text-black font-bold text-base">Save</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.sessionHeader}>
          <Text style={styles.categoryTitle}>{category} Workout</Text>
          <Text style={styles.categorySub}>Log your weights and reps below</Text>
        </View>

        {selectedExercises.length === 0 && (
          <View style={styles.emptySessionBox}>
            <Text style={styles.emptySessionEmoji}>🏋️‍♂️</Text>
            <Text style={styles.emptySessionText}>
              No exercises added yet.{'\n'}Tap "+ Add Exercise" below to get started!
            </Text>
          </View>
        )}

        {selectedExercises.map((se, exIdx) => (
          <View key={se.exercise.id} style={styles.exerciseCard}>
            {/* Card Header with PR and Delete */}
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.exerciseTitle}>{se.exercise.name}</Text>
                {se.pr ? (
                  <View style={styles.prBadge}>
                    <Text style={styles.prBadgeText}>
                      🏆 PR: {se.pr.weight} kg × {se.pr.reps} reps
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.noPrText}>No historical PR logged yet</Text>
                )}
              </View>
              <Pressable onPress={() => removeExerciseFromSession(exIdx)} style={styles.removeExBtn}>
                <Text style={styles.removeExText}>✕</Text>
              </Pressable>
            </View>

            {/* Set Table Headers */}
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.headerCell, { flex: 0.6 }]}>SET</Text>
              <Text style={[styles.headerCell, { flex: 2 }]}>WEIGHT (KG)</Text>
              <Text style={[styles.headerCell, { flex: 1.2 }]}>REPS</Text>
              <Text style={[styles.headerCell, { width: 54 }]}>LOG</Text>
              <View style={{ width: 28 }} />
            </View>

            {/* Set Rows */}
            {se.sets.map((s, setIdx) => (
              <View key={setIdx} style={[styles.tableRow, s.logged && styles.tableRowLogged]}>
                <View style={[styles.cell, { flex: 0.6 }]}>
                  <Text style={[styles.setNumText, s.logged && styles.setNumLogged]}>{s.set_number}</Text>
                </View>

                <View style={[styles.cell, { flex: 2, flexDirection: 'row', gap: 6 }]}>
                  <TextInput
                    style={[styles.inputField, { flex: 1 }, s.logged && styles.inputFieldLogged]}
                    placeholder="0"
                    placeholderTextColor="#555555"
                    keyboardType="numeric"
                    value={s.weight}
                    onChangeText={(val) => { if (!s.logged) updateSet(exIdx, setIdx, 'weight', val); }}
                    editable={!s.logged}
                  />
                  <Pressable
                    style={[styles.pickerBtn, s.logged && { opacity: 0.35 }]}
                    onPress={() => {
                      if (!s.logged) {
                        setPickerTarget({ exIdx, setIdx });
                        setShowWeightPickerModal(true);
                      }
                    }}
                    disabled={s.logged}
                  >
                    <Text style={styles.pickerBtnText}>▼</Text>
                  </Pressable>
                </View>

                <View style={[styles.cell, { flex: 1.2 }]}>
                  <TextInput
                    style={[styles.inputField, { width: '100%' }, s.logged && styles.inputFieldLogged]}
                    placeholder="0"
                    placeholderTextColor="#555555"
                    keyboardType="numeric"
                    value={s.reps}
                    onChangeText={(val) => { if (!s.logged) updateSet(exIdx, setIdx, 'reps', val); }}
                    editable={!s.logged}
                  />
                </View>

                <View style={{ width: 54, alignItems: 'center', justifyContent: 'center' }}>
                  {s.logged ? (
                    <View style={styles.loggedBadge}>
                      <Text style={styles.loggedBadgeText}>✓</Text>
                    </View>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [styles.logSetBtn, pressed && { opacity: 0.7 }]}
                      onPress={() => logSet(exIdx, setIdx)}
                    >
                      <Text style={styles.logSetText}>Log</Text>
                    </Pressable>
                  )}
                </View>

                <View style={{ width: 28, alignItems: 'center' }}>
                  {se.sets.length > 1 && (
                    <Pressable style={styles.deleteSetBtn} onPress={() => removeSet(exIdx, setIdx)}>
                      <Text style={styles.deleteSetText}>−</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}

            {/* Add Set row */}
            <View style={styles.cardActionsRow}>
              <Pressable
                style={({ pressed }) =>
                  pressed ? [styles.addSetBtn, { opacity: 0.7 }] : styles.addSetBtn
                }
                onPress={() => addSet(exIdx)}
              >
                <Text style={styles.addSetText}>＋ Add Set</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {/* Add Exercise button inside ScrollView */}
        <Pressable
          style={({ pressed }) =>
            pressed ? [styles.addExerciseBtn, { opacity: 0.85 }] : styles.addExerciseBtn
          }
          onPress={() => setShowExerciseModal(true)}
        >
          <Text style={styles.addExerciseText}>＋ Add an Exercise</Text>
        </Pressable>
      </ScrollView>

      {/* Modal: Exercise Picker (Filtered by Category) */}
      <Modal
        visible={showExerciseModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowExerciseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select {category} Exercise</Text>
              <Pressable onPress={() => setShowExerciseModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <TextInput
              className="bg-[#1A1A1A] border border-[#1E1E1E] text-white px-4 py-3 rounded-xl mb-4 placeholder-[#888888]"
              placeholder="Search exercises..."
              placeholderTextColor="#888888"
              value={exerciseSearchQuery}
              onChangeText={setExerciseSearchQuery}
            />

            <FlatList
              data={availableExercises.filter(ex => ex.name.toLowerCase().includes(exerciseSearchQuery.toLowerCase()))}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item }) => {
                const isAlreadyIn = selectedExercises.some(se => se.exercise.id === item.id);
                return (
                  <Pressable
                    className={`bg-[#1A1A1A] p-4 rounded-xl mb-3 flex-row justify-between items-center ${isAlreadyIn ? 'opacity-40' : ''}`}
                    style={({ pressed }) => pressed && !isAlreadyIn ? { opacity: 0.8 } : {}}
                    onPress={() => handleSelectExerciseToAdd(item)}
                    disabled={isAlreadyIn}
                  >
                    <Text className={`text-base font-medium ${isAlreadyIn ? 'text-[#666666]' : 'text-white'}`}>
                      {item.name}
                    </Text>
                    {isAlreadyIn ? (
                      <Text style={styles.addedBadgeText}>Added</Text>
                    ) : (
                      <View className="bg-[#39FF14]/10 w-8 h-8 rounded-lg items-center justify-center">
                        <Text className="text-[#39FF14] font-bold text-lg leading-tight">+</Text>
                      </View>
                    )}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyListText}>No exercises in library. Go to Manage Exercises on House tab to create some!</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Modal: Dual-Input Weight Dropdown Picker */}
      <Modal
        visible={showWeightPickerModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowWeightPickerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '60%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Standard Weight (kg)</Text>
              <Pressable onPress={() => setShowWeightPickerModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <FlatList
              data={STANDARD_WEIGHTS}
              keyExtractor={item => item}
              numColumns={3}
              columnWrapperStyle={{ gap: 10 }}
              contentContainerStyle={{ paddingBottom: 20, gap: 10 }}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.weightGridItem,
                    pressed && { backgroundColor: '#39FF14', borderColor: '#39FF14' }
                  ]}
                  onPress={() => {
                    if (pickerTarget) {
                      updateSet(pickerTarget.exIdx, pickerTarget.setIdx, 'weight', item);
                    }
                    setShowWeightPickerModal(false);
                  }}
                >
                  <Text style={styles.weightGridText}>{item} kg</Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#39FF14" />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    paddingTop: 50,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
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
    color: '#AAAAAA',
    fontWeight: 'bold',
  },
  timerContainer: {
    backgroundColor: '#141414',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222222',
  },
  timerText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#39FF14',
    fontVariant: ['tabular-nums'],
  },
  finishBtn: {
    backgroundColor: '#39FF14',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#39FF14',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 5,
  },
  finishBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0A0A0A',
    letterSpacing: 0.3,
  },
  stickyFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    paddingBottom: 20,
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: '#1C1C1C',
  },
  footerAddBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141414',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 60,
  },
  sessionHeader: {
    marginTop: 20,
    marginBottom: 20,
  },
  categoryTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  categorySub: {
    fontSize: 14,
    color: '#888888',
    marginTop: 4,
  },
  emptySessionBox: {
    backgroundColor: '#141414',
    borderRadius: 18,
    padding: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222222',
    marginBottom: 20,
  },
  emptySessionEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptySessionText: {
    fontSize: 15,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 22,
  },
  exerciseCard: {
    backgroundColor: '#141414',
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#222222',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  exerciseTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  prBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1A2E1A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#39FF1440',
  },
  prBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#39FF14',
  },
  noPrText: {
    fontSize: 12,
    color: '#666666',
    fontStyle: 'italic',
  },
  removeExBtn: {
    padding: 4,
  },
  removeExText: {
    fontSize: 16,
    color: '#666666',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  headerCell: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#888888',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  cell: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  setNumText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#39FF14',
  },
  inputField: {
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  pickerBtn: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerBtnText: {
    color: '#39FF14',
    fontSize: 12,
    fontWeight: 'bold',
  },
  deleteSetBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteSetText: {
    color: '#FF4444',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: -2,
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  addSetBtn: {
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderStyle: 'dashed',
  },
  addSetText: {
    color: '#39FF14',
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderStyle: 'dashed',
  },
  saveBtnText: {
    color: '#39FF14',
    fontSize: 14,
    fontWeight: '600',
  },
  addExerciseBtn: {
    backgroundColor: '#141414',
    borderWidth: 1.5,
    borderColor: '#39FF14',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 30,
    shadowColor: '#39FF14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  addExerciseText: {
    color: '#39FF14',
    fontSize: 17,
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
    maxHeight: '75%',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: 18,
    color: '#AAAAAA',
  },
  exerciseSelectItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#222222',
  },
  exerciseSelectText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  addArrowText: {
    fontSize: 18,
    color: '#39FF14',
    fontWeight: 'bold',
  },
  addedBadgeText: {
    fontSize: 12,
    color: '#666666',
    fontWeight: 'bold',
  },
  emptyListText: {
    color: '#666666',
    textAlign: 'center',
    lineHeight: 22,
    padding: 20,
  },
  weightGridItem: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  weightGridText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  summaryContainer: {
    paddingHorizontal: 24,
    paddingTop: 80,
    alignItems: 'center',
  },
  summaryEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 32,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
    width: '100%',
  },
  summaryStat: {
    flex: 1,
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222222',
  },
  summaryStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#39FF14',
  },
  summaryStatLabel: {
    fontSize: 13,
    color: '#888888',
    marginTop: 6,
  },
  prSection: {
    width: '100%',
    backgroundColor: '#142214',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#39FF1440',
  },
  prSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#39FF14',
    marginBottom: 12,
  },
  prItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3A1A',
  },
  prItemText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  doneBtn: {
    backgroundColor: '#39FF14',
    borderRadius: 16,
    paddingVertical: 18,
    width: '100%',
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 40,
  },
  doneBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0A0A0A',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10,10,10,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Logged Set Row Styles ─────────────────────────────────────────
  tableRowLogged: {
    backgroundColor: 'rgba(57,255,20,0.05)',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#39FF14',
    paddingLeft: 4,
  },
  setNumLogged: {
    color: '#39FF14',
  },
  inputFieldLogged: {
    backgroundColor: '#0D1A0D',
    borderColor: '#39FF1440',
    color: '#39FF14',
  },
  logSetBtn: {
    backgroundColor: '#1A2E1A',
    borderWidth: 1.5,
    borderColor: '#39FF14',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    width: 46,
  },
  logSetText: {
    color: '#39FF14',
    fontSize: 12,
    fontWeight: 'bold',
  },
  loggedBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1A2E1A',
    borderWidth: 1.5,
    borderColor: '#39FF14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loggedBadgeText: {
    color: '#39FF14',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // ── Summary Screen Styles ─────────────────────────────────────────
  summarySubtitle: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 28,
    marginTop: -4,
  },
  exercisesSection: {
    width: '100%',
    marginTop: 24,
    marginBottom: 8,
  },
  exercisesSectionTitle: {
    fontSize: 14,
    color: '#555555',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 1,
  },
  exerciseSummaryCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222222',
  },
  exerciseSummaryName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  exerciseSummaryHeaderRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  exerciseSummaryHeaderCell: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#555555',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  setDetailRow: {
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  setDetailRowAlt: {
    backgroundColor: '#0F0F0F',
  },
  setDetailCell: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  setDetailCellMuted: {
    fontSize: 12,
    color: '#39FF14',
    textAlign: 'center',
    fontWeight: '500',
  },
});
