import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { ProjectDetailsForm } from '@features/crew/components';
import { useProjectRequests } from '@features/crew/hooks';
import { useUiStore } from '@core/stores/uiStore';
import type { CrewRequestSlot } from '@core/types/project';
import { useState } from 'react';

export default function DetailsScreen() {
  const { slots: slotsParam } = useLocalSearchParams<{ slots: string }>();
  let slots: CrewRequestSlot[] = [];
  try {
    if (slotsParam) slots = JSON.parse(slotsParam);
  } catch {
    // malformed param — fall back to empty basket
  }
  const { submit } = useProjectRequests();
  const { showToast } = useUiStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(details: {
    description: string;
    date: string;
    location: string;
    budget: number;
  }) {
    setIsSubmitting(true);
    try {
      await submit(slots, { ...details, budget: String(details.budget) });
      router.dismiss(2);
    } catch (e: any) {
      showToast(e.message ?? 'Failed to submit request', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen scrollable={false}>
      <ProjectDetailsForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
    </Screen>
  );
}
