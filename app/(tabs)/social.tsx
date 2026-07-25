import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { supabase } from '../../lib/supabase';

// Rounds val up to the nearest "nice" scale value (1, 2, 5, 10, 20, 50 …)
function niceNum(val: number): number {
  if (val <= 0) return 1;
  const exp = Math.floor(Math.log10(val));
  const f = val / Math.pow(10, exp);
  if (f <= 1) return Math.pow(10, exp);
  if (f <= 2) return 2 * Math.pow(10, exp);
  if (f <= 5) return 5 * Math.pow(10, exp);
  return 10 * Math.pow(10, exp);
}

type Profile = {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
};

type GlobalUser = Profile & {
  friendshipStatus: 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends';
};

type Friendship = {
  id: string;
  user_id: string;
  friend_id: string;
  status: string;
  profiles: Profile;
};

type LeaderboardEntry = {
  id: string;
  name: string;
  email: string;
  delta: number | null;
  currentWeight: number | null;
  avatar_url?: string;
};

type TimeHorizon = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
const HORIZONS: TimeHorizon[] = ['Daily', 'Weekly', 'Monthly', 'Yearly'];

export default function SocialScreen() {
  const [pendingRequests, setPendingRequests] = useState<Friendship[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [globalUsers, setGlobalUsers] = useState<GlobalUser[]>([]);
  const [allLogs, setAllLogs] = useState<Record<string, any[]>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<TimeHorizon>('Daily');
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      fetchData(() => isMounted);
      return () => {
        isMounted = false;
      };
    }, [])
  );

  useEffect(() => {
    let isMounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (!session) {
        setPendingRequests([]);
        setLeaderboard([]);
        setGlobalUsers([]);
        setAllLogs({});
        setCurrentUserId(null);
      }
    });
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const fetchData = async (isMounted = () => true) => {
    if (!isMounted()) return;
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isMounted()) return;
      setCurrentUserId(user.id);

      // Fetch all friendships for the current user
      const { data: allFriendships, error: fErr } = await supabase
        .from('friendships')
        .select('*')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

      if (fErr) throw fErr;
      if (!isMounted()) return;

      // Fetch all profiles globally
      const { data: allProfiles, error: pErr } = await supabase
        .from('profiles')
        .select('*');

      if (pErr) throw pErr;
      if (!isMounted()) return;

      const profilesMap = new Map<string, Profile>((allProfiles || []).filter(Boolean).map((p: Profile) => [p.id, p]));
      const myProfile = profilesMap.get(user.id);

      const pending: Friendship[] = [];
      const acceptedIds = new Set<string>();
      const outgoingPendingIds = new Set<string>();
      const incomingRequestMap = new Map<string, string>(); // sender_id -> friendship_id

      (allFriendships || []).forEach(f => {
        if (!f) return;
        if (f.status === 'accepted') {
          const friendId = f.user_id === user.id ? f.friend_id : f.user_id;
          if (friendId) acceptedIds.add(friendId);
        } else if (f.status === 'pending') {
          if (f.friend_id === user.id) {
            const senderProfile = profilesMap.get(f.user_id);
            if (senderProfile) {
              pending.push({ ...f, profiles: senderProfile });
              incomingRequestMap.set(f.user_id, f.id);
            }
          } else if (f.friend_id) {
            outgoingPendingIds.add(f.friend_id);
          }
        }
      });

      if (!isMounted()) return;
      setPendingRequests(pending);

      // --- Process Global Users ---
      const globalList = (allProfiles || [])
        .filter((p: any) => p && p.id && p.id !== user.id)
        .map((p: Profile) => {
          let status: GlobalUser['friendshipStatus'] = 'none';
          if (acceptedIds.has(p.id)) status = 'friends';
          else if (outgoingPendingIds.has(p.id)) status = 'pending_outgoing';
          else if (incomingRequestMap.has(p.id)) status = 'pending_incoming';
          return { ...p, friendshipStatus: status };
        });
      if (!isMounted()) return;
      setGlobalUsers(globalList);

      // --- Process Leaderboard ---
      const friendProfiles: Profile[] = [];
      if (myProfile) friendProfiles.push(myProfile);
      acceptedIds.forEach(id => {
        const p = profilesMap.get(id);
        if (p) friendProfiles.push(p);
      });

      const leaderboardData: LeaderboardEntry[] = [];
      const logsMap: Record<string, any[]> = {};

      for (const p of friendProfiles) {
        const { data: logs } = await supabase
          .from('weight_logs')
          .select('*')
          .eq('user_id', p.id)
          .order('logged_at', { ascending: false });

        logsMap[p.id] = logs || [];

        let currentWeight = null;
        let delta = null;

        if (logs && logs.length > 0) {
          const uniqueDays = new Set();
          const processed: any[] = [];
          for (const log of logs) {
            const dateStr = new Date(log.logged_at).toISOString().split('T')[0];
            if (!uniqueDays.has(dateStr)) {
              uniqueDays.add(dateStr);
              processed.push(log);
            }
          }

          currentWeight = processed[0].weight;

          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          let pastLog = null;
          for (const log of processed) {
            const logDate = new Date(log.logged_at);
            if (logDate <= sevenDaysAgo) {
              pastLog = log;
              break;
            }
          }

          if (!pastLog && processed.length > 1) {
            pastLog = processed[processed.length - 1];
          }

          if (pastLog) {
            delta = currentWeight - pastLog.weight;
          }
        }

        leaderboardData.push({
          id: p.id,
          name: p.display_name || p.email,
          email: p.email,
          currentWeight,
          delta,
          avatar_url: p.avatar_url
        });
      }

      leaderboardData.sort((a, b) => {
        if (a.delta === null) return 1;
        if (b.delta === null) return -1;
        return a.delta - b.delta;
      });

      if (!isMounted()) return;
      setLeaderboard(leaderboardData);
      setAllLogs(logsMap);

    } catch (err: any) {
      if (isMounted()) {
        console.error(err.message);
      }
    } finally {
      if (isMounted()) {
        setIsLoading(false);
      }
    }
  };

  const sendFriendRequest = async (friendId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error: insertError } = await supabase
        .from('friendships')
        .insert({
          user_id: user.id,
          friend_id: friendId,
          status: 'pending'
        });

      if (insertError) {
        if (insertError.code === '23505') {
          Alert.alert("Info", "A request already exists between you two.");
        } else {
          throw insertError;
        }
      }
      fetchData(); // Refresh UI instantly
    } catch (err: any) {
      Alert.alert("Error", err.message || "Could not send request.");
    }
  };

  const handleRequest = async (friendshipId: string, action: 'accepted' | 'declined') => {
    try {
      if (action === 'accepted') {
        const { error } = await supabase
          .from('friendships')
          .update({ status: 'accepted' })
          .eq('id', friendshipId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('friendships')
          .delete()
          .eq('id', friendshipId);
        if (error) throw error;
      }
      fetchData();
    } catch (err: any) {
      Alert.alert("Error", err.message);
    }
  };

  const renderLeaderboardItem = ({ item, index }: { item: LeaderboardEntry, index: number }) => {
    if (!item || !item.id) return null;
    const isTop3 = index < 3;
    const isPositive = item.delta !== null && item.delta > 0;
    const isNegative = item.delta !== null && item.delta < 0;

    let deltaColor = '#A0A0A0';
    if (isNegative) deltaColor = '#39FF14';
    if (isPositive) deltaColor = '#FF3B30';

    return (
      <View style={styles.leaderboardCard}>
        <View style={styles.leaderboardLeft}>
          <Text style={[styles.rank, isTop3 && styles.rankTop]}>#{index + 1}</Text>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatarSmall} />
          ) : (
            <View style={styles.avatarPlaceholderSmall}>
              <Text style={styles.avatarPlaceholderTextSmall}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View>
            <Text style={styles.playerName}>{item.name || 'Unknown'}</Text>
            <Text style={styles.playerWeight}>{item.currentWeight ? `${item.currentWeight.toFixed(1)} kg` : 'No logs yet'}</Text>
          </View>
        </View>
        <View style={styles.leaderboardRight}>
          <Text style={[styles.deltaText, { color: deltaColor }]}>
            {item.delta !== null ? (item.delta > 0 ? `+${item.delta.toFixed(1)}` : item.delta.toFixed(1)) : '--'} kg
          </Text>
          <Text style={styles.deltaLabel}>7d change</Text>
        </View>
      </View>
    );
  };

  const renderGlobalUser = ({ item }: { item: GlobalUser }) => {
    if (!item || !item.id) return null;
    const displayName = item.display_name || item.email || 'Unknown User';
    return (
      <View key={item.id} style={styles.globalUserCard}>
        <View style={styles.globalUserLeft}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatarSmall} />
          ) : (
            <View style={styles.avatarPlaceholderSmall}>
              <Text style={styles.avatarPlaceholderTextSmall}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.globalUserName}>{displayName}</Text>
        </View>

        {item.friendshipStatus === 'friends' && (
          <View style={styles.statusBadgeFriends}>
            <Text style={styles.statusTextFriends}>Friends</Text>
          </View>
        )}

        {item.friendshipStatus === 'pending_outgoing' && (
          <View style={styles.statusBadgePending}>
            <Text style={styles.statusTextPending}>Pending</Text>
          </View>
        )}

        {item.friendshipStatus === 'pending_incoming' && (
          <View style={styles.statusBadgeIncoming}>
            <Text style={styles.statusTextIncoming}>Review</Text>
          </View>
        )}

        {item.friendshipStatus === 'none' && (
          <Pressable
            onPress={() => sendFriendRequest(item.id)}
          >
            {({ pressed }) => (
              <View style={[styles.addBtn, pressed && { opacity: 0.7 }]}>
                <Text style={styles.addBtnText}>Add</Text>
              </View>
            )}
          </Pressable>
        )}
      </View>
    );
  };

  // --- CHART LOGIC ---
  const topFriend = useMemo(() => {
    if (!currentUserId || leaderboard.length < 2) return null;
    return leaderboard.find(entry => entry.id !== currentUserId) || null;
  }, [leaderboard, currentUserId]);

  const processLogsForChart = (userId: string) => {
    const rawLogs = allLogs[userId] || [];
    const uniqueDays = new Set();
    const processed: any[] = [];
    for (const log of rawLogs) {
      const dateStr = new Date(log.logged_at).toISOString().split('T')[0];
      if (!uniqueDays.has(dateStr)) {
        uniqueDays.add(dateStr);
        processed.push(log);
      }
    }

    const sortedLogs = [...processed].sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
    if (sortedLogs.length === 0) return [];

    const now = new Date();
    const intervals: { date: Date, label: string }[] = [];

    if (horizon === 'Daily') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        intervals.push({ date: d, label: d.toLocaleDateString([], { weekday: 'short' }) });
      }
    } else if (horizon === 'Weekly') {
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - (i * 7));
        intervals.push({ date: d, label: d.toLocaleDateString([], { month: 'short', day: 'numeric' }) });
      }
    } else if (horizon === 'Monthly') {
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(now.getMonth() - i);
        intervals.push({ date: d, label: d.toLocaleDateString([], { month: 'short' }) });
      }
    } else if (horizon === 'Yearly') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(now.getMonth() - i);
        intervals.push({ date: d, label: d.toLocaleDateString([], { month: 'short' }) });
      }
    }

    return intervals.map(interval => {
      const intervalTime = interval.date.getTime();
      let closestLog = null;

      for (let i = sortedLogs.length - 1; i >= 0; i--) {
        const logTime = new Date(sortedLogs[i].logged_at).getTime();
        if (horizon === 'Monthly' || horizon === 'Yearly') {
          if (logTime <= intervalTime || (new Date(logTime).getMonth() === interval.date.getMonth() && new Date(logTime).getFullYear() === interval.date.getFullYear())) {
            closestLog = sortedLogs[i];
            break;
          }
        } else {
          const endOfDay = new Date(intervalTime);
          endOfDay.setHours(23, 59, 59, 999);
          if (logTime <= endOfDay.getTime()) {
            closestLog = sortedLogs[i];
            break;
          }
        }
      }

      if (!closestLog) closestLog = sortedLogs[0];

      return {
        value: closestLog.weight,
        label: interval.label,
      };
    });
  };

  const chartDataMy = useMemo(() => {
    if (!currentUserId) return [];
    return processLogsForChart(currentUserId);
  }, [allLogs, currentUserId, horizon]);

  const chartDataFriend = useMemo(() => {
    if (!topFriend) return [];
    return processLogsForChart(topFriend.id);
  }, [allLogs, topFriend, horizon]);

  // Y-Axis: combines both datasets, snaps to nice step boundaries with 1 step of breathing room
  const yAxisConfig = useMemo(() => {
    const fallback = { min: 60, max: 100, range: 40, step: 10, noOfSections: 4 };
    if (chartDataMy.length === 0 && chartDataFriend.length === 0) return fallback;

    const allVals = [
      ...chartDataMy.map(d => d.value),
      ...chartDataFriend.map(d => d.value),
    ].filter(v => isFinite(v));

    if (allVals.length === 0) return fallback;

    const rawMin = Math.min(...allVals);
    const rawMax = Math.max(...allVals);
    const span = Math.max(rawMax - rawMin, 4);
    const step = niceNum(span / 5);
    const min = Math.max(0, Math.floor(rawMin / step) * step - step);
    const max = Math.ceil(rawMax / step) * step + step;
    const range = max - min;
    const noOfSections = Math.round(range / step);

    return { min, max, range, step, noOfSections };
  }, [chartDataMy, chartDataFriend]);

  const yAxisLabelTexts = useMemo(() => {
    const labels: string[] = [];
    for (let i = 0; i <= yAxisConfig.noOfSections; i++) {
      const val = yAxisConfig.min + i * yAxisConfig.step;
      labels.push(Number.isInteger(val) ? `${val}kg` : `${val.toFixed(1)}kg`);
    }
    return labels;
  }, [yAxisConfig]);

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        data={leaderboard}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <Text style={styles.headerTitle}>Leaderboard</Text>

            {/* Pending Requests Section */}
            {pendingRequests.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Friend Requests</Text>
                {pendingRequests.filter(req => req && req.id && req.profiles).map(req => (
                  <View key={req.id} style={styles.requestRow}>
                    <Text style={styles.requestName}>{req.profiles.display_name || req.profiles.email || 'User'}</Text>
                    <View style={styles.requestActions}>
                      <Pressable style={[styles.actionBtn, styles.acceptBtn]} onPress={() => handleRequest(req.id, 'accepted')}>
                        <Text style={styles.acceptText}>Accept</Text>
                      </Pressable>
                      <Pressable style={[styles.actionBtn, styles.declineBtn]} onPress={() => handleRequest(req.id, 'declined')}>
                        <Text style={styles.declineText}>Decline</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.sectionTitle}>Weekly Delta Rankings</Text>
          </>
        }
        renderItem={renderLeaderboardItem}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color="#39FF14" style={{ marginTop: 20 }} />
          ) : (
            <Text style={styles.emptyText}>Add some friends to start competing!</Text>
          )
        }
        ListFooterComponent={
          <>
            {/* Comparison Chart */}
            <View style={[styles.card, { marginTop: 24, padding: 16 }]}>
              <Text style={styles.sectionTitle}>Head-to-Head Progress</Text>

              {!topFriend ? (
                <Text style={[styles.emptyText, { marginBottom: 20 }]}>Add friends to unlock the comparison chart.</Text>
              ) : (
                <>
                  <View style={styles.chartLegendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#39FF14' }]} />
                      <Text style={styles.legendText}>You</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#00FFFF' }]} />
                      <Text style={styles.legendText}>{topFriend.name}</Text>
                    </View>
                  </View>

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

                  <View style={styles.chartWrapper}>
                    <LineChart
                      data={chartDataMy.map(d => ({ ...d, value: Math.max(0, d.value - yAxisConfig.min) }))}
                      data2={chartDataFriend.map(d => ({ ...d, value: Math.max(0, d.value - yAxisConfig.min) }))}
                      color1="#39FF14"
                      color2="#00FFFF"
                      thickness={3}
                      dataPointsColor1="#FFFFFF"
                      dataPointsColor2="#FFFFFF"
                      textColor="#A0A0A0"
                      xAxisColor="#333333"
                      yAxisColor="#333333"
                      yAxisTextStyle={{ color: '#A0A0A0', fontSize: 10 }}
                      xAxisLabelTextStyle={{ color: '#A0A0A0', fontSize: 10, textAlign: 'center' }}
                      rulesColor="#1A1A1A"
                      hideRules
                      width={Dimensions.get('window').width - 138}
                      height={180}
                      isAnimated
                      noOfSections={yAxisConfig.noOfSections}
                      maxValue={yAxisConfig.range}
                      stepValue={yAxisConfig.step}
                      yAxisLabelTexts={yAxisLabelTexts}
                      yAxisLabelWidth={50}
                      spacing={(Dimensions.get('window').width - 178) / Math.max(1, chartDataMy.length - 1)}
                      initialSpacing={20}
                      endSpacing={20}
                    />
                  </View>
                </>
              )}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 40 }]}>Global Users</Text>
            {isLoading && globalUsers.length === 0 ? (
              <ActivityIndicator color="#39FF14" />
            ) : (
              globalUsers.filter(user => user && user.id).map(user => renderGlobalUser({ item: user }))
            )}
            {globalUsers.length === 0 && !isLoading && (
              <Text style={styles.emptyText}>No other users found.</Text>
            )}
          </>
        }
      />
    </View>
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
    paddingBottom: 60,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  requestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  requestName: {
    color: '#FFFFFF',
    fontSize: 16,
    flex: 1,
  },
  requestActions: {
    flexDirection: 'row',
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  acceptBtn: {
    backgroundColor: '#00FFFF',
  },
  acceptText: {
    color: '#000000',
    fontWeight: 'bold',
  },
  declineBtn: {
    backgroundColor: '#FF3B3020',
  },
  declineText: {
    color: '#FF3B30',
    fontWeight: 'bold',
  },
  leaderboardCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    padding: 20,
    borderRadius: 16,
    marginBottom: 12,
  },
  leaderboardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rank: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#555555',
    width: 40,
  },
  rankTop: {
    color: '#FFFFFF',
  },
  playerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  playerWeight: {
    fontSize: 14,
    color: '#A0A0A0',
  },
  leaderboardRight: {
    alignItems: 'flex-end',
  },
  deltaText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  deltaLabel: {
    fontSize: 12,
    color: '#777777',
    marginTop: 2,
  },
  globalUserCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  globalUserName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  addBtn: {
    backgroundColor: '#00FFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 14,
  },
  statusBadgeFriends: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusTextFriends: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusBadgePending: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusTextPending: {
    color: '#A0A0A0',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusBadgeIncoming: {
    backgroundColor: '#39FF1420',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusTextIncoming: {
    color: '#39FF14',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#A0A0A0',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
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
    backgroundColor: '#00FFFF',
  },
  horizonText: {
    color: '#A0A0A0',
    fontSize: 14,
    fontWeight: '500',
  },
  horizonTextActive: {
    color: '#000000',
    fontWeight: 'bold',
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingRight: 10,
  },
  chartLegendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  avatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  avatarPlaceholderSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarPlaceholderTextSmall: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  globalUserLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  }
});
