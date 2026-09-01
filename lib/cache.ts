import AsyncStorage from '@react-native-async-storage/async-storage';

export const cacheData = async <T>(key: string, value: T): Promise<void> => {
  try {
    const jsonValue = JSON.stringify(value);
    await AsyncStorage.setItem(key, jsonValue);
  } catch (e) {
    // Save error silently
    console.error('Error caching data', e);
  }
};

export const getCachedData = async <T>(key: string): Promise<T | null> => {
  try {
    const jsonValue = await AsyncStorage.getItem(key);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (e) {
    // Read error silently
    console.error('Error reading cache data', e);
    return null;
  }
};
