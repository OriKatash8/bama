import { useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { auth } from '@core/firebase/config';
import { getOrCreateDM } from '../services/chatService';

export function useStartChat() {
  const router = useRouter();
  const segments = useSegments();
  const [isLoading, setIsLoading] = useState(false);

  async function startChat(professionalId: string): Promise<void> {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;
    setIsLoading(true);
    try {
      const chatId = await getOrCreateDM(currentUserId, professionalId);
      router.push(`/${segments[0]}/(tabs)/chats/${chatId}` as any);
    } finally {
      setIsLoading(false);
    }
  }

  return { startChat, isLoading };
}
