import { useUiStore } from '../uiStore';

beforeEach(() => {
  useUiStore.setState({ isLoading: false, toasts: [], isNewProfessional: false });
});

describe('uiStore', () => {
  it('has correct initial state', () => {
    const state = useUiStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.toasts).toHaveLength(0);
  });

  it('setLoading updates loading state', () => {
    useUiStore.getState().setLoading(true);
    expect(useUiStore.getState().isLoading).toBe(true);
  });

  it('showToast adds a toast with default type info', () => {
    useUiStore.getState().showToast('Hello');
    const { toasts } = useUiStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('Hello');
    expect(toasts[0].type).toBe('info');
    expect(toasts[0].id).toBeDefined();
  });

  it('showToast accepts explicit type', () => {
    useUiStore.getState().showToast('Saved', 'success');
    expect(useUiStore.getState().toasts[0].type).toBe('success');
  });

  it('dismissToast removes a toast by id', () => {
    useUiStore.getState().showToast('Hello');
    const id = useUiStore.getState().toasts[0].id;
    useUiStore.getState().dismissToast(id);
    expect(useUiStore.getState().toasts).toHaveLength(0);
  });

  it('dismissToast does not affect other toasts', () => {
    useUiStore.getState().showToast('First');
    useUiStore.getState().showToast('Second');
    const firstId = useUiStore.getState().toasts[0].id;
    useUiStore.getState().dismissToast(firstId);
    expect(useUiStore.getState().toasts).toHaveLength(1);
    expect(useUiStore.getState().toasts[0].message).toBe('Second');
  });
});

describe('isNewProfessional', () => {
  it('defaults to false', () => {
    expect(useUiStore.getState().isNewProfessional).toBe(false);
  });

  it('setNewProfessional sets it to true', () => {
    useUiStore.getState().setNewProfessional(true);
    expect(useUiStore.getState().isNewProfessional).toBe(true);
  });

  it('setNewProfessional sets it back to false', () => {
    useUiStore.getState().setNewProfessional(true);
    useUiStore.getState().setNewProfessional(false);
    expect(useUiStore.getState().isNewProfessional).toBe(false);
  });
});
