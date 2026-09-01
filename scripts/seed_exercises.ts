import exercisesData from '../data/exercises.json';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
async function seed() {
  console.log(`Starting to seed ${exercisesData.length} exercises...`);

  try {
    const { data: existingData, error: fetchErr } = await supabase
      .from('exercises')
      .select('name')
      .is('user_id', null);

    if (fetchErr) throw fetchErr;

    const existingNames = new Set(existingData?.map(e => e.name) || []);

    const formattedData = exercisesData
      .filter((ex: any) => !existingNames.has(ex.name))
      .map((ex: any) => ({
        name: ex.name,
        category: ex.category,
        target: ex.target,
        muscle_group: ex.muscle_group,
        equipment: ex.equipment
      }));

    if (formattedData.length === 0) {
      console.log('All exercises are already seeded!');
      return;
    }

    const batchSize = 100;
    let successCount = 0;

    for (let i = 0; i < formattedData.length; i += batchSize) {
      const batch = formattedData.slice(i, i + batchSize);

      const { error } = await supabase
        .from('exercises')
        .insert(batch);

      if (error) {
        console.error(`Error inserting batch ${i} - ${i + batchSize}:`, error.message);
      } else {
        successCount += batch.length;
        console.log(`Inserted batch ${i} to ${i + batch.length}`);
      }
    }

    console.log(`Successfully seeded ${successCount} exercises!`);
  } catch (err) {
    console.error('Fatal error during seeding:', err);
  }
}

seed();
