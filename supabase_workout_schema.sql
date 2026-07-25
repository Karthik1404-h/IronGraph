-- ====================================================================
-- IronGraph: Workout Logging Schema
-- Run this in your Supabase SQL Editor
-- ====================================================================

-- 1. EXERCISES TABLE — User's personal exercise library
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.exercises (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Gym', 'Calisthenics')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own exercises" ON public.exercises;
CREATE POLICY "Users can view own exercises"
ON public.exercises FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own exercises" ON public.exercises;
CREATE POLICY "Users can insert own exercises"
ON public.exercises FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own exercises" ON public.exercises;
CREATE POLICY "Users can update own exercises"
ON public.exercises FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own exercises" ON public.exercises;
CREATE POLICY "Users can delete own exercises"
ON public.exercises FOR DELETE
USING (auth.uid() = user_id);

-- 2. WORKOUTS TABLE — Workout session metadata
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.workouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  start_time TIMESTAMPTZ DEFAULT now(),
  end_time TIMESTAMPTZ
);

ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own workouts" ON public.workouts;
CREATE POLICY "Users can view own workouts"
ON public.workouts FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own workouts" ON public.workouts;
CREATE POLICY "Users can insert own workouts"
ON public.workouts FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own workouts" ON public.workouts;
CREATE POLICY "Users can update own workouts"
ON public.workouts FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own workouts" ON public.workouts;
CREATE POLICY "Users can delete own workouts"
ON public.workouts FOR DELETE
USING (auth.uid() = user_id);

-- 3. WORKOUT_SETS TABLE — Individual set logs per exercise per workout
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.workout_sets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workout_id UUID REFERENCES public.workouts(id) ON DELETE CASCADE NOT NULL,
  exercise_id UUID REFERENCES public.exercises(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  set_number INTEGER NOT NULL,
  weight NUMERIC DEFAULT 0,
  reps INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own workout_sets" ON public.workout_sets;
CREATE POLICY "Users can view own workout_sets"
ON public.workout_sets FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own workout_sets" ON public.workout_sets;
CREATE POLICY "Users can insert own workout_sets"
ON public.workout_sets FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own workout_sets" ON public.workout_sets;
CREATE POLICY "Users can update own workout_sets"
ON public.workout_sets FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own workout_sets" ON public.workout_sets;
CREATE POLICY "Users can delete own workout_sets"
ON public.workout_sets FOR DELETE
USING (auth.uid() = user_id);

-- 4. INDEXES for performance
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_exercises_user_id ON public.exercises(user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_user_id ON public.workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_sets_workout_id ON public.workout_sets(workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise_id ON public.workout_sets(exercise_id);
CREATE INDEX IF NOT EXISTS idx_workout_sets_user_id ON public.workout_sets(user_id);

-- 5. PRE-POPULATE common exercises for new users (optional seed)
-- These will be inserted per-user when they first open the workout screen.
-- This section is handled in the app code, not here.
-- ====================================================================

SELECT 'Workout schema created successfully!' AS status;
