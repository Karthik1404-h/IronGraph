import React, { useState, useCallback, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, Alert, FlatList, ActivityIndicator, Image, TextInput } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';

type Profile = {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
};

type FriendItem = {
  friendshipId: string;
  profile: Profile;
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isUploading, setIsUploading] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setFriends([]);
        setProfile(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (profileData) {
        setProfile(profileData);
        setEditNameValue(profileData.display_name || profileData.email || '');
      }

      const { data: fData, error: fErr } = await supabase
        .from('friendships')
        .select('*')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
        .eq('status', 'accepted');
        
      if (fErr) throw fErr;
      
      const { data: profiles, error: pErr } = await supabase.from('profiles').select('*');
      if (pErr) throw pErr;
      
      const profilesMap = new Map(profiles.map(p => [p.id, p]));
      
      const accepted: FriendItem[] = (fData || []).map(f => {
        const friendId = f.user_id === user.id ? f.friend_id : f.user_id;
        return {
           friendshipId: f.id,
           profile: profilesMap.get(friendId)!
        };
      }).filter(f => f.profile);
      
      setFriends(accepted);
    } catch(err: any) {
      console.error(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        uploadAvatar(result.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Image Picker Error', err.message);
    }
  };

  const uploadAvatar = async (uri: string) => {
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const fileExt = uri.split('.').pop() || 'jpg';
      const fileName = `${user.id}/avatar_${Date.now()}.${fileExt}`;

      const response = await fetch(uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, {
          contentType: `image/${fileExt}`,
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: data.publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;
      
      fetchData();
    } catch (error: any) {
      Alert.alert('Upload Error', error.message || 'Failed to upload avatar.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveName = async () => {
    if (!profile) return;
    if (!editNameValue.trim()) {
      Alert.alert('Invalid Name', 'Username cannot be empty.');
      return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: editNameValue.trim() })
        .eq('id', profile.id);

      if (error) throw error;
      setIsEditingName(false);
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleRemoveFriend = (friendshipId: string, name: string) => {
    Alert.alert(
      "Remove Friend",
      `Are you sure you want to remove ${name} from your friends?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove", 
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('friendships')
                .delete()
                .eq('id', friendshipId);
              if (error) throw error;
              fetchData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to remove friend.');
            }
          }
        }
      ]
    );
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        Alert.alert('Error', error.message);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to log out');
    }
  };

  const renderFriend = ({ item }: { item: FriendItem }) => (
    <View style={styles.friendCard}>
      <Text style={styles.friendName}>{item.profile.display_name || item.profile.email}</Text>
      <Pressable 
        onPress={() => handleRemoveFriend(item.friendshipId, item.profile.display_name || item.profile.email)}
        style={({ pressed }) => pressed ? [styles.removeBtn, { opacity: 0.7 }] : styles.removeBtn}
      >
        <Text style={styles.removeBtnText}>Remove</Text>
      </Pressable>
    </View>
  );

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      data={friends}
      keyExtractor={(item) => item.friendshipId}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <>
          <View style={styles.profileHeader}>
            <Pressable onPress={handlePickImage} style={styles.avatarContainer}>
              {isUploading ? (
                <ActivityIndicator color="#39FF14" />
              ) : profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarPlaceholderText}>
                    {profile?.display_name?.charAt(0).toUpperCase() || profile?.email?.charAt(0).toUpperCase() || '?'}
                  </Text>
                </View>
              )}
              <View style={styles.avatarEditIcon}>
                <Text style={styles.avatarEditText}>+</Text>
              </View>
            </Pressable>

            {isEditingName ? (
              <View style={styles.editNameContainer}>
                <TextInput
                  style={styles.nameInput}
                  value={editNameValue}
                  onChangeText={setEditNameValue}
                  placeholder="Enter your name"
                  placeholderTextColor="#777"
                  autoFocus
                />
                <View style={styles.editNameActions}>
                  <Pressable onPress={handleSaveName} style={styles.saveNameBtn}>
                    <Text style={styles.saveNameText}>Save</Text>
                  </Pressable>
                  <Pressable onPress={() => { setIsEditingName(false); setEditNameValue(profile?.display_name || ''); }} style={styles.cancelNameBtn}>
                    <Text style={styles.cancelNameText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.nameContainer}>
                <Text style={styles.userName}>{profile?.display_name || profile?.email}</Text>
                <Pressable onPress={() => setIsEditingName(true)} style={styles.editIconBtn}>
                  <Text style={styles.editIconText}>✎ Edit</Text>
                </Pressable>
              </View>
            )}
          </View>

          <Text style={styles.sectionTitle}>My Friends</Text>
        </>
      }
      renderItem={renderFriend}
      ListEmptyComponent={
        isLoading ? (
           <ActivityIndicator color="#39FF14" style={{ marginTop: 20 }} />
        ) : (
           <Text style={styles.emptyText}>You don't have any friends yet.</Text>
        )
      }
      ListFooterComponent={
        <Pressable 
          style={({ pressed }) => pressed ? [styles.logoutButton, styles.logoutButtonPressed] : styles.logoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </Pressable>
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
  profileHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#39FF14',
    position: 'relative',
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 40,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  avatarEditIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#39FF14',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0A0A0A',
  },
  avatarEditText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
    marginTop: -2,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginRight: 8,
  },
  editIconBtn: {
    padding: 4,
  },
  editIconText: {
    color: '#A0A0A0',
    fontSize: 14,
  },
  editNameContainer: {
    width: '100%',
    alignItems: 'center',
  },
  nameInput: {
    backgroundColor: '#1A1A1A',
    color: '#FFFFFF',
    fontSize: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    width: '80%',
    marginBottom: 12,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  editNameActions: {
    flexDirection: 'row',
    gap: 12,
  },
  saveNameBtn: {
    backgroundColor: '#39FF14',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveNameText: {
    color: '#000',
    fontWeight: 'bold',
  },
  cancelNameBtn: {
    backgroundColor: '#333',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelNameText: {
    color: '#FFF',
    fontWeight: 'bold',
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  friendCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  friendName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  removeBtn: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  removeBtnText: {
    color: '#FF3B30',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyText: {
    color: '#A0A0A0',
    textAlign: 'center',
    marginBottom: 32,
    marginTop: 10,
    fontSize: 16,
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    height: 52,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
  },
  logoutButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
