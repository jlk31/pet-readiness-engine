import { redirect } from 'next/navigation';
import { deleteScenario } from '../actions';
import { SPECIES } from '@/lib/data';
import { getUser } from '@/lib/supabase';

export default async function ScenariosPage() {
  const { sb, user } = await getUser();
  if (!sb || !user) redirect('/login');
  // Only the columns this page shows; the encrypted postcode and user_id stay on the server.
  const { data } = await sb.from('saved_scenarios').select('id, name, species_ids, created_at').order('created_at', { ascending: false });
  const names = Object.fromEntries(SPECIES.map((s) => [s.id, s.name]));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 py-12 pl-[max(16px,env(safe-area-inset-left,0px))] pr-[max(16px,env(safe-area-inset-right,0px))]">
      <a href="/" className="text-sm font-semibold text-accent">← Back to the simulator</a>
      <h1 className="font-display text-3xl font-extrabold">My scenarios</h1>
      {!data?.length ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">
          No saved scenarios yet. Set up a comparison in the simulator and press Save.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
              <div className="min-w-0">
                <a href={`/?scenario=${s.id}`} className="font-semibold underline-offset-2 hover:underline">{s.name}</a>
                <p className="text-sm text-muted">
                  {(s.species_ids as string[]).map((id) => names[id] ?? id).join(', ')} · saved {new Date(s.created_at).toLocaleDateString('en-GB')}
                </p>
              </div>
              <form action={deleteScenario}>
                <input type="hidden" name="id" value={s.id} />
                <button className="rounded-md border border-line px-3 py-1.5 text-sm text-bad hover:border-bad">Delete</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
