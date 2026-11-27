import Simulator from '@/components/Simulator';
import { decrypt } from '@/lib/crypto';
import { getUser } from '@/lib/supabase';
import { isUuid, parseScenario, type ScenarioInput } from '@/lib/validate';
import { saveScenario, signOut } from './actions';

export default async function Page({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  const { sb, user } = await getUser();
  const { scenario } = await searchParams;

  let initial: ScenarioInput | undefined;
  if (sb && user && isUuid(scenario)) {
    const { data } = await sb.from('saved_scenarios')
      .select('name, postcode, region, species_ids, lifestyle, what_ifs, assumptions').eq('id', scenario).maybeSingle();
    if (data) {
      try {
        // Re-validate on the way out too, so a bad row can never reach the UI.
        const parsed = parseScenario({ ...data, postcode: decrypt(data.postcode, user.id) });
        if (parsed.ok) initial = parsed.value;
      } catch {
        console.error('could not decrypt scenario', scenario);
      }
    }
  }

  return (
    <Simulator
      key={scenario ?? 'new'}
      account={sb ? { email: user?.email ?? null } : null}
      initial={initial}
      onSave={user ? saveScenario : undefined}
      onSignOut={user ? signOut : undefined}
    />
  );
}
