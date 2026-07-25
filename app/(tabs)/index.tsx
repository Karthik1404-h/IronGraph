import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function DashboardScreen() {
  return (
    <View style={styles.container}>
      {/* Header Section */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Workouts</Text>
      </View>

      {/* Main Content Area */}
      <View style={styles.content}>
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateText}>
            No workouts yet. Be the first to log a session...
          </Text>

          <Pressable
            style={({ pressed }) => pressed ? [styles.button, styles.buttonPressed] : styles.button}
          >
            <Text style={styles.buttonText}>Start Workout</Text>
          </Pressable>
        </View>
      </View>
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
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateContainer: {
    backgroundColor: '#1A1A1A',
    padding: 24,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#A0A0A0',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  button: {
    color: '#2c1f65ff',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 100, // Pill shape
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    color: '#f9f9fbff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
