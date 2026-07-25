import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, FlatList, Alert, ActivityIndicator, Dimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { LineChart } from 'react-native-gifted-charts';

// --- MOCK DATA TOGGLE ---
const USE_MOCK_DATA = false; // Set to false to use your real Supabase data

type WeightLog = {
  id: string;
  weight: number;
  logged_at: string;
};

// Helper to generate 6 months of realistic mock data
function generateMockData(): WeightLog[] {
  const mock: WeightLog[] = [];
  const now = new Date();
  let currentWeight = 115;
  // Generate last 180 days (6 months)
  for (let i = 0; i <= 180; i++) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    // Random fluctuation between -0.3 and 0.3
    currentWeight = currentWeight + (Math.random() * 0.6 - 0.3);
    if (currentWeight > 115) currentWeight = 115;
    if (currentWeight < 110) currentWeight = 110;
    
    mock.push({
      id: `mock-${i}`,
      weight: parseFloat(currentWeight.toFixed(1)),
      logged_at: d.toISOString()
    });
  }
  return mock;
}

const MOCK_DATA = generateMockData();

type TimeHorizon = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
const HORIZONS: TimeHorizon[] = ['Daily', 'Weekly', 'Monthly', 'Yearly'];

export default function WeightScreen() {
  const [weightInput, setWeightInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [realLogs, setRealLogs] = useState<WeightLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [horizon, setHorizon] = useState<TimeHorizon>('Daily');

  useFocusEffect(
    useCallback(() => {
      fetchLogs();
    }, [])
  );

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setRealLogs([]);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchLogs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: false });

      if (error) {
        throw error;
      }
      
      setRealLogs(data || []);
    } catch (error: any) {
      console.error('Error fetching logs:', error.message);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleLogWeight = async () => {
    if (!weightInput.trim()) {
      Alert.alert('Invalid Input', 'Please enter a valid weight.');
      return;
    }

    const weightValue = parseFloat(weightInput);
    if (isNaN(weightValue) || weightValue <= 0) {
      Alert.alert('Invalid Input', 'Weight must be a positive number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        Alert.alert('Authentication Error', 'You must be logged in to log weight.');
        return;
      }

      const { error } = await supabase
        .from('weight_logs')
        .insert({
          user_id: user.id,
          weight: weightValue,
        });

      if (error) {
        throw error;
      }

      setWeightInput('');
      fetchLogs(); // Refresh the list
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to log weight');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (USE_MOCK_DATA) {
        Alert.alert("Notice", "Cannot delete mock data.");
        return;
    }

    Alert.alert(
      "Delete Log",
      "Are you sure you want to delete this weight log?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('weight_logs')
                .delete()
                .eq('id', id);

              if (error) throw error;
              fetchLogs(); // Refresh
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete log.');
            }
          }
        }
      ]
    );
  };

  // Determine active dataset
  const activeLogs = USE_MOCK_DATA ? MOCK_DATA : realLogs;

  // Only keep the most recent log per calendar day (logs are sorted DESC by logged_at)
  const processedLogs = useMemo(() => {
    const uniqueDays = new Set();
    const result: WeightLog[] = [];
    
    for (const log of activeLogs) {
      const dateStr = new Date(log.logged_at).toISOString().split('T')[0];
      if (!uniqueDays.has(dateStr)) {
        uniqueDays.add(dateStr);
        result.push(log);
      }
    }
    return result;
  }, [activeLogs]);

  // Process data for the chart with proper spatial timeline padding
  const chartData = useMemo(() => {
    // Sort chronologically (oldest first)
    const sortedLogs = [...processedLogs].sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
    
    if (sortedLogs.length === 0) return [];

    const now = new Date();
    const intervals: { date: Date, label: string }[] = [];

    // Generate strict timeline intervals depending on the selected horizon
    if (horizon === 'Daily') {
      for (let i = 6; i >= 0; i--) { // Last 7 days
        const d = new Date();
        d.setDate(now.getDate() - i);
        intervals.push({ date: d, label: d.toLocaleDateString([], { weekday: 'short' }) });
      }
    } else if (horizon === 'Weekly') {
      for (let i = 5; i >= 0; i--) { // Last 6 weeks
        const d = new Date();
        d.setDate(now.getDate() - (i * 7));
        intervals.push({ date: d, label: d.toLocaleDateString([], { month: 'short', day: 'numeric' }) });
      }
    } else if (horizon === 'Monthly') {
      for (let i = 5; i >= 0; i--) { // Last 6 months
        const d = new Date();
        d.setMonth(now.getMonth() - i);
        intervals.push({ date: d, label: d.toLocaleDateString([], { month: 'short' }) });
      }
    } else if (horizon === 'Yearly') {
      for (let i = 11; i >= 0; i--) { // Last 12 months
        const d = new Date();
        d.setMonth(now.getMonth() - i);
        intervals.push({ date: d, label: d.toLocaleDateString([], { month: 'short' }) });
      }
    }

    // Map each interval to a specific weight value (carry-forward last known weight)
    const finalData = intervals.map(interval => {
      const intervalTime = interval.date.getTime();
      let closestLog = null;
      
      for (let i = sortedLogs.length - 1; i >= 0; i--) {
        const logTime = new Date(sortedLogs[i].logged_at).getTime();
        
        if (horizon === 'Monthly' || horizon === 'Yearly') {
            // Find the log that happened during or before this month
            if (logTime <= intervalTime || (new Date(logTime).getMonth() === interval.date.getMonth() && new Date(logTime).getFullYear() === interval.date.getFullYear())) {
                closestLog = sortedLogs[i];
                break;
            }
        } else {
            // For daily/weekly, end of the interval day
            const endOfDay = new Date(intervalTime);
            endOfDay.setHours(23, 59, 59, 999);
            if (logTime <= endOfDay.getTime()) {
                closestLog = sortedLogs[i];
                break;
            }
        }
      }

      // If no past log exists before this interval, use the oldest available log so it doesn't break the chart
      if (!closestLog) {
        closestLog = sortedLogs[0];
      }

      return {
        value: closestLog.weight,
        label: interval.label,
      };
    });

    return finalData;
  }, [processedLogs, horizon]);

  // Calculate dynamic Y-Axis constraints to "zoom in" on the data correctly
  const yAxisConfig = useMemo(() => {
    if (chartData.length === 0) return { min: 0, range: 100, step: 20 };
    const values = chartData.map(d => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    
    // Create a 5kg padding above and below the min/max values
    const minPadding = Math.max(0, Math.floor(minVal) - 5);
    const maxPadding = Math.ceil(maxVal) + 5;
    
    // Maximum Range: Total height of the chart (max - offset)
    const range = maxPadding - minPadding;
    
    // Ensure we have at least some steps on the Y axis
    const step = Math.max(1, Math.ceil(range / 5));

    return { min: minPadding, range, step };
  }, [chartData]);

  const renderItem = ({ item }: { item: WeightLog }) => {
    const date = new Date(item.logged_at);
    return (
      <View style={styles.logCard}>
        <View>
          <Text style={styles.logDate}>{date.toLocaleDateString()} {date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
          <Text style={styles.logWeight}>{item.weight} kg</Text>
        </View>
        <Pressable onPress={() => handleDeleteLog(item.id)} style={({ pressed }) => [
          styles.deleteButton,
          pressed && { opacity: 0.7 }
        ]}>
          <Text style={styles.deleteText}>✕</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      data={processedLogs}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <>
          <Text style={styles.headerTitle}>Track Weight</Text>

          {USE_MOCK_DATA && (
            <View style={styles.mockBanner}>
              <Text style={styles.mockBannerText}>USING MOCK DATA</Text>
            </View>
          )}
          
          {/* Chart Section */}
          <View style={styles.chartCard}>
            <View style={styles.horizonSwitcher}>
              {HORIZONS.map((h) => (
                <Pressable
                  key={h}
                  style={[styles.horizonPill, horizon === h && styles.horizonPillActive]}
                  onPress={() => setHorizon(h)}
                >
                  <Text style={[styles.horizonText, horizon === h && styles.horizonTextActive]}>
                    {h}
                  </Text>
                </Pressable>
              ))}
            </View>

            {chartData.length > 0 ? (
              <View style={styles.chartWrapper}>
                <LineChart
                  data={chartData}
                  color="#39FF14"
                  thickness={3}
                  dataPointsColor="#FFFFFF"
                  textColor="#A0A0A0"
                  xAxisColor="#333333"
                  yAxisColor="#333333"
                  yAxisTextStyle={{ color: '#A0A0A0', fontSize: 12 }}
                  xAxisLabelTextStyle={{ color: '#A0A0A0', fontSize: 10 }}
                  rulesColor="#1A1A1A"
                  hideRules
                  width={Dimensions.get('window').width - 100}
                  height={180}
                  isAnimated
                  yAxisOffset={yAxisConfig.min}
                  maxValue={yAxisConfig.range}
                  stepValue={yAxisConfig.step}
                  noOfSections={5}
                  yAxisLabelSuffix="kg"
                  yAxisLabelWidth={40}
                />
              </View>
            ) : (
              <View style={styles.chartEmpty}>
                <Text style={styles.emptyText}>Not enough data for {horizon} view.</Text>
              </View>
            )}
          </View>

          {/* Input Section */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Enter weight (e.g., 75.5)"
              placeholderTextColor="#A0A0A0"
              keyboardType="numeric"
              value={weightInput}
              onChangeText={setWeightInput}
            />
            
            <Pressable 
              style={({ pressed }) => (pressed || isSubmitting) ? [styles.button, styles.buttonPressed] : styles.button}
              onPress={handleLogWeight}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.buttonText}>Log Weight</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.historyTitle}>Recent Logs</Text>
        </>
      }
      renderItem={renderItem}
      ListEmptyComponent={
        !isLoadingLogs ? (
          <Text style={styles.emptyText}>No weight logs yet. Start tracking today!</Text>
        ) : (
          <ActivityIndicator color="#39FF14" style={{ marginTop: 20 }} />
        )
      }
    />
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
    paddingBottom: 40,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 24,
  },
  mockBanner: {
    backgroundColor: '#FF3B30',
    padding: 8,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  mockBannerText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  chartCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  horizonSwitcher: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0A0A0A',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  horizonPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  horizonPillActive: {
    backgroundColor: '#1A1A1A',
  },
  horizonText: {
    color: '#A0A0A0',
    fontSize: 14,
    fontWeight: '500',
  },
  horizonTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingRight: 10, // Gives extra padding for the chart labels
  },
  chartEmpty: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputContainer: {
    backgroundColor: '#1A1A1A',
    padding: 24,
    borderRadius: 16,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  input: {
    backgroundColor: '#0A0A0A',
    color: '#FFFFFF',
    fontSize: 18,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333333',
  },
  button: {
    backgroundColor: '#39FF14',
    paddingVertical: 16,
    borderRadius: 100, // Pill shape
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    color: '#000000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  historyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  logCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
  },
  logDate: {
    color: '#A0A0A0',
    fontSize: 16,
    marginBottom: 4,
  },
  logWeight: {
    color: '#39FF14',
    fontSize: 18,
    fontWeight: 'bold',
  },
  deleteButton: {
    padding: 10,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderRadius: 8,
  },
  deleteText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#A0A0A0',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
  },
});
