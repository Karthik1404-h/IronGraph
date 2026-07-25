-- ====================================================================
-- FIX: Allow Friends & Leaderboard to read each other's weight logs
-- ====================================================================

-- 1. Ensure Row Level Security is enabled on weight_logs
ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing restrictive SELECT policies on weight_logs
DROP POLICY IF EXISTS "Users can view their own weight logs" ON public.weight_logs;
DROP POLICY IF EXISTS "Users can only read their own weight logs" ON public.weight_logs;
DROP POLICY IF EXISTS "Users can read own weight logs" ON public.weight_logs;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.weight_logs;
DROP POLICY IF EXISTS "Anyone can view weight logs" ON public.weight_logs;
DROP POLICY IF EXISTS "Users can view own and friends weight logs" ON public.weight_logs;

-- 3. Create a policy allowing authenticated users (friends & leaderboard) to read weight logs
CREATE POLICY "Anyone can view weight logs" 
ON public.weight_logs 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- 4. Ensure Users can ONLY Insert, Update, and Delete their OWN weight logs
DROP POLICY IF EXISTS "Users can insert own weight logs" ON public.weight_logs;
CREATE POLICY "Users can insert own weight logs" 
ON public.weight_logs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own weight logs" ON public.weight_logs;
CREATE POLICY "Users can update own weight logs" 
ON public.weight_logs 
FOR UPDATE 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own weight logs" ON public.weight_logs;
CREATE POLICY "Users can delete own weight logs" 
ON public.weight_logs 
FOR DELETE 
USING (auth.uid() = user_id);

-- ====================================================================
-- 5. Also ensure friendships table allows proper reading and updating
-- ====================================================================
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own friendships." ON public.friendships;
CREATE POLICY "Users can view their own friendships." 
ON public.friendships 
FOR SELECT 
USING (auth.uid() = user_id OR auth.uid() = friend_id);

DROP POLICY IF EXISTS "Users can create friendships." ON public.friendships;
CREATE POLICY "Users can create friendships." 
ON public.friendships 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their friendships." ON public.friendships;
CREATE POLICY "Users can update their friendships." 
ON public.friendships 
FOR UPDATE 
USING (auth.uid() = user_id OR auth.uid() = friend_id);

DROP POLICY IF EXISTS "Users can delete their friendships." ON public.friendships;
CREATE POLICY "Users can delete their friendships." 
ON public.friendships 
FOR DELETE 
USING (auth.uid() = user_id OR auth.uid() = friend_id);
