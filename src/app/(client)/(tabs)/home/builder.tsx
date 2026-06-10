import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@components/layout/Screen';
import { CategoryAccordion, CrewBasket } from '@features/crew/components';
import { useCrewBuilder } from '@features/crew/hooks';

export default function BuilderScreen() {
  const { slots, totalCount, addSlot } = useCrewBuilder();

  function handleNext() {
    router.push({
      pathname: '/(client)/(tabs)/home/details',
      params: { slots: JSON.stringify(slots) },
    });
  }

  return (
    <Screen scrollable={false}>
      <View style={styles.content}>
        <ScrollView style={styles.scroll}>
          <CategoryAccordion slots={slots} onSelectSubcategory={addSlot} />
        </ScrollView>
        <CrewBasket totalCount={totalCount} onNext={handleNext} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  scroll: { flex: 1 },
});
