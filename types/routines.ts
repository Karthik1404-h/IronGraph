export type Routine = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

export type RoutineExercise = {
  id: string;
  routine_id: string;
  exercise_id: string;
  order_index: number;
  created_at: string;
};
