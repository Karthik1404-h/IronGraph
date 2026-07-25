import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);

  const handleAuth = async () => {
    if (!email || !password || (!isLogin && !username)) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username },
          },
        });
        if (error) throw error;
        
        if (data?.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert({ id: data.user.id, username, updated_at: new Date() });
          
          if (profileError) {
             console.log('Profile insert error:', profileError);
          }
        }
      }
    } catch (error: any) {
      Alert.alert('Authentication Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 justify-center px-6 bg-slate-900">
      <View className="mb-10">
        <Text className="text-4xl font-bold text-white text-center mb-2">
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </Text>
        <Text className="text-slate-400 text-center text-lg">
          {isLogin ? 'Sign in to continue' : 'Sign up to get started'}
        </Text>
      </View>

      <View className="space-y-4 gap-y-4">
        {!isLogin && (
          <View>
            <Text className="text-slate-300 mb-1 ml-1 font-medium">Username</Text>
            <TextInput
              className="bg-slate-800 text-white px-4 py-4 rounded-xl border border-slate-700"
              placeholder="Username"
              placeholderTextColor="#94a3b8"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
          </View>
        )}

        <View>
          <Text className="text-slate-300 mb-1 ml-1 font-medium">Email</Text>
          <TextInput
            className="bg-slate-800 text-white px-4 py-4 rounded-xl border border-slate-700"
            placeholder="Email address"
            placeholderTextColor="#94a3b8"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View>
          <Text className="text-slate-300 mb-1 ml-1 font-medium">Password</Text>
          <TextInput
            className="bg-slate-800 text-white px-4 py-4 rounded-xl border border-slate-700"
            placeholder="Password"
            placeholderTextColor="#94a3b8"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity 
          className="bg-blue-600 rounded-xl py-4 mt-6 shadow-lg shadow-blue-600/30"
          onPress={handleAuth}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-center font-bold text-lg">
              {isLogin ? 'Sign In' : 'Sign Up'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          className="mt-6 py-2"
          onPress={() => setIsLogin(!isLogin)}
        >
          <Text className="text-slate-400 text-center text-base">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <Text className="text-blue-400 font-bold">
              {isLogin ? "Sign Up" : "Sign In"}
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
