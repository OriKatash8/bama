import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/build/react-navigation/native';
import { confirmDialog } from '@utils/confirmDialog';

type Labels = { title: string; message: string; leave: string; stay: string };

/**
 * While `active`, leaving the screen (header back, iOS edge swipe, Android back) asks first.
 * Leave runs `onLeave` (cancel the work) and then lets the navigation through; Stay does
 * nothing. Going to the background is not leaving, so nothing here looks at AppState.
 */
export function useLeaveGuard(active: boolean, labels: Labels, onLeave: () => void) {
  const navigation = useNavigation();
  usePreventRemove(active, ({ data }) => {
    void confirmDialog(labels.title, labels.message, {
      confirm: labels.leave,
      cancel: labels.stay,
      destructive: true,
    }).then((leave) => {
      if (!leave) return;
      onLeave();
      navigation.dispatch(data.action);
    });
  });
}
