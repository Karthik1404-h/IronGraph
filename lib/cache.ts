import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const jsonValue = await AsyncStorage.getItem(key);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (e) {
    console.error('Error reading cache for key:', key, e);
    return null;
  }
}

export async function cacheData<T>(key: string, value: T): Promise<void> {
  try {
    const jsonValue = JSON.stringify(value);
    await AsyncStorage.setItem(key, jsonValue);
  } catch (e) {
    console.error('Error setting cache for key:', key, e);
  }
}
