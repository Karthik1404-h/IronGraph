# IronGraph Project Analysis

## Overview
IronGraph is a React Native (Expo) social fitness and weight tracking platform. It focuses heavily on a dark "cyberpunk" aesthetic, real-time social leaderboards, and high-performance charting using `react-native-gifted-charts`.

## 🎨 Theme & Aesthetic Quirks
- **Cyberpunk Dark Mode**: The app utilizes strict dark mode tokens. There is no light mode.
  - **Backgrounds**: `#0A0A0A` (App Background), `#1A1A1A` (Cards/Primary Containers), `#141414` (Modals/Secondary Containers).
  - **Borders**: Subtle dark borders like `#1E1E1E`, `#222222`, and `#2A2A2A` are used to separate elements without relying on heavy shadows.
- **Neon Accents**: 
  - **Neon Green (`#39FF14`)**: The primary brand color. Used for the user's data lines in charts, active states, "Add Workout" buttons, positive weight loss indicators, and the timer.
  - **Electric Blue (`#00FFFF`)**: Secondary accent. Used for "Accept" friend request buttons and the #1 Top Friend's line chart.
  - **Red (`#FF3B30`)**: Used for declining friend requests and indicating weight *gain* (since losing weight is treated as a positive delta in the UI).
- **Text Styling**: Uses stark white (`#FFFFFF`) for primary text and various shades of grey (`#888888`, `#A0A0A0`, `#AAAAAA`) for subtitles and meta-information.
- **Micro-interactions**: Uses `Pressable` extensively with ternary styling architectures (e.g., `style={({ pressed }) => pressed ? [styles.btn, styles.pressed] : styles.btn}`) to avoid Android transparency bugs and provide tactile feedback (often `opacity: 0.7` or `transform: [{ scale: 0.98 }]`).

## 🧠 Terminology & Quirks
- **House**: The dashboard/home screen is sometimes playfully referred to as the "House" (e.g., the `Return to House` button at the end of a workout).
- **Dual-Input Weight System**: In `workout.tsx`, weight logging isn't just a text input. It features a text input paired with a "▼" dropdown button that opens a modal with a grid of `STANDARD_WEIGHTS` (e.g., 2.5, 5, 10, 20) for rapid logging.
- **Head-to-Head Charting**: The social page features a combined `LineChart` that compares the current user (`#39FF14`) directly against their `#1 Top Friend` (`#00FFFF`). The Y-Axis dynamically calculates shared boundaries using a custom `niceNum` mathematical function to ensure lines never touch the top or bottom edges.
- **Time Horizons**: Charts can be toggled between 'Daily', 'Weekly', 'Monthly', and 'Yearly'.
- **Categories**: Workouts and exercises are strictly categorized into `'Gym'` (weights/cables) and `'Calisthenics'` (bodyweight).

## 🗄️ Database & Backend Architecture (Supabase)
The app uses a relational PostgreSQL schema with Row Level Security (RLS) heavily enforced.
1. **`auth.users` to `public.profiles` Syncing**: A Postgres trigger (`handle_new_user()`) automatically creates a profile when a user signs up. It auto-generates a `username` using their email prefix and a random MD5 hash.
2. **Friendships Engine**: 
   - Uses a two-way `user_id` and `friend_id` schema with statuses: `'pending'` and `'accepted'`.
   - The UI parses this into dynamic states: `pending_outgoing`, `pending_incoming` (shown as "Review"), `friends`, and `none` (shown as "Add").
3. **Workout Logging**:
   - `workouts`: Contains `start_time` and `end_time`.
   - `workout_sets`: Belongs to a workout and an exercise. Contains `weight` and `reps`.
   - **PR Tracking**: When a workout is finished, the app calculates Personal Records (PRs) by querying historical `workout_sets` for that specific exercise to see if the user lifted a heavier weight.

## 🏗️ Folder Structure
- `/app`: Expo Router file-based navigation.
  - `/app/(tabs)`: Contains `index.tsx` (Dashboard), `social.tsx` (Leaderboard/Friends), and `weight.tsx` (Weight Logger).
  - `/app/workout.tsx`: A massive full-screen modal (presentation: 'fullScreenModal') that handles active session tracking, timers, set logging, and PR celebrations.
  - `/app/exercises.tsx`: A modal for managing the exercise library.
- `/lib/supabase.ts`: Supabase client initialization.
- `/supabase_*.sql`: Raw SQL migrations located in the root directory for easy deployment.

## 📝 Future Modification Guidelines
- When adding new UI elements, always adhere strictly to the `#0A0A0A` / `#1A1A1A` / `#39FF14` color palette. Do not introduce light-mode styles.
- Always implement `Pressable` with the strict `({ pressed })` callback for styles.
- When querying Supabase, wrap operations in `isMounted` checks (especially in `useFocusEffect`) to prevent race conditions during auth shifts.
- Any chart modifications must respect the dynamic Y-Axis padding logic to maintain the premium feel.
